package com.hub.hr.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class EmployeeStatusTest {

    @Test
    void activeKeepsTheKeycloakAccountEnabled() {
        assertThat(EmployeeStatus.ACTIVE.keycloakEnabled()).isTrue();
    }

    @Test
    void disabledAndTerminatedDisableTheAccount() {
        assertThat(EmployeeStatus.DISABLED.keycloakEnabled()).isFalse();
        assertThat(EmployeeStatus.TERMINATED.keycloakEnabled()).isFalse();
    }

    @Test
    void terminatedIsAvailableAsTheOffboardingTerminalState() {
        assertThat(EmployeeStatus.valueOf("TERMINATED")).isEqualTo(EmployeeStatus.TERMINATED);
    }
}
