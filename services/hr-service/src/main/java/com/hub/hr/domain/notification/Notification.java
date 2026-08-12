package com.hub.hr.domain.notification;

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
 * A single notification in one employee's history (Notification Center). Raised
 * automatically by a business event and owned by exactly one recipient — the
 * Keycloak subject ({@code recipient_id}, the JWT {@code sub}), the same key the
 * self-service session surface scopes ownership on. {@code employeeId} is kept
 * for traceability but is never how the caller is identified.
 *
 * <p>The record is <strong>immutable except its read/unread state</strong>: every
 * field is set once at construction and the only mutator is {@link #markRead()}.
 * There is deliberately no update-of-content and no delete — the history is
 * append-only in spirit, mirroring the audit trail (BR-06). Rows are naturally
 * ordered by {@code createdAt}.
 */
@Entity
@Table(name = "notification")
public class Notification {

    @Id
    @UuidGenerator
    private UUID id;

    /** Owner: the Keycloak subject the notification is addressed to (JWT {@code sub}). */
    @Column(name = "recipient_id", nullable = false)
    private UUID recipientId;

    /** The hr employee record the recipient maps to, when known (traceability only). */
    @Column(name = "employee_id")
    private UUID employeeId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private NotificationType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private NotificationStatus status = NotificationStatus.UNREAD;

    @Column(nullable = false, length = 150)
    private String title;

    @Column(nullable = false, length = 500)
    private String message;

    @Column(name = "correlation_id", length = 64)
    private String correlationId;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "read_at")
    private Instant readAt;

    protected Notification() {
        // JPA only
    }

    public Notification(UUID recipientId, UUID employeeId, NotificationType type,
                        String title, String message, String correlationId) {
        this.recipientId = recipientId;
        this.employeeId = employeeId;
        this.type = type;
        this.title = title;
        this.message = message;
        this.correlationId = correlationId;
        this.status = NotificationStatus.UNREAD;
    }

    /**
     * Mark this notification read. Idempotent: only the first transition flips the
     * status and stamps {@code readAt}; a repeat is a no-op. Returns whether this
     * call changed the state, so callers can audit exactly the real transitions.
     * No other business field is ever touched.
     */
    public boolean markRead() {
        if (status == NotificationStatus.READ) {
            return false;
        }
        this.status = NotificationStatus.READ;
        this.readAt = Instant.now();
        return true;
    }

    public boolean isUnread() {
        return status == NotificationStatus.UNREAD;
    }

    /** Ownership check for the self-service surface (zero trust, layer 3). */
    public boolean isOwnedBy(UUID keycloakSubject) {
        return recipientId.equals(keycloakSubject);
    }

    public UUID getId() {
        return id;
    }

    public UUID getRecipientId() {
        return recipientId;
    }

    public UUID getEmployeeId() {
        return employeeId;
    }

    public NotificationType getType() {
        return type;
    }

    public NotificationStatus getStatus() {
        return status;
    }

    public String getTitle() {
        return title;
    }

    public String getMessage() {
        return message;
    }

    public String getCorrelationId() {
        return correlationId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getReadAt() {
        return readAt;
    }
}
