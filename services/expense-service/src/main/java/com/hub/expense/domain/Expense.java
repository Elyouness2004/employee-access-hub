package com.hub.expense.domain;

import java.time.Instant;
import java.time.LocalDate;
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
 * Aggregate root of the expense context. The manager relationship is a SNAPSHOT
 * taken at submit time from the (cached) HR directory — approvals never call HR,
 * exactly as in the leave context (§2.5). The state machine and BR-02/03/04
 * live here as pure domain rules.
 */
@Entity
@Table(name = "expense")
public class Expense {

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
    @Column(nullable = false, length = 20)
    private ExpenseCategory category;

    @Embedded
    private Money amount;

    @Column(name = "expense_date", nullable = false)
    private LocalDate expenseDate;

    @Column(length = 500)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ExpenseStatus status;

    /** Set at first approval (BR-03): true once the threshold routed it to a second level. */
    @Column(name = "second_approval_required", nullable = false)
    private boolean secondApprovalRequired;

    @Column(name = "first_approver_keycloak_id")
    private UUID firstApproverKeycloakId;

    @Column(name = "first_approved_at")
    private Instant firstApprovedAt;

    /** Final decision actor: the second approver on APPROVED, or the rejecter on REJECTED. */
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

    protected Expense() {
        // JPA only
    }

    /**
     * Submission invariants: a positive amount and an expense date not in the
     * future. BR-02 routing mirrors leave: without a distinct manager the claim
     * escalates to HR so approval authority always exists.
     */
    public static Expense submit(UUID employeeId, UUID employeeKeycloakId, UUID managerKeycloakId,
                                 ExpenseCategory category, Money amount, LocalDate expenseDate,
                                 String description) {
        Objects.requireNonNull(employeeId, "employeeId");
        Objects.requireNonNull(employeeKeycloakId, "employeeKeycloakId");
        Objects.requireNonNull(category, "category");
        Objects.requireNonNull(amount, "amount");
        Objects.requireNonNull(expenseDate, "expenseDate");
        if (amount.amount().signum() <= 0) {
            throw new InvalidExpenseException("expense amount must be greater than zero");
        }
        if (expenseDate.isAfter(LocalDate.now())) {
            throw new InvalidExpenseException("expense date " + expenseDate + " is in the future");
        }

        Expense expense = new Expense();
        expense.employeeId = employeeId;
        expense.employeeKeycloakId = employeeKeycloakId;
        boolean selfManaged = managerKeycloakId == null || managerKeycloakId.equals(employeeKeycloakId);
        expense.managerKeycloakId = selfManaged ? null : managerKeycloakId;
        expense.hrEscalated = selfManaged;
        expense.category = category;
        expense.amount = amount;
        expense.expenseDate = expenseDate;
        expense.description = description;
        expense.status = ExpenseStatus.SUBMITTED;
        expense.secondApprovalRequired = false;
        return expense;
    }

    /**
     * First-level (direct manager, or HR when escalated) decision. BR-03: a
     * claim strictly above {@code threshold} routes to a second-level approval
     * instead of finishing; at or below it, the claim is APPROVED outright.
     */
    public void firstApproval(UUID deciderKeycloakId, String comment, Money threshold) {
        Objects.requireNonNull(deciderKeycloakId, "deciderKeycloakId");
        if (status != ExpenseStatus.SUBMITTED) {
            throw new IllegalExpenseStateException(status, "approve");
        }
        requireNotSelf(deciderKeycloakId);
        firstApproverKeycloakId = deciderKeycloakId;
        firstApprovedAt = Instant.now();
        decisionComment = comment;
        if (amount.isGreaterThan(threshold)) {
            secondApprovalRequired = true;
            status = ExpenseStatus.PENDING_SECOND_APPROVAL;
        } else {
            status = ExpenseStatus.APPROVED;
            decidedBy = deciderKeycloakId;
            decidedAt = firstApprovedAt;
        }
    }

    /** Second-level (HR/Admin) decision on an above-threshold claim (BR-03). */
    public void secondApproval(UUID deciderKeycloakId, String comment) {
        Objects.requireNonNull(deciderKeycloakId, "deciderKeycloakId");
        if (status != ExpenseStatus.PENDING_SECOND_APPROVAL) {
            throw new IllegalExpenseStateException(status, "second-approve");
        }
        requireNotSelf(deciderKeycloakId);
        if (deciderKeycloakId.equals(firstApproverKeycloakId)) {
            throw new InvalidExpenseException(
                    "second-level approval must be given by someone other than the first approver");
        }
        status = ExpenseStatus.APPROVED;
        decidedBy = deciderKeycloakId;
        decidedAt = Instant.now();
        decisionComment = comment;
    }

    /** Reject from either pending state → terminal REJECTED (BR-04 thereafter). */
    public void reject(UUID deciderKeycloakId, String comment) {
        Objects.requireNonNull(deciderKeycloakId, "deciderKeycloakId");
        if (status != ExpenseStatus.SUBMITTED && status != ExpenseStatus.PENDING_SECOND_APPROVAL) {
            throw new IllegalExpenseStateException(status, "reject");
        }
        requireNotSelf(deciderKeycloakId);
        status = ExpenseStatus.REJECTED;
        decidedBy = deciderKeycloakId;
        decidedAt = Instant.now();
        decisionComment = comment;
    }

    /** Owner cancellation — only while still pending the first decision. */
    public void cancel() {
        if (status != ExpenseStatus.SUBMITTED) {
            throw new IllegalExpenseStateException(status, "cancel");
        }
        status = ExpenseStatus.CANCELLED;
    }

    /**
     * Offboarding (BR-05): cancel a still-open claim (SUBMITTED or awaiting a
     * second-level approval) when its owner is offboarded. Decided claims
     * (APPROVED/REJECTED) and already-cancelled ones stay on record untouched —
     * the history is immutable. Returns whether this claim was cancelled.
     */
    public boolean cancelForOffboarding() {
        if (status == ExpenseStatus.SUBMITTED || status == ExpenseStatus.PENDING_SECOND_APPROVAL) {
            status = ExpenseStatus.CANCELLED;
            return true;
        }
        return false;
    }

    private void requireNotSelf(UUID deciderKeycloakId) {
        if (deciderKeycloakId.equals(employeeKeycloakId)) {
            throw new SelfDecisionException();
        }
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

    public ExpenseCategory getCategory() {
        return category;
    }

    public Money getAmount() {
        return amount;
    }

    public LocalDate getExpenseDate() {
        return expenseDate;
    }

    public String getDescription() {
        return description;
    }

    public ExpenseStatus getStatus() {
        return status;
    }

    public boolean isSecondApprovalRequired() {
        return secondApprovalRequired;
    }

    public UUID getFirstApproverKeycloakId() {
        return firstApproverKeycloakId;
    }

    public Instant getFirstApprovedAt() {
        return firstApprovedAt;
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
