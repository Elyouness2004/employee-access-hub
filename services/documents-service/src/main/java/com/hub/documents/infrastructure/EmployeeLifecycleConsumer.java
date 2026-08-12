package com.hub.documents.infrastructure;

import java.util.UUID;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hub.documents.api.dto.OffboardingResult;
import com.hub.documents.application.Actor;
import com.hub.documents.application.DocumentService;
import com.hub.documents.config.RabbitConfig;
import com.hub.documents.domain.AccessRole;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reacts to hr-service's employee lifecycle events (Part 4), config-gated on
 * {@code hub.events.rabbit.enabled}.
 *
 * <p>Only {@code employee.offboarded} carries a business action here — revoking
 * the departed employee's document ownership through the very same
 * {@link DocumentService#offboard} entry point the synchronous fan-out calls. The
 * documents and their audit trail are preserved; only the ownership link is cut.
 * hr-service still calls {@code /internal/documents/offboarding} inside the
 * request so the operator sees the result immediately; this consumer is the
 * safety net for when that call fails or documents-service was down at the time,
 * and the idempotency key makes the overlap harmless.
 *
 * <p>{@code employee.deactivated} / {@code employee.reactivated} are recorded and
 * ignored: a deactivation is reversible, and ownership revocation is not — a
 * suspended employee must find their documents where they left them when they
 * come back. The disabled account already blocks access meanwhile.
 */
@Component
@ConditionalOnProperty(name = "hub.events.rabbit.enabled", havingValue = "true")
public class EmployeeLifecycleConsumer {

    private static final Logger log = LoggerFactory.getLogger(EmployeeLifecycleConsumer.class);
    private static final String CONSUMER = "documents-employee-lifecycle";
    private static final String OFFBOARDED = "employee.offboarded";
    private static final String CORRELATION_MDC_KEY = "correlationId";

    private final IdempotentConsumer idempotency;
    private final DocumentService documents;
    private final ObjectMapper objectMapper;

    public EmployeeLifecycleConsumer(IdempotentConsumer idempotency,
                                     DocumentService documents,
                                     ObjectMapper objectMapper) {
        this.idempotency = idempotency;
        this.documents = documents;
        this.objectMapper = objectMapper;
    }

    @RabbitListener(queues = RabbitConfig.QUEUE)
    @Transactional
    public void onEvent(@Payload String payload,
                        @Header("amqp_messageId") String messageId,
                        @Header(name = "eventType", required = false) String eventType) {
        UUID eventId = UUID.fromString(messageId);
        if (!idempotency.firstTime(eventId, CONSUMER)) {
            log.debug("skipping duplicate delivery of event {} ({})", eventId, eventType);
            return;
        }
        if (!OFFBOARDED.equals(eventType)) {
            log.debug("event {} ({}) needs no documents action", eventId, eventType);
            return;
        }
        JsonNode envelope = parse(payload, eventId);
        UUID employeeKeycloakId = uuid(envelope, "keycloakId");
        if (employeeKeycloakId == null) {
            log.info("offboarding event {} carries no keycloakId — nothing to revoke", eventId);
            return;
        }
        String previous = MDC.get(CORRELATION_MDC_KEY);
        String correlationId = text(envelope, "correlationId");
        if (correlationId != null) {
            MDC.put(CORRELATION_MDC_KEY, correlationId);
        }
        try {
            OffboardingResult result = documents.offboard(systemActor(employeeKeycloakId), employeeKeycloakId);
            log.info("offboarding event {} revoked document ownership for {}: {} document(s)",
                    eventId, employeeKeycloakId, result.ownershipRevoked());
        } finally {
            if (previous != null) {
                MDC.put(CORRELATION_MDC_KEY, previous);
            } else {
                MDC.remove(CORRELATION_MDC_KEY);
            }
        }
    }

    /**
     * The platform acting on its own behalf, at the same tier the synchronous
     * HR/ADMIN call runs at. The event arrived from hr-service over an
     * authenticated broker connection, so there is no user token to relay.
     */
    private static Actor systemActor(UUID employeeKeycloakId) {
        return new Actor(employeeKeycloakId, "system:events", AccessRole.ADMIN);
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
