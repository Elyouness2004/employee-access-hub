package com.hub.leave.e2e;

import java.util.Optional;
import java.util.UUID;

import com.hub.leave.domain.EmployeeDirectory;
import com.hub.leave.domain.EmployeeSnapshot;
import dasniko.testcontainers.keycloak.KeycloakContainer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

/**
 * True end-to-end against a REAL Keycloak importing the same realm file the
 * compose stack uses: password-grant tokens for the seeded users drive the
 * full leave flow through the production security pipeline (JWKS, RS256,
 * issuer/audience/expiry, RBAC). The HR directory port is mocked so the test
 * needs no running hr-service — the token path is what this exercises.
 *
 * Requires Docker; cleanly skipped otherwise (runs in CI and on any Docker-enabled host).
 */
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class KeycloakLeaveEndToEndTest {

    @Container
    static KeycloakContainer keycloak = new KeycloakContainer("quay.io/keycloak/keycloak:26.3")
            .withRealmImportFile("keycloak-config/realm-employee-hub.json");

    @DynamicPropertySource
    static void keycloakProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.security.oauth2.resourceserver.jwt.issuer-uri",
                () -> keycloak.getAuthServerUrl() + "/realms/employee-hub");
        registry.add("spring.security.oauth2.resourceserver.jwt.jwk-set-uri", () -> "");
    }

    @MockitoBean
    EmployeeDirectory directory;

    @Autowired
    TestRestTemplate rest;

    /** Resolves each seeded user's Keycloak subject from their own token. */
    private String subjectOf(String token) {
        String payload = token.split("\\.")[1];
        byte[] json = java.util.Base64.getUrlDecoder().decode(payload);
        return new String(json).replaceAll(".*\"sub\":\"([^\"]+)\".*", "$1");
    }

    private String passwordGrantToken(String username, String password) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "password");
        form.add("client_id", "test-cli");
        form.add("username", username);
        form.add("password", password);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
        @SuppressWarnings("unchecked")
        var body = (java.util.Map<String, Object>) new RestTemplate().postForObject(
                keycloak.getAuthServerUrl() + "/realms/employee-hub/protocol/openid-connect/token",
                new HttpEntity<>(form, headers), java.util.Map.class);
        assertThat(body).isNotNull().containsKey("access_token");
        return String.valueOf(body.get("access_token"));
    }

    private ResponseEntity<String> exchange(HttpMethod method, String path, String token, String json) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (token != null) {
            headers.setBearerAuth(token);
        }
        return rest.exchange(path, method, new HttpEntity<>(json, headers), String.class);
    }

    @Test
    void fullLeaveFlowWithRealTokens() {
        String aliceToken = passwordGrantToken("alice.employee", "Test1234!");
        String markToken = passwordGrantToken("mark.manager", "Test1234!");
        UUID aliceKc = UUID.fromString(subjectOf(aliceToken));
        UUID markKc = UUID.fromString(subjectOf(markToken));
        UUID aliceId = UUID.randomUUID();

        EmployeeSnapshot alice = new EmployeeSnapshot(aliceId, aliceKc, true, UUID.randomUUID(), markKc);
        given(directory.findByKeycloakId(aliceKc)).willReturn(Optional.of(alice));
        given(directory.findById(aliceId)).willReturn(Optional.of(alice));

        // submit as alice
        ResponseEntity<String> submitted = exchange(HttpMethod.POST, "/api/leave/requests", aliceToken,
                "{\"type\":\"ANNUAL\",\"startDate\":\"2026-09-07\",\"endDate\":\"2026-09-11\",\"reason\":\"trip\"}");
        assertThat(submitted.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(submitted.getBody()).contains("\"status\":\"SUBMITTED\"").contains("\"businessDays\":5");
        String id = submitted.getBody().replaceAll(".*\"id\":\"([^\"]+)\".*", "$1");

        // mark (alice's manager) approves
        ResponseEntity<String> approved = exchange(HttpMethod.POST,
                "/api/leave/requests/" + id + "/approve", markToken, "{}");
        assertThat(approved.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(approved.getBody()).contains("\"status\":\"APPROVED\"");

        // balance debited
        ResponseEntity<String> balance = exchange(HttpMethod.GET,
                "/api/leave/balances/my?year=2026", aliceToken, null);
        assertThat(balance.getBody()).contains("\"usedDays\":5");
    }

    @Test
    void unauthenticatedIsRejectedEvenWithKeycloakUp() {
        ResponseEntity<String> response = exchange(HttpMethod.GET, "/api/leave/requests/my", null, null);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
