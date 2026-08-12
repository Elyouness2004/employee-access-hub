package com.hub.hr.config;

import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.actuate.observability.AutoConfigureObservability;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves the Phase 7 tracing bridge is wired: with observability enabled a
 * Micrometer {@link Tracer} (backed by OpenTelemetry) is present and produces
 * valid trace/span ids — the same ids that flow into the MDC log fields and are
 * exported over OTLP to Tempo when sampling is on.
 */
@SpringBootTest(properties =
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://127.0.0.1:59999/jwks")
@AutoConfigureObservability
class TracingWiringTest {

    @Autowired
    private Tracer tracer;

    @Test
    void tracerProducesTraceAndSpanIds() {
        assertThat(tracer).isNotNull();

        Span span = tracer.nextSpan().name("phase7-check").start();
        try (Tracer.SpanInScope ignored = tracer.withSpan(span)) {
            assertThat(span.context().traceId()).isNotBlank();
            assertThat(span.context().spanId()).isNotBlank();
            assertThat(tracer.currentSpan()).isNotNull();
        } finally {
            span.end();
        }
    }
}
