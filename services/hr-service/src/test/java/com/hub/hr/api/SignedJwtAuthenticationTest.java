package com.hub.hr.api;

import java.time.Instant;
import java.util.Date;
import java.util.List;

import com.hub.hr.support.TestIdentityProvider;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Full-fidelity token pipeline test over real HTTP: JWKS fetch, RS256 signature,
 * issuer, audience and expiry validation all run exactly as in production —
 * only the key source is the in-test identity provider instead of Keycloak.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SignedJwtAuthenticationTest {

    static final TestIdentityProvider IDP = new TestIdentityProvider();

    @DynamicPropertySource
    static void jwtProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.security.oauth2.resourceserver.jwt.jwk-set-uri", IDP::jwksUri);
        registry.add("spring.security.oauth2.resourceserver.jwt.issuer-uri", () -> TestIdentityProvider.ISSUER);
    }

    @AfterAll
    static void shutdown() {
        IDP.close();
    }

    @Autowired
    TestRestTemplate rest;

    private ResponseEntity<String> get(String path, String token) {
        HttpHeaders headers = new HttpHeaders();
        if (token != null) {
            headers.setBearerAuth(token);
        }
        return rest.exchange(path, HttpMethod.GET, new HttpEntity<>(headers), String.class);
    }

    @Test
    void healthIsPublic() {
        assertThat(get("/actuator/health", null).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void missingTokenIsRejected() {
        assertThat(get("/api/hr/auth/me", null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void expiredTokenIsRejected() {
        String expired = IDP.token(List.of("EMPLOYEE"), claims -> claims
                .issueTime(Date.from(Instant.now().minusSeconds(600)))
                .expirationTime(Date.from(Instant.now().minusSeconds(300))));
        assertThat(get("/api/hr/auth/me", expired).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void wrongSignatureIsRejected() {
        String forged = IDP.tokenSignedByRogueKey(List.of("ADMIN"));
        assertThat(get("/api/hr/auth/me", forged).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void wrongAudienceIsRejected() {
        String wrongAud = IDP.token(List.of("EMPLOYEE"), claims -> claims.audience("some-other-api"));
        assertThat(get("/api/hr/auth/me", wrongAud).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void wrongIssuerIsRejected() {
        String wrongIss = IDP.token(List.of("EMPLOYEE"), claims -> claims.issuer("http://evil-issuer"));
        assertThat(get("/api/hr/auth/me", wrongIss).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void validTokenPassesAndExposesClaims() {
        ResponseEntity<String> response = get("/api/hr/auth/me", IDP.token(List.of("MANAGER", "EMPLOYEE")));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody())
                .contains("\"username\":\"test.user\"")
                .contains("ROLE_MANAGER")
                .contains("ROLE_EMPLOYEE");
    }

    @Test
    void roleProtectedEndpointEnforcedWithRealTokens() {
        String employeeToken = IDP.token(List.of("EMPLOYEE"));
        assertThat(get("/api/hr/auth/admin-check", employeeToken).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);

        String adminToken = IDP.token(List.of("ADMIN", "EMPLOYEE"));
        assertThat(get("/api/hr/auth/admin-check", adminToken).getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
