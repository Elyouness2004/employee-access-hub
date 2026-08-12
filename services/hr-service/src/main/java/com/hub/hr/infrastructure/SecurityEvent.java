package com.hub.hr.infrastructure;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UuidGenerator;

/**
 * Security-event history (Part 6): admin-driven identity security actions
 * (disable, lock, unlock, password reset, session/refresh revocation). Keycloak
 * native login/logout ingestion (P3.6) is a later slice. Append-only.
 */
@Entity
@Table(name = "security_event")
public class SecurityEvent {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "keycloak_id")
    private UUID keycloakId;

    @Column(length = 255)
    private String username;

    @Column(nullable = false, length = 30)
    private String type;

    @Column(nullable = false, length = 255)
    private String actor;

    @Column(length = 2000)
    private String detail;

    @CreationTimestamp
    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;

    protected SecurityEvent() {
        // JPA only
    }

    public SecurityEvent(UUID keycloakId, String username, String type, String actor, String detail) {
        this.keycloakId = keycloakId;
        this.username = username;
        this.type = type;
        this.actor = actor;
        this.detail = detail;
    }

    public UUID getId() {
        return id;
    }

    public UUID getKeycloakId() {
        return keycloakId;
    }

    public String getUsername() {
        return username;
    }

    public String getType() {
        return type;
    }

    public String getActor() {
        return actor;
    }

    public String getDetail() {
        return detail;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }
}
