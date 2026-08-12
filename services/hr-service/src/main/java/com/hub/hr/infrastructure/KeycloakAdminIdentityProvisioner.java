package com.hub.hr.infrastructure;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.hub.hr.domain.identity.ActivationDeliveryException;
import com.hub.hr.domain.identity.IdentityProvisioner;
import com.hub.hr.domain.identity.IdentityUnavailableException;
import com.hub.hr.domain.identity.NewIdentity;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Real identity adapter (Part 1/P3.1): the Keycloak Admin REST API driven by a
 * least-privilege client-credentials service account. Config-gated
 * (hub.identity.keycloak.enabled=true) because it needs a running Keycloak — the
 * default build and H2 tests use {@link LoggingIdentityProvisioner}.
 *
 * <p>The service account is {@code hr-provisioner}, declared in the
 * {@code employee-hub} realm by {@code keycloak-config/realm-employee-hub.json}
 * and holding exactly three {@code realm-management} roles — {@code manage-users},
 * {@code view-users}, {@code view-realm}. Every call below was verified against
 * Keycloak 26.3 with only those roles; realm updates, client creation and access
 * to other realms are refused with 403, and the client has no {@code hub-api}
 * scope, so its token cannot call this platform's own APIs.
 *
 * <p>Kept deliberately dependency-light (Spring {@link RestClient}, no
 * keycloak-admin-client) so it adds no version-management surface to the reactor.
 */
@Component
@ConditionalOnProperty(name = "hub.identity.keycloak.enabled", havingValue = "true")
public class KeycloakAdminIdentityProvisioner implements IdentityProvisioner {

    private final RestClient http;
    private final String serverUrl;
    private final String realm;
    private final String tokenRealm;
    private final String clientId;
    private final String clientSecret;
    private final String activationClientId;
    private final String activationRedirectUri;
    private final int activationLifespanSeconds;

    @SuppressWarnings("checkstyle:ParameterNumber")
    public KeycloakAdminIdentityProvisioner(
            @Value("${hub.identity.keycloak.server-url}") String serverUrl,
            @Value("${hub.identity.keycloak.realm}") String realm,
            @Value("${hub.identity.keycloak.token-realm:employee-hub}") String tokenRealm,
            @Value("${hub.identity.keycloak.client-id}") String clientId,
            @Value("${hub.identity.keycloak.client-secret}") String clientSecret,
            @Value("${hub.identity.activation.client-id:web-portal}") String activationClientId,
            @Value("${hub.identity.activation.redirect-uri:}") String activationRedirectUri,
            @Value("${hub.identity.activation.lifespan-seconds:43200}") int activationLifespanSeconds) {
        this.http = RestClient.create();
        this.serverUrl = serverUrl.replaceAll("/+$", "");
        this.realm = realm;
        this.tokenRealm = tokenRealm;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.activationClientId = activationClientId;
        this.activationRedirectUri = activationRedirectUri;
        this.activationLifespanSeconds = activationLifespanSeconds;
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
    public UUID createUser(NewIdentity identity) {
        String token = bearer();
        Map<String, Object> representation = new LinkedHashMap<>(Map.of(
                "username", identity.username(),
                "email", identity.email(),
                "firstName", identity.firstName(),
                "lastName", identity.lastName(),
                "enabled", true,
                "emailVerified", identity.emailVerified(),
                "requiredActions", identity.requirePasswordUpdate()
                        ? List.of("UPDATE_PASSWORD") : List.of()));
        // No "credentials" key at all on the normal path: the account exists with
        // no password until the employee sets one through Keycloak's own form.
        if (identity.hasCredential()) {
            representation.put("credentials", List.of(Map.of(
                    "type", "password",
                    "value", identity.temporaryPassword(),
                    "temporary", true)));
        }
        try {
            URI location = http.post()
                    .uri(adminBase() + "/users")
                    .header("Authorization", "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(representation)
                    .retrieve()
                    .toBodilessEntity()
                    .getHeaders()
                    .getLocation();
            if (location == null) {
                throw new IdentityUnavailableException("Keycloak did not return the created user location");
            }
            String path = location.getPath();
            return UUID.fromString(path.substring(path.lastIndexOf('/') + 1));
        } catch (RestClientException e) {
            throw new IdentityUnavailableException("failed to create Keycloak user " + identity.username(), e);
        }
    }

    @Override
    public Optional<UUID> findAccount(String usernameOrEmail) {
        String token = bearer();
        try {
            // Username first — that is what accounts provisioned here are keyed on
            // — then e-mail, which is what an account created any other way shares
            // with the employee record.
            Optional<UUID> byUsername = searchUsers(token, "username", usernameOrEmail);
            return byUsername.isPresent() ? byUsername : searchUsers(token, "email", usernameOrEmail);
        } catch (RestClientException e) {
            throw new IdentityUnavailableException("failed to look up Keycloak user " + usernameOrEmail, e);
        }
    }

    @SuppressWarnings("unchecked")
    private Optional<UUID> searchUsers(String token, String field, String value) {
        List<Map<String, Object>> found = http.get()
                .uri(UriComponentsBuilder.fromUriString(adminBase() + "/users")
                        .queryParam(field, value)
                        .queryParam("exact", true)
                        .build().toUri())
                .header("Authorization", "Bearer " + token)
                .retrieve()
                .body(List.class);
        if (found == null || found.isEmpty()) {
            return Optional.empty();
        }
        Object id = found.get(0).get("id");
        return id == null ? Optional.empty() : Optional.of(UUID.fromString(id.toString()));
    }

    @Override
    @SuppressWarnings("unchecked")
    public Set<String> realmRolesOf(UUID keycloakId) {
        String token = bearer();
        try {
            List<Map<String, Object>> roles = http.get()
                    .uri(adminBase() + "/users/" + keycloakId + "/role-mappings/realm")
                    .header("Authorization", "Bearer " + token)
                    .retrieve()
                    .body(List.class);
            Set<String> names = new LinkedHashSet<>();
            if (roles != null) {
                for (Map<String, Object> role : roles) {
                    Object name = role.get("name");
                    if (name != null) {
                        names.add(name.toString());
                    }
                }
            }
            return names;
        } catch (RestClientException e) {
            throw new IdentityUnavailableException("failed to read realm roles of " + keycloakId, e);
        }
    }

    @Override
    public void assignRealmRole(UUID keycloakId, String realmRole) {
        String token = bearer();
        try {
            http.post()
                    .uri(adminBase() + "/users/" + keycloakId + "/role-mappings/realm")
                    .header("Authorization", "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(List.of(role(token, realmRole)))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException e) {
            throw new IdentityUnavailableException("failed to assign role " + realmRole + " to " + keycloakId, e);
        }
    }

    @Override
    public void removeRealmRole(UUID keycloakId, String realmRole) {
        String token = bearer();
        try {
            http.method(org.springframework.http.HttpMethod.DELETE)
                    .uri(adminBase() + "/users/" + keycloakId + "/role-mappings/realm")
                    .header("Authorization", "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(List.of(role(token, realmRole)))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException e) {
            throw new IdentityUnavailableException("failed to revoke role " + realmRole + " from " + keycloakId, e);
        }
    }

    /** The role representation Keycloak requires in a role-mapping body. */
    @SuppressWarnings("unchecked")
    private Map<String, Object> role(String token, String realmRole) {
        Map<String, Object> representation = http.get()
                .uri(adminBase() + "/roles/" + realmRole)
                .header("Authorization", "Bearer " + token)
                .retrieve()
                .body(Map.class);
        if (representation == null) {
            throw new IdentityUnavailableException("Keycloak returned no realm role " + realmRole);
        }
        return representation;
    }

    @Override
    public void updateUser(UUID keycloakId, String email, String firstName, String lastName, boolean enabled) {
        put(keycloakId, Map.of(
                "email", email,
                "firstName", firstName,
                "lastName", lastName,
                "enabled", enabled));
    }

    @Override
    public void setEnabled(UUID keycloakId, boolean enabled) {
        put(keycloakId, Map.of("enabled", enabled));
    }

    @Override
    @SuppressWarnings("unchecked")
    public void addRequiredAction(UUID keycloakId, String action) {
        String token = bearer();
        try {
            Map<String, Object> user = http.get()
                    .uri(adminBase() + "/users/" + keycloakId)
                    .header("Authorization", "Bearer " + token)
                    .retrieve()
                    .body(Map.class);
            List<String> pending = new ArrayList<>();
            if (user != null && user.get("requiredActions") instanceof List<?> existing) {
                existing.forEach(a -> pending.add(a.toString()));
            }
            if (pending.contains(action)) {
                return; // already pending — adding it twice is not an operation
            }
            pending.add(action);
            put(keycloakId, Map.of("requiredActions", pending));
        } catch (RestClientException e) {
            throw new IdentityUnavailableException("failed to add required action " + action + " to " + keycloakId, e);
        }
    }

    private void put(UUID keycloakId, Map<String, Object> representation) {
        String token = bearer();
        try {
            http.put()
                    .uri(adminBase() + "/users/" + keycloakId)
                    .header("Authorization", "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(representation)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException e) {
            throw new IdentityUnavailableException("failed to update Keycloak user " + keycloakId, e);
        }
    }

    @Override
    public void resetPassword(UUID keycloakId, String password, boolean temporary) {
        String token = bearer();
        Map<String, Object> credential = Map.of("type", "password", "value", password, "temporary", temporary);
        try {
            http.put()
                    .uri(adminBase() + "/users/" + keycloakId + "/reset-password")
                    .header("Authorization", "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(credential)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException e) {
            throw new IdentityUnavailableException("failed to reset password for " + keycloakId, e);
        }
    }

    @Override
    public void sendActionsEmail(UUID keycloakId, List<String> actions) {
        String token = bearer();
        UriComponentsBuilder uri = UriComponentsBuilder
                .fromUriString(adminBase() + "/users/" + keycloakId + "/execute-actions-email")
                .queryParam("client_id", activationClientId)
                .queryParam("lifespan", activationLifespanSeconds);
        if (!activationRedirectUri.isBlank()) {
            uri.queryParam("redirect_uri", activationRedirectUri);
        }
        try {
            http.put()
                    .uri(uri.build().toUri())
                    .header("Authorization", "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(actions)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException e) {
            // Keycloak answers 500/400 here when SMTP is unset or unreachable. The
            // account and its required actions are already in place, so this is a
            // delivery problem to report — not a failure of the operation.
            throw new ActivationDeliveryException(
                    "Keycloak could not send the account action e-mail for " + keycloakId, e);
        }
    }

    @Override
    public void clearBruteForce(UUID keycloakId) {
        String token = bearer();
        try {
            http.delete()
                    .uri(adminBase() + "/attack-detection/brute-force/users/" + keycloakId)
                    .header("Authorization", "Bearer " + token)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException e) {
            throw new IdentityUnavailableException("failed to clear brute-force lockout for " + keycloakId, e);
        }
    }

    @Override
    public void logoutAllSessions(UUID keycloakId) {
        String token = bearer();
        try {
            http.post()
                    .uri(adminBase() + "/users/" + keycloakId + "/logout")
                    .header("Authorization", "Bearer " + token)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException e) {
            throw new IdentityUnavailableException("failed to revoke sessions for " + keycloakId, e);
        }
    }

    @Override
    public void deleteUser(UUID keycloakId) {
        String token = bearer();
        try {
            http.delete()
                    .uri(adminBase() + "/users/" + keycloakId)
                    .header("Authorization", "Bearer " + token)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException e) {
            throw new IdentityUnavailableException("failed to delete Keycloak user " + keycloakId, e);
        }
    }
}
