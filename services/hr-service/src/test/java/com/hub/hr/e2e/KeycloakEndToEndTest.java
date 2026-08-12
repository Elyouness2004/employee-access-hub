package com.hub.hr.e2e;

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
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * True end-to-end against a REAL Keycloak importing the same realm file the
 * compose stack uses: password-grant tokens for the seeded users, validated by
 * the service via Keycloak's JWKS, composite roles included.
 *
 * Requires Docker; cleanly skipped otherwise (runs in CI and on any Docker-enabled host).
 */
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class KeycloakEndToEndTest {

    @Container
    static KeycloakContainer keycloak = new KeycloakContainer("quay.io/keycloak/keycloak:26.3")
            .withRealmImportFile("keycloak-config/realm-employee-hub.json");

    @DynamicPropertySource
    static void keycloakProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.security.oauth2.resourceserver.jwt.issuer-uri",
                () -> keycloak.getAuthServerUrl() + "/realms/employee-hub");
        registry.add("spring.security.oauth2.resourceserver.jwt.jwk-set-uri", () -> "");
    }

    @Autowired
    TestRestTemplate rest;

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

    private ResponseEntity<String> get(String path, String token) {
        HttpHeaders headers = new HttpHeaders();
        if (token != null) {
            headers.setBearerAuth(token);
        }
        return rest.exchange(path, HttpMethod.GET, new HttpEntity<>(headers), String.class);
    }

    @Test
    void realKeycloakTokenIsAcceptedAndCarriesCompositeRoles() {
        String managerToken = passwordGrantToken("mark.manager", "Test1234!");

        ResponseEntity<String> me = get("/api/hr/auth/me", managerToken);

        assertThat(me.getStatusCode()).isEqualTo(HttpStatus.OK);
        // MANAGER is composite of EMPLOYEE: Keycloak must have expanded both into the token
        assertThat(me.getBody()).contains("ROLE_MANAGER").contains("ROLE_EMPLOYEE");
        assertThat(me.getBody()).contains("\"username\":\"mark.manager\"");
    }

    @Test
    void rbacMatrixHoldsWithRealTokens() {
        String alice = passwordGrantToken("alice.employee", "Test1234!");
        String adam = passwordGrantToken("adam.admin", "Test1234!");

        assertThat(get("/api/hr/auth/employee-check", alice).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(get("/api/hr/auth/admin-check", alice).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(get("/api/hr/auth/admin-check", adam).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(get("/api/hr/auth/manager-check", adam).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void unauthenticatedStays401EvenWithKeycloakUp() {
        assertThat(get("/api/hr/auth/me", null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
