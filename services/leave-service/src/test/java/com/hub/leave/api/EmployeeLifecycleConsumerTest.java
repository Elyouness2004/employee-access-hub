package com.hub.leave.api;

import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hub.leave.infrastructure.EmployeeLifecycleConsumer;
import com.hub.leave.infrastructure.IdempotentConsumer;
import com.hub.leave.application.LeaveRequestService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The cross-context event consumer: leave-service reacting to hr-service's
 * employee lifecycle over the shared {@code employee.events} exchange.
 *
 * <p>The consumer is exercised directly rather than through a broker. The
 * listener bean is config-gated off here (as in every default build), and a test
 * that needed RabbitMQ running would be a test that does not run — so what is
 * asserted is the part that carries the risk: that a delivered event applies the
 * real BR-05 close-out, that a redelivery does not apply it twice, and that a
 * reversible deactivation does not destroy data. The AMQP plumbing itself
 * (exchange, binding, DLQ, retry) is declarative configuration verified against
 * a live broker in the compose stack.
 */
class EmployeeLifecycleConsumerTest extends LeaveWebTestSupport {

    @Autowired
    LeaveRequestService leaveRequests;
    @Autowired
    IdempotentConsumer idempotency;
    @Autowired
    ObjectMapper mapper;

    private EmployeeLifecycleConsumer consumer;

    @BeforeEach
    void setUp() {
        givenDirectoryDefaults();
        consumer = new EmployeeLifecycleConsumer(idempotency, leaveRequests, mapper);
    }

    /**
     * The envelope hr-service's outbox actually writes. The event TYPE is not in
     * the payload — it is the AMQP routing key and the `eventType` header, which
     * is why every call below passes it separately.
     */
    private String event(UUID keycloakId, UUID eventId) {
        return """
                {"eventId":"%s","aggregateId":"%s","keycloakId":"%s","email":"alice@corp.test",
                 "correlationId":"corr-evt-0001","occurredAt":"2026-08-12T09:00:00Z"}
                """.formatted(eventId, UUID.randomUUID(), keycloakId);
    }

    @Test
    void anOffboardedEventCancelsPendingLeaveAndRecreditsTheBalance() throws Exception {
        String approved = submitAnnual(asAlice(), "2026-12-07", "2026-12-11");
        mockMvc.perform(post("/api/leave/requests/" + approved + "/approve").with(asMark()))
                .andExpect(status().isOk());
        String pending = submitAnnual(asAlice(), "2026-11-02", "2026-11-06");
        mockMvc.perform(get("/api/leave/balances/my").with(asAlice()).param("year", "2026"))
                .andExpect(jsonPath("$.usedDays").value(5));

        UUID eventId = UUID.randomUUID();
        consumer.onEvent(event(ALICE_KC, eventId), eventId.toString(), "employee.offboarded");

        mockMvc.perform(get("/api/leave/requests/" + approved).with(asHana()))
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        mockMvc.perform(get("/api/leave/requests/" + pending).with(asHana()))
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        mockMvc.perform(get("/api/leave/balances/my").with(asAlice()).param("year", "2026"))
                .andExpect(jsonPath("$.usedDays").value(0));
    }

    @Test
    void aRedeliveredEventDoesNotCancelOrRecreditTwice() throws Exception {
        String approved = submitAnnual(asAlice(), "2026-12-07", "2026-12-11");
        mockMvc.perform(post("/api/leave/requests/" + approved + "/approve").with(asMark()))
                .andExpect(status().isOk());

        UUID eventId = UUID.randomUUID();
        String payload = event(ALICE_KC, eventId);
        consumer.onEvent(payload, eventId.toString(), "employee.offboarded");
        // At-least-once delivery: the SAME event id arrives again.
        consumer.onEvent(payload, eventId.toString(), "employee.offboarded");

        // A second re-credit would hand the departed employee five days back
        // twice and leave the balance permanently wrong.
        mockMvc.perform(get("/api/leave/balances/my").with(asAlice()).param("year", "2026"))
                .andExpect(jsonPath("$.usedDays").value(0))
                .andExpect(jsonPath("$.availableDays").value(25));
    }

    @Test
    void aDeactivationDoesNotTouchLeaveBecauseItIsReversible() throws Exception {
        String pending = submitAnnual(asAlice(), "2026-11-02", "2026-11-06");

        UUID eventId = UUID.randomUUID();
        consumer.onEvent(event(ALICE_KC, eventId), eventId.toString(), "employee.deactivated");

        // Cancelling a suspended employee's leave would destroy something
        // reactivation cannot restore. Access is blocked at the identity layer.
        mockMvc.perform(get("/api/leave/requests/" + pending).with(asHana()))
                .andExpect(jsonPath("$.status").value("SUBMITTED"));
    }

    @Test
    void aReactivationIsRecordedAndIgnored() throws Exception {
        String pending = submitAnnual(asAlice(), "2026-11-02", "2026-11-06");

        UUID eventId = UUID.randomUUID();
        consumer.onEvent(event(ALICE_KC, eventId), eventId.toString(), "employee.reactivated");

        mockMvc.perform(get("/api/leave/requests/" + pending).with(asHana()))
                .andExpect(jsonPath("$.status").value("SUBMITTED"));
    }

    @Test
    void anOffboardingForSomebodyWithNoAccountIsANoOpRatherThanAFailure() {
        UUID eventId = UUID.randomUUID();
        String payload = """
                {"eventId":"%s","aggregateId":"%s","keycloakId":null,"email":"nobody@corp.test",
                 "correlationId":"corr-evt-0002","occurredAt":"2026-08-12T09:00:00Z"}
                """.formatted(eventId, UUID.randomUUID());

        // An employee who was never provisioned owns no leave keyed to a subject.
        consumer.onEvent(payload, eventId.toString(), "employee.offboarded");
    }
}
