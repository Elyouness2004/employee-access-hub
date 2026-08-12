package com.hub.hr.domain.event;

/**
 * Port for emitting lifecycle events (Part 4). The default adapter writes to the
 * transactional outbox in the same transaction as the state change (at-least-once);
 * a relay later forwards outbox rows to the broker. Keeping this behind a port is
 * what lets the event bus replace/augment the sync-REST integration without the
 * application layer knowing (ADR-4: "ports isolate integration for later").
 */
public interface DomainEventPublisher {

    void publish(DomainEvent event);
}
