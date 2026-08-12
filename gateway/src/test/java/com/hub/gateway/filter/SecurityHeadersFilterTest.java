package com.hub.gateway.filter;

import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;

import static org.assertj.core.api.Assertions.assertThat;

class SecurityHeadersFilterTest {

    private final SecurityHeadersFilter filter = new SecurityHeadersFilter();

    @Test
    void setsBaselineSecurityHeadersOnCommit() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/hr/auth/me").build());
        // completing the response triggers the beforeCommit hook
        GatewayFilterChain chain = ex -> ex.getResponse().setComplete();

        filter.filter(exchange, chain).block();

        var headers = exchange.getResponse().getHeaders();
        assertThat(headers.getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(headers.getFirst("X-Frame-Options")).isEqualTo("DENY");
        assertThat(headers.getFirst("Referrer-Policy")).isEqualTo("no-referrer");
        assertThat(headers.getFirst("X-XSS-Protection")).isEqualTo("0");
        assertThat(headers.getFirst("Content-Security-Policy"))
                .isEqualTo("default-src 'none'; frame-ancestors 'none'");
        assertThat(headers.getFirst("Permissions-Policy"))
                .isEqualTo("geolocation=(), camera=(), microphone=()");
        // transport security is a Phase 9 (TLS proxy) concern, never set here
        assertThat(headers.getFirst("Strict-Transport-Security")).isNull();
    }

    @Test
    void doesNotOverrideHeaderAlreadySetByDownstream() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/hr/auth/me").build());
        exchange.getResponse().getHeaders().set("X-Frame-Options", "SAMEORIGIN");
        GatewayFilterChain chain = ex -> ex.getResponse().setComplete();

        filter.filter(exchange, chain).block();

        assertThat(exchange.getResponse().getHeaders().getFirst("X-Frame-Options"))
                .isEqualTo("SAMEORIGIN");
        // other headers still stamped
        assertThat(exchange.getResponse().getHeaders().getFirst("X-Content-Type-Options"))
                .isEqualTo("nosniff");
    }
}
