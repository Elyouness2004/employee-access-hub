package com.hub.hr.domain;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.annotations.UuidGenerator;

/**
 * References to manager/department/position are plain identifiers (FK-enforced
 * in the schema, existence-checked in the application service) rather than JPA
 * associations: the API exchanges ids only, so object graphs buy nothing here.
 */
@Entity
@Table(name = "employee")
public class Employee {

    @Id
    @UuidGenerator
    private UUID id;

    /** Linked by identity onboarding (E04), never through the CRUD API. */
    @Column(name = "keycloak_id")
    private UUID keycloakId;

    /** Provisioning state; set by onboarding/offboarding (E04), not the CRUD API. */
    @Enumerated(EnumType.STRING)
    @Column(name = "provisioning_status", nullable = false, length = 20)
    private ProvisioningStatus provisioningStatus = ProvisioningStatus.NOT_PROVISIONED;

    @Column(name = "provisioned_at")
    private Instant provisionedAt;

    @Column(name = "last_sync_at")
    private Instant lastSyncAt;

    @Column(nullable = false, length = 32)
    private String matricule;

    @Column(name = "first_name", nullable = false, length = 100)
    private String firstName;

    @Column(name = "last_name", nullable = false, length = 100)
    private String lastName;

    @Column(nullable = false, length = 255)
    private String email;

    @Column(name = "hire_date", nullable = false)
    private LocalDate hireDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private EmployeeStatus status;

    @Column(name = "manager_id")
    private UUID managerId;

    @Column(name = "department_id", nullable = false)
    private UUID departmentId;

    @Column(name = "position_id", nullable = false)
    private UUID positionId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public UUID getId() {
        return id;
    }

    public UUID getKeycloakId() {
        return keycloakId;
    }

    /** Set once by identity onboarding (E04) when the Keycloak account is created. */
    public void setKeycloakId(UUID keycloakId) {
        this.keycloakId = keycloakId;
    }

    public boolean isProvisioned() {
        return keycloakId != null;
    }

    public ProvisioningStatus getProvisioningStatus() {
        return provisioningStatus;
    }

    public void setProvisioningStatus(ProvisioningStatus provisioningStatus) {
        this.provisioningStatus = provisioningStatus;
    }

    public Instant getProvisionedAt() {
        return provisionedAt;
    }

    public void setProvisionedAt(Instant provisionedAt) {
        this.provisionedAt = provisionedAt;
    }

    public Instant getLastSyncAt() {
        return lastSyncAt;
    }

    public void setLastSyncAt(Instant lastSyncAt) {
        this.lastSyncAt = lastSyncAt;
    }

    public String getMatricule() {
        return matricule;
    }

    public void setMatricule(String matricule) {
        this.matricule = matricule;
    }

    public String getFirstName() {
        return firstName;
    }

    public void setFirstName(String firstName) {
        this.firstName = firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public void setLastName(String lastName) {
        this.lastName = lastName;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public LocalDate getHireDate() {
        return hireDate;
    }

    public void setHireDate(LocalDate hireDate) {
        this.hireDate = hireDate;
    }

    public EmployeeStatus getStatus() {
        return status;
    }

    public void setStatus(EmployeeStatus status) {
        this.status = status;
    }

    public UUID getManagerId() {
        return managerId;
    }

    public void setManagerId(UUID managerId) {
        this.managerId = managerId;
    }

    public UUID getDepartmentId() {
        return departmentId;
    }

    public void setDepartmentId(UUID departmentId) {
        this.departmentId = departmentId;
    }

    public UUID getPositionId() {
        return positionId;
    }

    public void setPositionId(UUID positionId) {
        this.positionId = positionId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
