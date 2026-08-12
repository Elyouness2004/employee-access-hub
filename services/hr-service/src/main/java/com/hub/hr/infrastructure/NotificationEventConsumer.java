package com.hub.hr.infrastructure;

import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hub.hr.application.NotificationService;
import com.hub.hr.config.RabbitConfig;
import com.hub.hr.domain.notification.NotificationType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Config-gated consumer (hub.events.rabbit.enabled) that turns a cross-context
 * business event (leave / expense / documents) raised in another bounded context
 * into a notification in the recipient's history. It reuses the existing event
 * fabric end-to-end — the shared {@code employee.events} topic exchange + DLX/DLQ
 * + bounded-backoff retry ({@link RabbitConfig}), the AMQP message id as the event
 * id, {@link IdempotentConsumer} so an at-least-once redelivery creates the
 * notification at most once, and the same {@link NotificationService#create}
 * entry point the in-process flows use — so there is one creation path, not a
 * second pipeline.
 *
 * <p>Employee lifecycle and security notifications are deliberately NOT handled
 * here: they are generated in-process, in the same transaction as the action (the
 * audit / security-event idiom). This consumer binds only the cross-context
 * routing keys ({@code leave.#} / {@code expense.#} / {@code document.#}), so the
 * broker and in-process paths never overlap and never double-notify. It is the
 * concrete "each downstream context binds its own queue" case the co-located
 * {@link LifecycleEventConsumer} documents.
 */
@Component
@ConditionalOnProperty(name = "hub.events.rabbit.enabled", havingValue = "true")
public class NotificationEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(NotificationEventConsumer.class);
    private static final String CONSUMER = "hr-notification-consumer";

    /** Cross-context event type → notification type. employee.* is deliberately absent. */
    private static final Map<String, NotificationType> MAPPING = Map.ofEntries(
            Map.entry("leave.submitted", NotificationType.LEAVE_SUBMITTED),
            Map.entry("leave.approved", NotificationType.LEAVE_APPROVED),
            Map.entry("leave.rejected", NotificationType.LEAVE_REJECTED),
            Map.entry("expense.submitted", NotificationType.EXPENSE_SUBMITTED),
            Map.entry("expense.approved", NotificationType.EXPENSE_APPROVED),
            Map.entry("expense.rejected", NotificationType.EXPENSE_REJECTED),
            Map.entry("document.uploaded", NotificationType.DOCUMENT_UPLOADED),
            Map.entry("document.shared", NotificationType.DOCUMENT_SHARED));

    private final IdempotentConsumer idempotency;
    private final NotificationService notifications;
    private final ObjectMapper objectMapper;

    public NotificationEventConsumer(IdempotentConsumer idempotency,
                                     NotificationService notifications,
                                     ObjectMapper objectMapper) {
        this.idempotency = idempotency;
        this.notifications = notifications;
        this.objectMapper = objectMapper;
    }

    /**
     * Persist a notification for a consumed cross-context event, at most once. The
     * (event id, consumer) idempotency key and the insert share one transaction, so
     * a mid-way failure rolls both back and the redelivery re-processes cleanly.
     */
    @RabbitListener(queues = RabbitConfig.NOTIFICATIONS_QUEUE)
    @Transactional
    public void onEvent(@Payload String payload,
                        @Header("amqp_messageId") String messageId,
                        @Header(name = "eventType", required = false) String eventType) {
        UUID eventId = UUID.fromString(messageId);
        NotificationType type = MAPPING.get(eventType);
        if (type == null) {
            log.debug("no notification mapping for event type {} ({}), skipping", eventType, eventId);
            return;
        }
        if (!idempotency.firstTime(eventId, CONSUMER)) {
            log.debug("skipping duplicate delivery of event {} ({})", eventId, eventType);
            return;
        }
        JsonNode envelope = parse(payload, eventId);
        UUID recipientId = uuid(envelope, "keycloakId");
        if (recipientId == null) {
            log.warn("event {} type {} carries no recipient (keycloakId), skipping", eventId, eventType);
            return;
        }
        String correlationId = text(envelope, "correlationId");
        // employee_id is left null: a cross-context aggregate id is not an hr
        // employee id, and ownership/reads key on recipient_id.
        notifications.create(recipientId, null, type, correlationId);
        log.info("notification created for recipient {} from event {} ({})", recipientId, eventId, eventType);
    }

    private JsonNode parse(String payload, UUID eventId) {
        try {
            return objectMapper.readTree(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("cannot parse event " + eventId, e);
        }
    }

    private static UUID uuid(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull() || value.asText().isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(value.asText());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }
}
