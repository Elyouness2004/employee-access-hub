package com.hub.hr.infrastructure;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.hub.hr.domain.notification.Notification;
import com.hub.hr.domain.notification.NotificationStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Notification persistence port (Spring Data), placed in {@code infrastructure}
 * like every other repository in this service ({@link EmployeeRepository},
 * {@link AuditLogRepository}, …). All reads are scoped by {@code recipientId} (the
 * Keycloak subject) so ownership is enforced at the query, not after the fetch —
 * a caller can never load another employee's notifications.
 */
public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    /** A recipient's full history, newest first (paged). */
    Page<Notification> findByRecipientIdOrderByCreatedAtDesc(UUID recipientId, Pageable pageable);

    /** A recipient's notifications in one status, newest first (unread list, read-all source). */
    List<Notification> findByRecipientIdAndStatusOrderByCreatedAtDesc(UUID recipientId, NotificationStatus status);

    /** Count in one status for one recipient (unread badge). */
    long countByRecipientIdAndStatus(UUID recipientId, NotificationStatus status);

    /** Ownership-scoped single fetch: empty (→ 404) when the id is not this recipient's. */
    Optional<Notification> findByIdAndRecipientId(UUID id, UUID recipientId);
}
