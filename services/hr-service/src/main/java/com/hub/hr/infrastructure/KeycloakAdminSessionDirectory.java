package com.hub.hr.infrastructure;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.hub.hr.domain.identity.IdentityUnavailableException;
import com.hub.hr.domain.session.SessionDirectory;
import com.hub.hr.domain.session.UserSession;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Real session adapter: the Keycloak Admin REST API driven by the same
 * least-privilege client-credentials service account as
 * {@link KeycloakAdminIdentityProvisioner}. Config-gated
 * (hub.identity.keycloak.enabled=true) and deliberately dependency-light (Spring
 * {@link RestClient}, no keycloak-admin-client) for exact consistency with the
 * identity adapter — it reuses the same {@code hub.identity.keycloak.*} config so
 * no new configuration surface is introduced.
 *
 * <p>Reads {@code GET /users/{id}/sessions} and terminates one session with
 * {@code DELETE /sessions/{sessionId}}. Killing every session (force logout +
 * refresh revocation) stays on {@link KeycloakAdminIdentityProvisioner#logoutAllSessions}
 * and is not duplicated here.
 */
@Component
@ConditionalOnProperty(name = "hub.identity.keycloak.enabled", havingValue = "true")
public class KeycloakAdminSessionDirectory implements SessionDirectory {

    private final RestClient http;
    private final String serverUrl;
    private final String realm;
    private final String tokenRealm;
    private final String clientId;
    private final String clientSecret;

    public KeycloakAdminSessionDirectory(
            @Value("${hub.identity.keycloak.server-url}") String serverUrl,
            @Value("${hub.identity.keycloak.realm}") String realm,
            @Value("${hub.identity.keycloak.token-realm:employee-hub}") String tokenRealm,
            @Value("${hub.identity.keycloak.client-id}") String clientId,
            @Value("${hub.identity.keycloak.client-secret}") String clientSecret) {
        this.http = RestClient.create();
        this.serverUrl = serverUrl.replaceAll("/+$", "");
        this.realm = realm;
        this.tokenRealm = tokenRealm;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
    }

    private String adminBase() {
        return serverUrl + "/admin/realms/" + realm;
    }

    private String bearer() {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "client_credentials");
        form.add("client_id", clientId);
        form.add("client_secret", clientSecret);
        try {
            Map<?, ?> token = http.post()
                    .uri(serverUrl + "/realms/" + tokenRealm + "/protocol/openid-connect/token")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(Map.class);
            if (token == null || token.get("access_token") == null) {
                throw new IdentityUnavailableException("Keycloak returned no access token");
            }
            return (String) token.get("access_token");
        } catch (RestClientException e) {
            throw new IdentityUnavailableException("cannot obtain Keycloak admin token", e);
        }
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<UserSession> sessionsOf(UUID keycloakId) {
        String token = bearer();
        try {
            List<Map<String, Object>> body = http.get()
                    .uri(adminBase() + "/users/" + keycloakId + "/sessions")
                    .header("Authorization", "Bearer " + token)
                    .retrieve()
                    .body(List.class);
            if (body == null) {
                return List.of();
            }
            List<UserSession> sessions = new ArrayList<>(body.size());
            for (Map<String, Object> representation : body) {
                sessions.add(toSession(representation));
            }
            return sessions;
        } catch (RestClientException e) {
            throw new IdentityUnavailableException("failed to list sessions for " + keycloakId, e);
        }
    }

    @Override
    public void terminate(String sessionId) {
        String token = bearer();
        try {
            http.delete()
                    .uri(adminBase() + "/sessions/" + sessionId)
                    .header("Authorization", "Bearer " + token)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException e) {
            throw new IdentityUnavailableException("failed to terminate session " + sessionId, e);
        }
    }

    /** Map one UserSessionRepresentation; instants arrive as epoch millis. */
    @SuppressWarnings("unchecked")
    private static UserSession toSession(Map<String, Object> representation) {
        Object clientsValue = representation.get("clients");
        List<String> clients = (clientsValue instanceof Map<?, ?> map)
                ? map.values().stream().map(String::valueOf).toList()
                : List.of();
        return new UserSession(
                String.valueOf(representation.get("id")),
                asUuid(representation.get("userId")),
                (String) representation.get("ipAddress"),
                asInstant(representation.get("start")),
                asInstant(representation.get("lastAccess")),
                asInstant(representation.get("expires")),
                clients);
    }

    private static UUID asUuid(Object value) {
        return value == null ? null : UUID.fromString(String.valueOf(value));
    }

    private static Instant asInstant(Object epochMillis) {
        return epochMillis instanceof Number number ? Instant.ofEpochMilli(number.longValue()) : null;
    }
}
