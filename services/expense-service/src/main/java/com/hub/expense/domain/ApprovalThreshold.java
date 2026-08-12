package com.hub.expense.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.UpdateTimestamp;

/**
 * The configurable BR-03 second-level approval threshold. A single row keyed by
 * a fixed natural key so HR/Admin edits are updates, never inserts — Flyway
 * seeds the default, this entity only ever mutates it.
 */
@Entity
@Table(name = "expense_settings")
public class ApprovalThreshold {

    /** Fixed natural key of the single settings row. */
    public static final String KEY = "APPROVAL_THRESHOLD";

    @Id
    @Column(name = "setting_key", length = 40)
    private String settingKey;

    @Embedded
    private Money threshold;

    @Column(name = "updated_by", length = 255)
    private String updatedBy;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ApprovalThreshold() {
        // JPA only
    }

    public Money getThreshold() {
        return threshold;
    }

    /** HR/Admin adjustment (BR-03): a non-negative amount in the settings currency. */
    public void adjust(Money newThreshold, String updatedBy) {
        if (newThreshold.amount().signum() < 0) {
            throw new InvalidExpenseException("threshold must not be negative");
        }
        if (!newThreshold.currency().equals(threshold.currency())) {
            throw new CurrencyMismatchException(threshold.currency(), newThreshold.currency());
        }
        this.threshold = newThreshold;
        this.updatedBy = updatedBy;
    }

    public String getSettingKey() {
        return settingKey;
    }

    public String getUpdatedBy() {
        return updatedBy;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
