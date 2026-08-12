package com.hub.expense.infrastructure;

import java.util.UUID;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Idempotency guard for at-least-once event consumers (Part 4). {@link #firstTime}
 * records the (eventId, consumer) key and returns whether this is the first time
 * this context has seen the event, so a redelivery is applied at most once.
 *
 * <p>Called inside the consumer's transaction on purpose: the key and the business
 * effect commit together, so a failure half-way rolls both back and the redelivery
 * re-processes cleanly rather than being skipped as "already done".
 */
@Component
public class IdempotentConsumer {

    private final ProcessedEventRepository processed;

    public IdempotentConsumer(ProcessedEventRepository processed) {
        this.processed = processed;
    }

    @Transactional
    public boolean firstTime(UUID eventId, String consumer) {
        if (processed.existsByEventIdAndConsumer(eventId, consumer)) {
            return false;
        }
        processed.save(new ProcessedEvent(eventId, consumer));
        return true;
    }
}
