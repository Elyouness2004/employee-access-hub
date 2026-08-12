package com.hub.hr.infrastructure;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.Limit;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Drains the transactional outbox to the broker (Part 4). Config-gated
 * (hub.events.relay.enabled) so the default build/tests keep the events in the
 * outbox as an inspectable trail without a running relay. Each pass forwards a
 * bounded batch; a failed hand-off leaves the row unpublished with an incremented
 * attempt count, so the next pass retries it (at-least-once).
 */
@Component
@ConditionalOnProperty(name = "hub.events.relay.enabled", havingValue = "true")
public class OutboxRelay {

    private static final Logger log = LoggerFactory.getLogger(OutboxRelay.class);

    private final OutboxEventRepository outbox;
    private final MessageBroker broker;
    private final int batchSize;

    public OutboxRelay(OutboxEventRepository outbox, MessageBroker broker,
                       @org.springframework.beans.factory.annotation.Value("${hub.events.relay.batch-size:100}")
                       int batchSize) {
        this.outbox = outbox;
        this.broker = broker;
        this.batchSize = batchSize;
    }

    @Scheduled(fixedDelayString = "${hub.events.relay.interval-ms:5000}")
    @Transactional
    public void drain() {
        List<OutboxEvent> batch = outbox.findByPublishedAtIsNullOrderByCreatedAtAsc(Limit.of(batchSize));
        for (OutboxEvent event : batch) {
            try {
                broker.publish(event);
                event.markPublished();
            } catch (RuntimeException e) {
                event.markFailed(e.toString());
                log.warn("outbox relay failed for event {} (attempt {}): {}",
                        event.getId(), event.getAttempts(), e.toString());
            }
        }
    }
}
