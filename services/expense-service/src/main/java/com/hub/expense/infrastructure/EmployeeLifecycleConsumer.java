package com.hub.expense.infrastructure;

import java.util.UUID;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hub.expense.api.dto.OffboardingResult;
import com.hub.expense.application.Actor;
import com.hub.expense.application.ExpenseService;
import com.hub.expense.config.RabbitConfig;
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
 * <p>Only {@code employee.offboarded} carries a business action here — the BR-05
 * close-out that cancels still-open claims, through the very same
 * {@link ExpenseService#offboard} entry point the synchronous fan-out calls.
 * Settled history stays immutable either way. hr-service still calls
 * {@code /internal/expense/offboarding} inside the request so the operator sees
 * the result immediately; this consumer is the safety net for when that call
 * fails or expense-service was down at the time, and the idempotency key makes
 * the overlap harmless.
 *
 * <p>{@code employee.deactivated} / {@code employee.reactivated} are recorded and
 * ignored: a deactivation is reversible, and cancelling a suspended employee's
 * pending claims would destroy money owed to them that reactivation could not
 * restore. The disabled account already blocks access, which is the right place
 * for a reversible measure.
 */
@Component
@ConditionalOnProperty(name = "hub.events.rabbit.enabled", havingValue = "true")
public class EmployeeLifecycleConsumer {

    private static final Logger log = LoggerFactory.getLogger(EmployeeLifecycleConsumer.class);
    private static final String CONSUMER = "expense-employee-lifecycle";
    private static final String OFFBOARDED = "employee.offboarded";
    private static final String CORRELATION_MDC_KEY = "correlationId";

    private final IdempotentConsumer idempotency;
    private final ExpenseService expenses;
    private final ObjectMapper objectMapper;

    public EmployeeLifecycleConsumer(IdempotentConsumer idempotency,
                                     ExpenseService expenses,
                                     ObjectMapper objectMapper) {
        this.idempotency = idempotency;
        this.expenses = expenses;
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
            log.debug("event {} ({}) needs no expense action", eventId, eventType);
            return;
        }
        JsonNode envelope = parse(payload, eventId);
        UUID employeeKeycloakId = uuid(envelope, "keycloakId");
        if (employeeKeycloakId == null) {
            log.info("offboarding event {} carries no keycloakId — nothing to close out", eventId);
            return;
        }
        String previous = MDC.get(CORRELATION_MDC_KEY);
        String correlationId = text(envelope, "correlationId");
        if (correlationId != null) {
            MDC.put(CORRELATION_MDC_KEY, correlationId);
        }
        try {
            OffboardingResult result = expenses.offboard(systemActor(employeeKeycloakId), employeeKeycloakId);
            log.info("offboarding event {} closed out expenses for {}: {} claim(s) cancelled",
                    eventId, employeeKeycloakId, result.cancelledClaims());
        } finally {
            if (previous != null) {
                MDC.put(CORRELATION_MDC_KEY, previous);
            } else {
                MDC.remove(CORRELATION_MDC_KEY);
            }
        }
    }

    /**
     * The platform acting on its own behalf: the same close-out an HR operator's
     * synchronous call performs. The event arrived from hr-service over an
     * authenticated broker connection, so there is no user token to relay.
     */
    private static Actor systemActor(UUID employeeKeycloakId) {
        return new Actor(employeeKeycloakId, "system:events", true);
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
