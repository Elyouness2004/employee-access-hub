package com.hub.leave.infrastructure;

import java.util.UUID;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hub.leave.api.dto.OffboardingResult;
import com.hub.leave.application.Actor;
import com.hub.leave.application.LeaveRequestService;
import com.hub.leave.config.RabbitConfig;
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
 * close-out that cancels pending requests and re-credits not-yet-started approved
 * leave, through the very same {@link LeaveRequestService#offboard} entry point
 * the synchronous fan-out calls. There is one implementation of the rule, reached
 * two ways: hr-service still calls {@code /internal/leave/offboarding} inside the
 * request so the operator sees the result immediately, and this consumer is the
 * safety net for when that call fails or leave-service was down at the time. The
 * idempotency key makes the overlap harmless — whichever arrives second is a no-op.
 *
 * <p>{@code employee.deactivated} / {@code employee.reactivated} are deliberately
 * recorded and ignored: a deactivation is reversible, so cancelling somebody's
 * approved leave because they were suspended for a fortnight would destroy data
 * that reactivation could not restore. Access is already blocked at the identity
 * layer, which is the correct place for a reversible measure.
 */
@Component
@ConditionalOnProperty(name = "hub.events.rabbit.enabled", havingValue = "true")
public class EmployeeLifecycleConsumer {

    private static final Logger log = LoggerFactory.getLogger(EmployeeLifecycleConsumer.class);
    private static final String CONSUMER = "leave-employee-lifecycle";
    private static final String OFFBOARDED = "employee.offboarded";
    private static final String CORRELATION_MDC_KEY = "correlationId";

    private final IdempotentConsumer idempotency;
    private final LeaveRequestService leaveRequests;
    private final ObjectMapper objectMapper;

    public EmployeeLifecycleConsumer(IdempotentConsumer idempotency,
                                     LeaveRequestService leaveRequests,
                                     ObjectMapper objectMapper) {
        this.idempotency = idempotency;
        this.leaveRequests = leaveRequests;
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
            log.debug("event {} ({}) needs no leave action", eventId, eventType);
            return;
        }
        JsonNode envelope = parse(payload, eventId);
        UUID employeeKeycloakId = uuid(envelope, "keycloakId");
        if (employeeKeycloakId == null) {
            // An offboarded employee who never had an account owns no leave either.
            log.info("offboarding event {} carries no keycloakId — nothing to close out", eventId);
            return;
        }
        String previous = MDC.get(CORRELATION_MDC_KEY);
        String correlationId = text(envelope, "correlationId");
        if (correlationId != null) {
            MDC.put(CORRELATION_MDC_KEY, correlationId);
        }
        try {
            OffboardingResult result = leaveRequests.offboard(systemActor(employeeKeycloakId), employeeKeycloakId);
            log.info("offboarding event {} closed out leave for {}: {} request(s) cancelled, {} day(s) re-credited",
                    eventId, employeeKeycloakId, result.cancelledRequests(), result.recreditedDays());
        } finally {
            if (previous != null) {
                MDC.put(CORRELATION_MDC_KEY, previous);
            } else {
                MDC.remove(CORRELATION_MDC_KEY);
            }
        }
    }

    /**
     * The platform acting on its own behalf. {@code hrOrAdmin} is true because the
     * close-out is exactly what an HR operator's synchronous call performs; the
     * event arrived from hr-service over an authenticated broker connection, so
     * there is no user token to relay and none is needed.
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
