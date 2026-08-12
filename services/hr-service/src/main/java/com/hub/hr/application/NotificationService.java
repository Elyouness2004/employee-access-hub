package com.hub.hr.application;

import java.util.List;
import java.util.UUID;

import com.hub.hr.domain.notification.Notification;
import com.hub.hr.domain.notification.NotificationStatus;
import com.hub.hr.domain.notification.NotificationType;
import com.hub.hr.infrastructure.NotificationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Write side of the Notification Center. Two responsibilities, both mirroring the
 * existing service idiom:
 *
 * <ul>
 *   <li><strong>Generation</strong> — {@link #create} is the single entry point
 *       through which a notification is ever created. The in-process business
 *       flows (provisioning, offboarding, security actions) call it in the SAME
 *       transaction as the action, exactly as they already write the audit and
 *       security-event rows; the config-gated event consumer calls the same method
 *       for cross-context events. One creation path, no duplicate pipeline.</li>
 *   <li><strong>Read-state changes</strong> — {@link #markRead} / {@link #markAllRead}
 *       are the only mutations a caller can make, enforce ownership at the query,
 *       and audit each real transition (append-only trail, BR-06). There is no
 *       delete and no content update.</li>
 * </ul>
 */
@Service
@Transactional
public class NotificationService {

    private final NotificationRepository notifications;
    private final AuditTrail audit;

    public NotificationService(NotificationRepository notifications, AuditTrail audit) {
        this.notifications = notifications;
        this.audit = audit;
    }

    /**
     * Raise a notification for one recipient, in the caller's transaction. No-op
     * when {@code recipientId} is null (an unprovisioned account cannot be
     * addressed). Copy comes from the type's defaults so wording lives in one
     * place; the correlation id is the request's when known, else a fresh one.
     */
    public void create(UUID recipientId, UUID employeeId, NotificationType type, String correlationId) {
        if (recipientId == null) {
            return;
        }
        String cid = (correlationId != null && !correlationId.isBlank())
                ? correlationId : Correlation.currentOrNew();
        notifications.save(new Notification(recipientId, employeeId, type,
                type.title(), type.message(), cid));
    }

    /**
     * Mark one of the caller's own notifications read. 404 if the id is not theirs
     * (zero trust — ownership at the query). Idempotent: only a real UNREAD→READ
     * transition is persisted and audited.
     */
    public Notification markRead(Actor actor, UUID id) {
        Notification notification = notifications.findByIdAndRecipientId(id, actor.keycloakId())
                .orElseThrow(() -> new ResourceNotFoundException("notification", id));
        if (notification.markRead()) {
            notifications.save(notification);
            audit(actor, "NOTIFICATION_READ", "notification:" + id, "notification marked read");
        }
        return notification;
    }

    /** Mark every one of the caller's unread notifications read; returns how many changed. */
    public int markAllRead(Actor actor) {
        List<Notification> unread = notifications
                .findByRecipientIdAndStatusOrderByCreatedAtDesc(actor.keycloakId(), NotificationStatus.UNREAD);
        unread.forEach(Notification::markRead);
        if (!unread.isEmpty()) {
            notifications.saveAll(unread);
            audit(actor, "NOTIFICATION_READ_ALL", "user:" + actor.keycloakId(),
                    unread.size() + " notification(s) marked read");
        }
        return unread.size();
    }

    private void audit(Actor actor, String action, String resource, String detail) {
        audit.record(actor.username(), action, resource,
                detail + " (correlationId=" + Correlation.currentOrNew() + ")");
    }
}
