package com.hub.hr.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * Swaps the logging identity adapter and the Feign fan-out for recording fakes so
 * tests can assert the exact Keycloak/downstream interactions without a broker,
 * a Keycloak, or the other services running. Each fake implements its port and is
 * {@code @Primary}, so the application beans inject it and tests can autowire the
 * concrete type to make assertions.
 */
@TestConfiguration
public class IdentityTestConfig {

    @Bean
    @Primary
    RecordingIdentityProvisioner recordingIdentityProvisioner() {
        return new RecordingIdentityProvisioner();
    }

    @Bean
    @Primary
    RecordingOffboardingNotifier recordingOffboardingNotifier() {
        return new RecordingOffboardingNotifier();
    }

    @Bean
    @Primary
    RecordingSessionDirectory recordingSessionDirectory() {
        return new RecordingSessionDirectory();
    }
}
