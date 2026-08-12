package com.hub.hr.infrastructure;

import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hub.hr.application.NotificationService;
import com.hub.hr.domain.notification.NotificationType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Cross-context RabbitMQ consumer: maps a mapped event type to a notification,
 * extracts the recipient from the shared event envelope, is idempotent on
 * redelivery, ignores unmapped types without consuming the idempotency key, and
 * routes creation through the single {@link NotificationService#create} entry
 * point (no second pipeline). Unit-level because the listener itself is
 * config-gated on a running broker.
 */
@ExtendWith(MockitoExtension.class)
class NotificationEventConsumerTest {

    @Mock
    IdempotentConsumer idempotency;
    @Mock
    NotificationService notifications;

    final ObjectMapper objectMapper = new ObjectMapper();
    NotificationEventConsumer consumer;

    @BeforeEach
    void setUp() {
        consumer = new NotificationEventConsumer(idempotency, notifications, objectMapper);
    }

    @Test
    void createsANotificationForAKnownCrossContextEvent() {
        UUID eventId = UUID.randomUUID();
        UUID recipient = UUID.randomUUID();
        when(idempotency.firstTime(eq(eventId), anyString())).thenReturn(true);
        String payload = "{\"keycloakId\":\"" + recipient + "\",\"aggregateId\":\""
                + UUID.randomUUID() + "\",\"correlationId\":\"corr-9\"}";

        consumer.onEvent(payload, eventId.toString(), "leave.approved");

        verify(notifications).create(recipient, null, NotificationType.LEAVE_APPROVED, "corr-9");
    }

    @Test
    void isIdempotentAndSkipsADuplicateDelivery() {
        UUID eventId = UUID.randomUUID();
        when(idempotency.firstTime(eq(eventId), anyString())).thenReturn(false);
        String payload = "{\"keycloakId\":\"" + UUID.randomUUID() + "\"}";

        consumer.onEvent(payload, eventId.toString(), "expense.rejected");

        verifyNoInteractions(notifications);
    }

    @Test
    void ignoresAnUnmappedEventTypeWithoutConsumingTheIdempotencyKey() {
        consumer.onEvent("{}", UUID.randomUUID().toString(), "employee.provisioned");

        verifyNoInteractions(idempotency);
        verifyNoInteractions(notifications);
    }

    @Test
    void skipsAnEventThatCarriesNoRecipient() {
        UUID eventId = UUID.randomUUID();
        when(idempotency.firstTime(eq(eventId), anyString())).thenReturn(true);

        consumer.onEvent("{\"correlationId\":\"c\"}", eventId.toString(), "document.shared");

        verify(notifications, never()).create(any(), any(), any(), anyString());
    }

    @Test
    void mapsEachCrossContextRoutingKeyToItsNotificationType() {
        UUID recipient = UUID.randomUUID();
        when(idempotency.firstTime(any(), anyString())).thenReturn(true);
        String payload = "{\"keycloakId\":\"" + recipient + "\"}";

        consumer.onEvent(payload, UUID.randomUUID().toString(), "expense.approved");

        verify(notifications).create(eq(recipient), isNull(), eq(NotificationType.EXPENSE_APPROVED), any());
    }
}
