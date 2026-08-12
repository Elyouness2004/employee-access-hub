package com.hub.expense.api;

import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hub.expense.application.ExpenseService;
import com.hub.expense.infrastructure.EmployeeLifecycleConsumer;
import com.hub.expense.infrastructure.IdempotentConsumer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

/**
 * The cross-context event consumer: expense-service reacting to hr-service's
 * employee lifecycle over the shared {@code employee.events} exchange.
 *
 * <p>Exercised directly rather than through a broker — the listener bean is
 * config-gated off in every default build, and a test that needed RabbitMQ
 * running would be a test that does not run. What is asserted is the part that
 * carries the risk: a delivered offboarding applies the real BR-05 close-out,
 * a redelivery does not apply it twice, and a reversible deactivation leaves
 * money owed to the employee alone.
 */
class EmployeeLifecycleConsumerTest extends ExpenseWebTestSupport {

    @Autowired
    ExpenseService expenses;
    @Autowired
    IdempotentConsumer idempotency;
    @Autowired
    ObjectMapper mapper;

    private EmployeeLifecycleConsumer consumer;

    @BeforeEach
    void setUp() {
        givenDirectoryDefaults();
        consumer = new EmployeeLifecycleConsumer(idempotency, expenses, mapper);
    }

    /** The envelope hr-service's outbox actually writes. */
    private String event(UUID keycloakId, UUID eventId) {
        return """
                {"eventId":"%s","aggregateId":"%s","keycloakId":"%s","email":"alice@corp.test",
                 "correlationId":"corr-evt-0001","occurredAt":"2026-08-12T09:00:00Z"}
                """.formatted(eventId, UUID.randomUUID(), keycloakId);
    }

    @Test
    void anOffboardedEventCancelsTheOpenClaims() throws Exception {
        String claim = submitClaim(asAlice(), "120.00");

        UUID eventId = UUID.randomUUID();
        consumer.onEvent(event(ALICE_KC, eventId), eventId.toString(), "employee.offboarded");

        mockMvc.perform(get("/api/expenses/" + claim).with(asHana()))
                .andExpect(jsonPath("$.status").value("CANCELLED"));
    }

    @Test
    void aRedeliveredEventIsAppliedAtMostOnce() throws Exception {
        String claim = submitClaim(asAlice(), "120.00");

        UUID eventId = UUID.randomUUID();
        String payload = event(ALICE_KC, eventId);
        consumer.onEvent(payload, eventId.toString(), "employee.offboarded");
        consumer.onEvent(payload, eventId.toString(), "employee.offboarded");

        // The claim is cancelled once and stays immutable; a second pass must not
        // append a second cancellation to the audit trail either.
        mockMvc.perform(get("/api/expenses/" + claim).with(asHana()))
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        assertOneOffboardingAuditEntry();
    }

    @Test
    void aDeactivationLeavesOpenClaimsAloneBecauseItIsReversible() throws Exception {
        String claim = submitClaim(asAlice(), "120.00");

        UUID eventId = UUID.randomUUID();
        consumer.onEvent(event(ALICE_KC, eventId), eventId.toString(), "employee.deactivated");

        // Cancelling a suspended employee's claim would refuse them money they
        // are still owed, and reactivation cannot bring it back.
        mockMvc.perform(get("/api/expenses/" + claim).with(asHana()))
                .andExpect(jsonPath("$.status").value("SUBMITTED"));
    }

    private void assertOneOffboardingAuditEntry() {
        long entries = auditLog.findAll().stream()
                .filter(entry -> entry.getAction().contains("OFFBOARDING"))
                .count();
        org.assertj.core.api.Assertions.assertThat(entries).isEqualTo(1);
    }
}
