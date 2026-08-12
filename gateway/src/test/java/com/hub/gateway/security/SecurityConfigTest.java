package com.hub.gateway.security;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.config.GlobalCorsProperties;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsConfigurationSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The CORS policy the security chain enforces is the gateway's own
 * {@code globalcors} configuration — adapted, never a second copy of the values.
 */
class SecurityConfigTest {

    private final SecurityConfig config = new SecurityConfig();

    @Test
    void corsSourceAdaptsTheGatewaysOwnGlobalCorsConfiguration() {
        GlobalCorsProperties properties = new GlobalCorsProperties();
        CorsConfiguration policy = new CorsConfiguration();
        policy.setAllowedOrigins(List.of("http://localhost:5173"));
        properties.getCorsConfigurations().put("/**", policy);

        CorsConfigurationSource source = config.corsConfigurationSource(properties);

        CorsConfiguration resolved = source.getCorsConfiguration(
                MockServerWebExchange.from(MockServerHttpRequest.get("/api/hr/employees")));
        assertThat(resolved).isNotNull();
        assertThat(resolved.getAllowedOrigins()).containsExactly("http://localhost:5173");
    }

    /**
     * A gateway with no CORS policy answers every browser preflight without
     * Access-Control-Allow-Origin — invisible in server logs, fatal in a browser.
     * Refusing to start is the only honest outcome.
     */
    @Test
    void missingCorsConfigurationFailsAtStartupInsteadOfSilently() {
        GlobalCorsProperties empty = new GlobalCorsProperties();

        assertThatThrownBy(() -> config.corsConfigurationSource(empty))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("HUB_CORS_ALLOWED_ORIGINS");
    }
}
