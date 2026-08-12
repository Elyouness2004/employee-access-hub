package com.hub.hr.infrastructure;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hub.hr.domain.event.DomainEvent;
import com.hub.hr.domain.event.DomainEventPublisher;
import org.springframework.stereotype.Component;

/**
 * Default {@link DomainEventPublisher}: serializes the event and writes it to the
 * outbox in the caller's transaction (at-least-once). The relay forwards it to
 * the broker later, so publishing an event can never fail the business action for
 * a broker reason — and the event is never lost if the broker is down.
 */
@Component
public class OutboxDomainEventPublisher implements DomainEventPublisher {

    private final OutboxEventRepository outbox;
    private final ObjectMapper objectMapper;

    public OutboxDomainEventPublisher(OutboxEventRepository outbox, ObjectMapper objectMapper) {
        this.outbox = outbox;
        this.objectMapper = objectMapper;
    }

    @Override
    public void publish(DomainEvent event) {
        String payload;
        try {
            payload = objectMapper.writeValueAsString(event);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("cannot serialize event " + event.type(), e);
        }
        outbox.save(new OutboxEvent(event.eventId(), event.aggregateId(), event.type(),
                payload, event.correlationId()));
    }
}
