package com.hub.hr.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies the real logback-spring.xml console path (default profile): secrets
 * are masked before they are written. Uses a full context so Spring Boot's
 * logging system actually processes logback-spring.xml.
 */
@SpringBootTest(properties =
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://127.0.0.1:59999/jwks")
@ExtendWith(OutputCaptureExtension.class)
class LogMaskingTest {

    private static final Logger log = LoggerFactory.getLogger(LogMaskingTest.class);

    @Test
    void masksSecretBearingKeyValuesInConsoleLogs(CapturedOutput output) {
        log.info("login attempt password=hunter2 token=abc.def.ghi authorization=Bask finished");

        assertThat(output.getOut())
                .doesNotContain("hunter2")
                .doesNotContain("abc.def.ghi")
                .contains("password=****")
                .contains("token=****");
    }
}
