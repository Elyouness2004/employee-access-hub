package com.hub.gateway.filter;

import java.util.Map;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;

import reactor.core.publisher.Mono;

/**
 * Stamps a baseline set of security response headers on every edge response
 * (application layer, layer 1). These harden the JSON API surface against
 * MIME-sniffing, framing/clickjacking and referrer leakage regardless of the
 * downstream service. Transport-level headers that require TLS —
 * Strict-Transport-Security above all — are deliberately NOT set here; they
 * belong at the TLS-terminating reverse proxy (Phase 9), the only component
 * that knows the connection is HTTPS.
 *
 * <p>Headers are applied in {@code beforeCommit} so they win over anything the
 * proxied response carried, and set only if the downstream did not already
 * provide its own value.
 */
@Component
public class SecurityHeadersFilter implements GlobalFilter, Ordered {

    // API gateway returns JSON, never HTML: a maximally restrictive policy is
    // correct and cheap. 'none' forbids all resource loading and framing.
    static final Map<String, String> SECURITY_HEADERS = Map.of(
            "X-Content-Type-Options", "nosniff",
            "X-Frame-Options", "DENY",
            "Referrer-Policy", "no-referrer",
            // modern guidance: disable the legacy, buggy XSS auditor rather than enable it
            "X-XSS-Protection", "0",
            "Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'",
            "Permissions-Policy", "geolocation=(), camera=(), microphone=()");

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        exchange.getResponse().beforeCommit(() -> {
            HttpHeaders headers = exchange.getResponse().getHeaders();
            SECURITY_HEADERS.forEach((name, value) -> {
                if (!headers.containsKey(name)) {
                    headers.set(name, value);
                }
            });
            return Mono.empty();
        });
        return chain.filter(exchange);
    }

    @Override
    public int getOrder() {
        // runs early so the beforeCommit hook is registered before the response
        // is assembled; the actual write happens at commit time
        return Ordered.HIGHEST_PRECEDENCE;
    }
}
