package com.hub.gateway;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;

import com.hub.gateway.support.TestIdentityProvider;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Layer-1 gate over real HTTP: only a correctly signed, unexpired token for the
 * right issuer AND audience crosses the edge; the Bearer token and a correlation
 * id are relayed to the downstream service (a stub echoing what it received).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class GatewaySecurityIntegrationTest {

    static final TestIdentityProvider IDP = new TestIdentityProvider();
    static final HttpServer DOWNSTREAM = startDownstreamEcho();

    private static HttpServer startDownstreamEcho() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/", exchange -> {
                String auth = exchange.getRequestHeaders().getFirst("Authorization");
                String cid = exchange.getRequestHeaders().getFirst("X-Correlation-Id");
                exchange.getResponseHeaders().set("X-Echo-Authorization", auth == null ? "" : auth);
                exchange.getResponseHeaders().set("X-Echo-Correlation-Id", cid == null ? "" : cid);
                byte[] body = "{\"downstream\":\"ok\"}".getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                try (OutputStream out = exchange.getResponseBody()) {
                    out.write(body);
                }
            });
            server.start();
            return server;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @DynamicPropertySource
    static void gatewayProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.security.oauth2.resourceserver.jwt.jwk-set-uri", IDP::jwksUri);
        registry.add("spring.security.oauth2.resourceserver.jwt.issuer-uri", () -> TestIdentityProvider.ISSUER);
        registry.add("HR_SERVICE_URI",
                () -> "http://127.0.0.1:" + DOWNSTREAM.getAddress().getPort());
    }

    @AfterAll
    static void shutdown() {
        IDP.close();
        DOWNSTREAM.stop(0);
    }

    @Autowired
    WebTestClient webTestClient;

    @Test
    void healthIsPublic() {
        webTestClient.get().uri("/actuator/health").exchange().expectStatus().isOk();
    }

    @Test
    void missingTokenIsRejectedAtTheEdge() {
        webTestClient.get().uri("/api/hr/auth/me").exchange().expectStatus().isUnauthorized();
    }

    @Test
    void garbageTokenIsRejectedAtTheEdge() {
        webTestClient.get().uri("/api/hr/auth/me")
                .header("Authorization", "Bearer not.a.jwt")
                .exchange().expectStatus().isUnauthorized();
    }

    @Test
    void expiredTokenIsRejectedAtTheEdge() {
        String expired = IDP.token(List.of("EMPLOYEE"), claims -> claims
                .issueTime(Date.from(Instant.now().minusSeconds(600)))
                .expirationTime(Date.from(Instant.now().minusSeconds(300))));
        webTestClient.get().uri("/api/hr/auth/me")
                .header("Authorization", "Bearer " + expired)
                .exchange().expectStatus().isUnauthorized();
    }

    @Test
    void wrongSignatureIsRejectedAtTheEdge() {
        String forged = IDP.tokenSignedByRogueKey(List.of("ADMIN"));
        webTestClient.get().uri("/api/hr/auth/me")
                .header("Authorization", "Bearer " + forged)
                .exchange().expectStatus().isUnauthorized();
    }

    @Test
    void wrongAudienceIsRejectedAtTheEdge() {
        String wrongAud = IDP.token(List.of("EMPLOYEE"), claims -> claims.audience("some-other-api"));
        webTestClient.get().uri("/api/hr/auth/me")
                .header("Authorization", "Bearer " + wrongAud)
                .exchange().expectStatus().isUnauthorized();
    }

    @Test
    void wrongIssuerIsRejectedAtTheEdge() {
        String wrongIss = IDP.token(List.of("EMPLOYEE"), claims -> claims.issuer("http://evil-issuer"));
        webTestClient.get().uri("/api/hr/auth/me")
                .header("Authorization", "Bearer " + wrongIss)
                .exchange().expectStatus().isUnauthorized();
    }

    @Test
    void validTokenIsRoutedWithTokenRelayAndCorrelationId() {
        String token = IDP.token(List.of("EMPLOYEE"));

        var result = webTestClient.get().uri("/api/hr/auth/me")
                .header("Authorization", "Bearer " + token)
                .exchange()
                .expectStatus().isOk()
                .expectBody(String.class)
                .returnResult();

        // token relay: downstream received the exact Bearer token (zero trust re-validation downstream)
        assertThat(result.getResponseHeaders().getFirst("X-Echo-Authorization"))
                .isEqualTo("Bearer " + token);
        // correlation id: generated at the edge, forwarded downstream, echoed to the client
        String correlationId = result.getResponseHeaders().getFirst("X-Correlation-Id");
        assertThat(correlationId).isNotBlank();
        assertThat(result.getResponseHeaders().getFirst("X-Echo-Correlation-Id")).isEqualTo(correlationId);
    }

    @Test
    void callerSuppliedCorrelationIdIsPreserved() {
        String token = IDP.token(List.of("EMPLOYEE"));

        webTestClient.get().uri("/api/hr/auth/me")
                .header("Authorization", "Bearer " + token)
                .header("X-Correlation-Id", "caller-id-123")
                .exchange()
                .expectStatus().isOk()
                .expectHeader().valueEquals("X-Correlation-Id", "caller-id-123")
                .expectHeader().valueEquals("X-Echo-Correlation-Id", "caller-id-123");
    }

    @Test
    void unroutedPathWithValidTokenIs404NotLeaked() {
        String token = IDP.token(List.of("EMPLOYEE"));
        webTestClient.get().uri("/api/unknown/thing")
                .header("Authorization", "Bearer " + token)
                .exchange().expectStatus().isNotFound();
    }

    // ── CORS at the edge ──────────────────────────────────────────────────────
    // A browser preflight carries no Authorization header (the CORS spec forbids
    // it), so the layer-1 gate must let the preflight through while still gating
    // the real request. These tests pin that split.

    @Test
    void preflightIsAnsweredWithoutATokenAndNamesTheAllowedOrigin() {
        webTestClient.options().uri("/api/hr/employees")
                .header("Origin", "http://localhost:5173")
                .header("Access-Control-Request-Method", "GET")
                .header("Access-Control-Request-Headers", "authorization,content-type,x-correlation-id")
                .exchange()
                .expectStatus().isOk()
                // the explicit origin is echoed back — never "*"
                .expectHeader().valueEquals("Access-Control-Allow-Origin", "http://localhost:5173")
                .expectHeader().valueEquals("Access-Control-Allow-Headers",
                        "authorization, content-type, x-correlation-id")
                .expectHeader().valueEquals("Access-Control-Expose-Headers",
                        "X-Correlation-Id, Content-Disposition");
    }

    /**
     * The 401 a browser MUST be able to read: without CORS headers on the
     * security chain's own error response, XHR reports an opaque network failure
     * and the SPA's 401 renew-and-replay never fires.
     */
    @Test
    void unauthorizedResponseStillCarriesCorsHeaders() {
        webTestClient.get().uri("/api/hr/auth/me")
                .header("Origin", "http://localhost:5173")
                .exchange()
                .expectStatus().isUnauthorized()
                .expectHeader().valueEquals("Access-Control-Allow-Origin", "http://localhost:5173");
    }

    /** Permitting the preflight must not permit OPTIONS as a routable method. */
    @Test
    void bareOptionsWithoutPreflightHeadersStillRequiresAToken() {
        webTestClient.options().uri("/api/hr/employees")
                .exchange().expectStatus().isUnauthorized();
    }

    /** An origin outside the allowlist is rejected, not silently accepted. */
    @Test
    void preflightFromAnUnknownOriginIsRejected() {
        webTestClient.options().uri("/api/hr/employees")
                .header("Origin", "http://evil.example.com")
                .header("Access-Control-Request-Method", "GET")
                .exchange()
                .expectStatus().isForbidden()
                .expectHeader().doesNotExist("Access-Control-Allow-Origin");
    }

    /** Exactly one Access-Control-Allow-Origin — the chain and the gateway
     *  handler mapping share one policy and must not both write it. */
    @Test
    void routedResponseCarriesExactlyOneAllowOriginHeader() {
        String token = IDP.token(List.of("EMPLOYEE"));
        var result = webTestClient.get().uri("/api/hr/auth/me")
                .header("Origin", "http://localhost:5173")
                .header("Authorization", "Bearer " + token)
                .exchange()
                .expectStatus().isOk()
                .expectBody(String.class)
                .returnResult();

        assertThat(result.getResponseHeaders().get("Access-Control-Allow-Origin"))
                .containsExactly("http://localhost:5173");
    }
}
