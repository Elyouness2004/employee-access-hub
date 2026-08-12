package com.hub.hr.application;

import java.util.List;
import java.util.UUID;

import com.hub.hr.domain.notification.Notification;
import com.hub.hr.domain.notification.NotificationStatus;
import com.hub.hr.infrastructure.NotificationRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read side of the Notification Center (mirrors {@link SessionQueryService} /
 * {@link AuditQueryService}). Every query is scoped to the caller's Keycloak
 * subject, so a caller can only ever see their own notifications — ownership is
 * enforced in the repository query, never after the fetch. Returns domain
 * {@link Notification}s; the api layer maps them to DTOs.
 */
@Service
@Transactional(readOnly = true)
public class NotificationQueryService {

    /** Cap on the "recent" feed so an unbounded page can never be requested. */
    static final int MAX_RECENT = 50;

    private final NotificationRepository notifications;

    public NotificationQueryService(NotificationRepository notifications) {
        this.notifications = notifications;
    }

    /** The caller's full history, newest first (paged). */
    public Page<Notification> history(Actor actor, Pageable pageable) {
        return notifications.findByRecipientIdOrderByCreatedAtDesc(actor.keycloakId(), pageable);
    }

    /** The caller's most recent notifications, newest first (bounded feed). */
    public List<Notification> recent(Actor actor, int limit) {
        int capped = Math.min(Math.max(limit, 1), MAX_RECENT);
        return notifications
                .findByRecipientIdOrderByCreatedAtDesc(actor.keycloakId(), PageRequest.of(0, capped))
                .getContent();
    }

    /** The caller's unread notifications, newest first. */
    public List<Notification> unread(Actor actor) {
        return notifications.findByRecipientIdAndStatusOrderByCreatedAtDesc(
                actor.keycloakId(), NotificationStatus.UNREAD);
    }

    /** How many of the caller's notifications are unread (badge count). */
    public long unreadCount(Actor actor) {
        return notifications.countByRecipientIdAndStatus(actor.keycloakId(), NotificationStatus.UNREAD);
    }

    /** One of the caller's notifications by id; 404 when it is not theirs (zero trust). */
    public Notification byId(Actor actor, UUID id) {
        return notifications.findByIdAndRecipientId(id, actor.keycloakId())
                .orElseThrow(() -> new ResourceNotFoundException("notification", id));
    }
}
