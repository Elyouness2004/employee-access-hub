package com.hub.hr.api;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.actuate.observability.AutoConfigureObservability;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves the Phase 5 metrics wiring on a real port: /actuator/prometheus is
 * reachable unauthenticated (backend-network scraping) and carries both JVM and
 * the hr business gauges, while the business API still demands a valid token.
 *
 * <p>{@code @AutoConfigureObservability} re-enables metrics export, which Spring
 * Boot switches off by default inside {@code @SpringBootTest}; production runs
 * (plain {@code java -jar}) have it on, so this mirrors real behavior.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://127.0.0.1:59999/jwks")
// metrics only; tracing off so no OTLP exporter reaches out during the test
@AutoConfigureObservability(tracing = false)
class ActuatorMetricsWebTest {

    @Autowired
    private TestRestTemplate rest;

    @Test
    void prometheusEndpointIsPublicAndExposesJvmAndBusinessMetrics() {
        ResponseEntity<String> response = rest.getForEntity("/actuator/prometheus", String.class);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody())
                .contains("jvm_memory_used_bytes")
                .contains("hub_hr_employees");
    }

    @Test
    void businessApiStillRequiresAuthentication() {
        ResponseEntity<String> response = rest.getForEntity("/api/hr/auth/me", String.class);

        assertThat(response.getStatusCode().value()).isEqualTo(401);
    }
}
