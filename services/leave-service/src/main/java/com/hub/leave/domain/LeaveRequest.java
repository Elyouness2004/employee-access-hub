package com.hub.leave.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.UuidGenerator;

/**
 * Aggregate root of the leave context. The manager relationship is a SNAPSHOT
 * taken at submit time from the (cached) HR directory — approvals never call
 * HR, which is both the §2.5 caching decision and the resilience story.
 * State machine and BR-02 live here as pure domain rules.
 */
@Entity
@Table(name = "leave_request")
public class LeaveRequest {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "employee_id", nullable = false)
    private UUID employeeId;

    @Column(name = "employee_keycloak_id", nullable = false)
    private UUID employeeKeycloakId;

    /** Null when routed to HR (BR-02 escalation: no manager, or self-managed). */
    @Column(name = "manager_keycloak_id")
    private UUID managerKeycloakId;

    @Column(name = "hr_escalated", nullable = false)
    private boolean hrEscalated;

    @Enumerated(EnumType.STRING)
    @Column(name = "leave_type", nullable = false, length = 20)
    private LeaveType type;

    @Embedded
    private DateRange period;

    @Column(name = "business_days", nullable = false)
    private int businessDays;

    @Column(length = 500)
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private LeaveStatus status;

    @Column(name = "decided_by")
    private UUID decidedBy;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "decision_comment", length = 500)
    private String decisionComment;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected LeaveRequest() {
        // JPA only
    }

    /**
     * Submission invariants: at least one business day, single calendar year
     * (balances are per year). BR-02 routing: without a distinct manager the
     * request escalates to HR so approval authority always exists.
     */
    public static LeaveRequest submit(UUID employeeId, UUID employeeKeycloakId,
                                      UUID managerKeycloakId, LeaveType type,
                                      DateRange period, String reason) {
        Objects.requireNonNull(employeeId, "employeeId");
        Objects.requireNonNull(employeeKeycloakId, "employeeKeycloakId");
        Objects.requireNonNull(type, "type");
        Objects.requireNonNull(period, "period");
        if (!period.spansSingleYear()) {
            throw new InvalidLeavePeriodException(
                    "period " + period + " spans two calendar years; submit one request per year");
        }
        int businessDays = period.businessDays();
        if (businessDays == 0) {
            throw new InvalidLeavePeriodException(
                    "period " + period + " contains no business day");
        }

        LeaveRequest request = new LeaveRequest();
        request.employeeId = employeeId;
        request.employeeKeycloakId = employeeKeycloakId;
        boolean selfManaged = managerKeycloakId == null || managerKeycloakId.equals(employeeKeycloakId);
        request.managerKeycloakId = selfManaged ? null : managerKeycloakId;
        request.hrEscalated = selfManaged;
        request.type = type;
        request.period = period;
        request.businessDays = businessDays;
        request.reason = reason;
        request.status = LeaveStatus.SUBMITTED;
        return request;
    }

    public void approve(UUID deciderKeycloakId, String comment) {
        decide(deciderKeycloakId, comment, LeaveStatus.APPROVED, "approve");
    }

    public void reject(UUID deciderKeycloakId, String comment) {
        decide(deciderKeycloakId, comment, LeaveStatus.REJECTED, "reject");
    }

    private void decide(UUID deciderKeycloakId, String comment, LeaveStatus target, String verb) {
        Objects.requireNonNull(deciderKeycloakId, "deciderKeycloakId");
        if (status != LeaveStatus.SUBMITTED) {
            throw new IllegalLeaveStateException(status, verb);
        }
        if (deciderKeycloakId.equals(employeeKeycloakId)) {
            throw new SelfDecisionException();
        }
        status = target;
        decidedBy = deciderKeycloakId;
        decidedAt = Instant.now();
        decisionComment = comment;
    }

    /** Employee cancellation — only before a decision (D19). */
    public void cancel() {
        if (status != LeaveStatus.SUBMITTED) {
            throw new IllegalLeaveStateException(status, "cancel");
        }
        status = LeaveStatus.CANCELLED;
    }

    /**
     * BR-05 consumer path: offboarding cancels SUBMITTED requests outright and
     * APPROVED ones too; the caller re-credits the balance when this returns
     * true (an approved, balance-tracked request had already been debited).
     */
    public boolean cancelForOffboarding() {
        boolean recredit = status == LeaveStatus.APPROVED && type.isBalanceTracked();
        status = LeaveStatus.CANCELLED;
        return recredit;
    }

    public UUID getId() {
        return id;
    }

    public UUID getEmployeeId() {
        return employeeId;
    }

    public UUID getEmployeeKeycloakId() {
        return employeeKeycloakId;
    }

    public UUID getManagerKeycloakId() {
        return managerKeycloakId;
    }

    public boolean isHrEscalated() {
        return hrEscalated;
    }

    public LeaveType getType() {
        return type;
    }

    public DateRange getPeriod() {
        return period;
    }

    public int getBusinessDays() {
        return businessDays;
    }

    public String getReason() {
        return reason;
    }

    public LeaveStatus getStatus() {
        return status;
    }

    public UUID getDecidedBy() {
        return decidedBy;
    }

    public Instant getDecidedAt() {
        return decidedAt;
    }

    public String getDecisionComment() {
        return decisionComment;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
