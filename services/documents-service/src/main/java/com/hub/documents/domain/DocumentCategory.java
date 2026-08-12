package com.hub.documents.domain;

import java.time.Instant;
import java.util.Objects;
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
 * A document category and the minimum role required to read its documents.
 * A sensitive category ({@code minRole} in HR/ADMIN) is the FR-41 access gate.
 */
@Entity
@Table(name = "document_category")
public class DocumentCategory {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(nullable = false, length = 100, unique = true)
    private String name;

    @Column(length = 500)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "min_role", nullable = false, length = 20)
    private AccessRole minRole;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected DocumentCategory() {
        // JPA only
    }

    public DocumentCategory(String name, String description, AccessRole minRole) {
        rename(name, description, minRole);
    }

    public void rename(String name, String description, AccessRole minRole) {
        this.name = Objects.requireNonNull(name, "name");
        this.description = description;
        this.minRole = Objects.requireNonNull(minRole, "minRole");
    }

    public boolean isSensitive() {
        return minRole.isSensitiveTier();
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public AccessRole getMinRole() {
        return minRole;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
