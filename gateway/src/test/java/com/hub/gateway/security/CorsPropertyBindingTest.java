package com.hub.gateway.security;

import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.assertj.AssertableApplicationContext;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.cloud.gateway.config.GlobalCorsProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The staging/production profiles override ONLY {@code allowedOrigins}; the
 * methods, headers and exposed headers come from the base {@code application.yml}.
 * That only works if Spring Boot merges the two YAML sources leaf-by-leaf onto
 * one CorsConfiguration instead of replacing the whole {@code [/**]} entry — so
 * pin it. If this ever flips to "replace", production loses its allowed headers
 * and every browser call fails there while dev stays green.
 */
class CorsPropertyBindingTest {

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(GlobalCorsProperties.class)
    static class BindOnly {
    }

    private ApplicationContextRunner runner(String... profiles) {
        return new ApplicationContextRunner()
                .withInitializer(new ConfigDataApplicationContextInitializer())
                .withConfiguration(AutoConfigurations.of())
                .withUserConfiguration(BindOnly.class)
                .withPropertyValues(profiles);
    }

    private static CorsConfiguration policyOf(AssertableApplicationContext context) {
        GlobalCorsProperties properties = context.getBean(GlobalCorsProperties.class);
        assertThat(properties.getCorsConfigurations()).containsKey("/**");
        return properties.getCorsConfigurations().get("/**");
    }

    @Test
    void defaultProfileAllowsTheLocalSpaOriginsWithTheThreeCorsHeaders() {
        runner().run(context -> {
            CorsConfiguration policy = policyOf(context);
            assertThat(policy.getAllowedOrigins())
                    .containsExactly("http://localhost:5173", "http://localhost:3000");
            assertThat(policy.getAllowedHeaders())
                    .containsExactly("Authorization", "Content-Type", "X-Correlation-Id");
            assertThat(policy.getExposedHeaders())
                    .containsExactly("X-Correlation-Id", "Content-Disposition");
            assertThat(policy.getAllowedMethods()).contains("GET", "POST", "OPTIONS");
            // "*" + credentials is rejected by Spring at runtime and emits no CORS
            // headers at all: neither may appear.
            assertThat(policy.getAllowedOrigins()).doesNotContain("*");
            assertThat(policy.getAllowCredentials()).isNull();
        });
    }

    @Test
    void productionProfileReplacesOriginsButInheritsTheHeaderPolicy() {
        runner("spring.profiles.active=production",
               "HUB_CORS_ALLOWED_ORIGINS=https://hub.example.com").run(context -> {
            CorsConfiguration policy = policyOf(context);
            // the profile's own value wins — no localhost leaks into production
            assertThat(policy.getAllowedOrigins()).containsExactly("https://hub.example.com");
            // ...while the base policy still applies
            assertThat(policy.getAllowedHeaders())
                    .containsExactly("Authorization", "Content-Type", "X-Correlation-Id");
            assertThat(policy.getExposedHeaders())
                    .containsExactly("X-Correlation-Id", "Content-Disposition");
            assertThat(policy.getAllowedMethods()).contains("GET", "POST", "OPTIONS");
        });
    }

    @Test
    void stagingProfileReplacesOriginsButInheritsTheHeaderPolicy() {
        runner("spring.profiles.active=staging",
               "HUB_CORS_ALLOWED_ORIGINS=https://staging.hub.example.com").run(context -> {
            CorsConfiguration policy = policyOf(context);
            assertThat(policy.getAllowedOrigins()).containsExactly("https://staging.hub.example.com");
            assertThat(policy.getAllowedHeaders())
                    .containsExactly("Authorization", "Content-Type", "X-Correlation-Id");
        });
    }
}
