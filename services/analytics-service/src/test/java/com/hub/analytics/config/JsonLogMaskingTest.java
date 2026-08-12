package com.hub.analytics.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the real logback-spring.xml JSON path (production profile): logs are
 * emitted as single-line JSON for Loki and the sensitive-data masking still
 * redacts secrets. analytics-service is used because it has no datasource, so it
 * boots cleanly under the production profile without a database.
 */
@SpringBootTest(properties =
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://127.0.0.1:59999/jwks")
@ActiveProfiles("production")
@ExtendWith(OutputCaptureExtension.class)
class JsonLogMaskingTest {

    private static final Logger log = LoggerFactory.getLogger(JsonLogMaskingTest.class);

    @Test
    void emitsJsonAndMasksSecrets(CapturedOutput output) {
        log.info("token refresh secret=topsecret123 password=hunter2 done");

        String out = output.getOut();
        // JSON encoder is active (custom field + JSON structure)
        assertThat(out).contains("\"application\":\"analytics-service\"");
        assertThat(out).contains("\"@timestamp\"");
        // secrets masked before write
        assertThat(out).doesNotContain("topsecret123").doesNotContain("hunter2");
        assertThat(out).contains("****");
    }
}
