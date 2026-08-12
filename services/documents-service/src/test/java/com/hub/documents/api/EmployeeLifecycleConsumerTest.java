package com.hub.documents.api;

import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hub.documents.application.DocumentService;
import com.hub.documents.infrastructure.EmployeeLifecycleConsumer;
import com.hub.documents.infrastructure.IdempotentConsumer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

/**
 * The cross-context event consumer: documents-service reacting to hr-service's
 * employee lifecycle over the shared {@code employee.events} exchange.
 *
 * <p>Exercised directly rather than through a broker — the listener bean is
 * config-gated off in every default build. What is asserted is the part that
 * carries the risk: a delivered offboarding revokes ownership (never deletes),
 * a redelivery does not double-apply, and a reversible deactivation leaves the
 * employee's documents where they will expect to find them.
 */
class EmployeeLifecycleConsumerTest extends DocumentsWebTestSupport {

    @Autowired
    DocumentService documents;
    @Autowired
    IdempotentConsumer idempotency;
    @Autowired
    ObjectMapper mapper;

    private EmployeeLifecycleConsumer consumer;

    @BeforeEach
    void setUp() {
        consumer = new EmployeeLifecycleConsumer(idempotency, documents, mapper);
    }

    /** The envelope hr-service's outbox actually writes. */
    private String event(UUID keycloakId, UUID eventId) {
        return """
                {"eventId":"%s","aggregateId":"%s","keycloakId":"%s","email":"alice@corp.test",
                 "correlationId":"corr-evt-0001","occurredAt":"2026-08-12T09:00:00Z"}
                """.formatted(eventId, UUID.randomUUID(), keycloakId);
    }

    @Test
    void anOffboardedEventRevokesOwnershipWithoutDeletingTheDocument() throws Exception {
        String documentId = upload(asHana(), "AliceRecord", GENERAL_CAT, ALICE_KC);

        UUID eventId = UUID.randomUUID();
        consumer.onEvent(event(ALICE_KC, eventId), eventId.toString(), "employee.offboarded");

        // The document survives; only the ownership link is cut.
        mockMvc.perform(get("/api/documents/" + documentId).with(asHana()))
                .andExpect(jsonPath("$.id").value(documentId))
                .andExpect(jsonPath("$.ownerKeycloakId").doesNotExist());
    }

    @Test
    void aRedeliveredEventIsAppliedAtMostOnce() throws Exception {
        String documentId = upload(asHana(), "AliceRecord", GENERAL_CAT, ALICE_KC);

        UUID eventId = UUID.randomUUID();
        String payload = event(ALICE_KC, eventId);
        consumer.onEvent(payload, eventId.toString(), "employee.offboarded");
        consumer.onEvent(payload, eventId.toString(), "employee.offboarded");

        mockMvc.perform(get("/api/documents/" + documentId).with(asHana()))
                .andExpect(jsonPath("$.id").value(documentId));
    }

    @Test
    void aDeactivationLeavesOwnershipIntactBecauseItIsReversible() throws Exception {
        String documentId = upload(asHana(), "AliceRecord", GENERAL_CAT, ALICE_KC);

        UUID eventId = UUID.randomUUID();
        consumer.onEvent(event(ALICE_KC, eventId), eventId.toString(), "employee.deactivated");

        // A suspended employee must find their documents where they left them.
        mockMvc.perform(get("/api/documents/" + documentId).with(asHana()))
                .andExpect(jsonPath("$.ownerKeycloakId").value(ALICE_KC.toString()));
    }
}
