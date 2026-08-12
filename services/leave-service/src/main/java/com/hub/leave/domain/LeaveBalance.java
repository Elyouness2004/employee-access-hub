package com.hub.leave.domain;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.UuidGenerator;

/**
 * Per-employee, per-calendar-year allocation of balance-tracked leave.
 * BR-01 is enforced here: {@link #debit} is the only way days are consumed,
 * and it refuses to go below zero available.
 */
@Entity
@Table(name = "leave_balance")
public class LeaveBalance {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "employee_id", nullable = false)
    private UUID employeeId;

    @Column(name = "employee_keycloak_id", nullable = false)
    private UUID employeeKeycloakId;

    @Column(name = "balance_year", nullable = false)
    private int year;

    @Column(name = "total_days", nullable = false)
    private int totalDays;

    @Column(name = "used_days", nullable = false)
    private int usedDays;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected LeaveBalance() {
        // JPA only
    }

    public static LeaveBalance provision(UUID employeeId, UUID employeeKeycloakId,
                                         int year, int totalDays) {
        Objects.requireNonNull(employeeId, "employeeId");
        Objects.requireNonNull(employeeKeycloakId, "employeeKeycloakId");
        if (totalDays < 0) {
            throw new InvalidBalanceAdjustmentException("allocation cannot be negative: " + totalDays);
        }
        LeaveBalance balance = new LeaveBalance();
        balance.employeeId = employeeId;
        balance.employeeKeycloakId = employeeKeycloakId;
        balance.year = year;
        balance.totalDays = totalDays;
        balance.usedDays = 0;
        return balance;
    }

    public int availableDays() {
        return totalDays - usedDays;
    }

    /** BR-01: never consume more than what is available. */
    public void debit(int days) {
        if (days > availableDays()) {
            throw new InsufficientBalanceException(days, availableDays());
        }
        usedDays += days;
    }

    /** Re-credit on offboarding cancellation (BR-05); never below zero used. */
    public void credit(int days) {
        usedDays = Math.max(0, usedDays - days);
    }

    /** HR adjustment (FR-22): total may move but never below days already used. */
    public void adjustTotal(int newTotalDays) {
        if (newTotalDays < 0) {
            throw new InvalidBalanceAdjustmentException("allocation cannot be negative: " + newTotalDays);
        }
        if (newTotalDays < usedDays) {
            throw new InvalidBalanceAdjustmentException(
                    "allocation " + newTotalDays + " is below the " + usedDays + " day(s) already used");
        }
        totalDays = newTotalDays;
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

    public int getYear() {
        return year;
    }

    public int getTotalDays() {
        return totalDays;
    }

    public int getUsedDays() {
        return usedDays;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
