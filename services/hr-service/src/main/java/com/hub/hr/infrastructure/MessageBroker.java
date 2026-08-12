package com.hub.hr.infrastructure;

/**
 * Port the outbox relay hands published events to. The logging adapter is the
 * default (no broker needed to run); the RabbitMQ adapter is config-gated
 * (hub.events.rabbit.enabled). Keeping the broker behind this port is what lets
 * the event bus be swapped without touching the relay or application layer.
 */
public interface MessageBroker {

    void publish(OutboxEvent event);
}
