package com.hub.leave.domain;

import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** State machine (D19) + BR-02 as pure domain rules. */
class LeaveRequestTest {

    private static final UUID EMPLOYEE_ID = UUID.randomUUID();
    private static final UUID EMPLOYEE_KC = UUID.randomUUID();
    private static final UUID MANAGER_KC = UUID.randomUUID();

    private static final DateRange WEEK =
            DateRange.of(LocalDate.of(2026, 7, 20), LocalDate.of(2026, 7, 24));

    private LeaveRequest submitted() {
        return LeaveRequest.submit(EMPLOYEE_ID, EMPLOYEE_KC, MANAGER_KC,
                LeaveType.ANNUAL, WEEK, "vacation");
    }

    @Test
    void submitComputesBusinessDaysAndRoutesToManager() {
        LeaveRequest request = submitted();

        assertThat(request.getStatus()).isEqualTo(LeaveStatus.SUBMITTED);
        assertThat(request.getBusinessDays()).isEqualTo(5);
        assertThat(request.getManagerKeycloakId()).isEqualTo(MANAGER_KC);
        assertThat(request.isHrEscalated()).isFalse();
    }

    @Test
    void weekendOnlyPeriodIsRejected() {
        DateRange weekend = DateRange.of(LocalDate.of(2026, 7, 25), LocalDate.of(2026, 7, 26));
        assertThatThrownBy(() -> LeaveRequest.submit(EMPLOYEE_ID, EMPLOYEE_KC, MANAGER_KC,
                LeaveType.ANNUAL, weekend, null))
                .isInstanceOf(InvalidLeavePeriodException.class);
    }

    @Test
    void yearSpanningPeriodIsRejected() {
        DateRange newYear = DateRange.of(LocalDate.of(2026, 12, 28), LocalDate.of(2027, 1, 4));
        assertThatThrownBy(() -> LeaveRequest.submit(EMPLOYEE_ID, EMPLOYEE_KC, MANAGER_KC,
                LeaveType.ANNUAL, newYear, null))
                .isInstanceOf(InvalidLeavePeriodException.class);
    }

    @Test
    void missingManagerEscalatesToHr() {
        LeaveRequest request = LeaveRequest.submit(EMPLOYEE_ID, EMPLOYEE_KC, null,
                LeaveType.ANNUAL, WEEK, null);
        assertThat(request.isHrEscalated()).isTrue();
        assertThat(request.getManagerKeycloakId()).isNull();
    }

    @Test
    void selfManagedEmployeeEscalatesToHr() {
        LeaveRequest request = LeaveRequest.submit(EMPLOYEE_ID, EMPLOYEE_KC, EMPLOYEE_KC,
                LeaveType.ANNUAL, WEEK, null);
        assertThat(request.isHrEscalated()).isTrue();
        assertThat(request.getManagerKeycloakId()).isNull();
    }

    @Test
    void approveRecordsDecision() {
        LeaveRequest request = submitted();
        request.approve(MANAGER_KC, "enjoy");

        assertThat(request.getStatus()).isEqualTo(LeaveStatus.APPROVED);
        assertThat(request.getDecidedBy()).isEqualTo(MANAGER_KC);
        assertThat(request.getDecidedAt()).isNotNull();
        assertThat(request.getDecisionComment()).isEqualTo("enjoy");
    }

    @Test
    void selfApprovalViolatesBr02() {
        LeaveRequest request = submitted();
        assertThatThrownBy(() -> request.approve(EMPLOYEE_KC, null))
                .isInstanceOf(SelfDecisionException.class)
                .extracting(e -> ((BusinessRuleViolationException) e).getRule()).isEqualTo("BR-02");
    }

    @Test
    void selfRejectionIsEquallyBlocked() {
        LeaveRequest request = submitted();
        assertThatThrownBy(() -> request.reject(EMPLOYEE_KC, null))
                .isInstanceOf(SelfDecisionException.class);
    }

    @Test
    void decidingTwiceIsAnIllegalTransition() {
        LeaveRequest request = submitted();
        request.approve(MANAGER_KC, null);
        assertThatThrownBy(() -> request.reject(MANAGER_KC, null))
                .isInstanceOf(IllegalLeaveStateException.class);
    }

    @Test
    void cancelOnlyBeforeDecision() {
        LeaveRequest pending = submitted();
        pending.cancel();
        assertThat(pending.getStatus()).isEqualTo(LeaveStatus.CANCELLED);

        LeaveRequest decided = submitted();
        decided.approve(MANAGER_KC, null);
        assertThatThrownBy(decided::cancel).isInstanceOf(IllegalLeaveStateException.class);
    }

    @Test
    void offboardingCancellationSignalsRecreditOnlyForApprovedTrackedLeave() {
        LeaveRequest pending = submitted();
        assertThat(pending.cancelForOffboarding()).isFalse();
        assertThat(pending.getStatus()).isEqualTo(LeaveStatus.CANCELLED);

        LeaveRequest approved = submitted();
        approved.approve(MANAGER_KC, null);
        assertThat(approved.cancelForOffboarding()).isTrue();

        LeaveRequest unpaid = LeaveRequest.submit(EMPLOYEE_ID, EMPLOYEE_KC, MANAGER_KC,
                LeaveType.UNPAID, WEEK, null);
        unpaid.approve(MANAGER_KC, null);
        assertThat(unpaid.cancelForOffboarding()).isFalse();
    }
}
