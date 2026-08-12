package com.hub.hr.infrastructure;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UuidGenerator;

/**
 * Append-only provisioning history (Part 5/7): one row per identity action
 * attempt against an employee, success or failure. Never updated or deleted.
 */
@Entity
@Table(name = "provisioning_record")
public class ProvisioningRecord {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "employee_id", nullable = false)
    private UUID employeeId;

    @Column(name = "keycloak_id")
    private UUID keycloakId;

    @Column(nullable = false, length = 40)
    private String action;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ProvisioningRecordStatus status;

    @Column(length = 2000)
    private String detail;

    @CreationTimestamp
    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;

    protected ProvisioningRecord() {
        // JPA only
    }

    public ProvisioningRecord(UUID employeeId, UUID keycloakId, String action,
                              ProvisioningRecordStatus status, String detail) {
        this.employeeId = employeeId;
        this.keycloakId = keycloakId;
        this.action = action;
        this.status = status;
        this.detail = detail;
    }

    public UUID getId() {
        return id;
    }

    public UUID getEmployeeId() {
        return employeeId;
    }

    public UUID getKeycloakId() {
        return keycloakId;
    }

    public String getAction() {
        return action;
    }

    public ProvisioningRecordStatus getStatus() {
        return status;
    }

    public String getDetail() {
        return detail;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }
}
