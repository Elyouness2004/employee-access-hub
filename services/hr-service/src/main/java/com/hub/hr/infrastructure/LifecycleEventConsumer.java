package com.hub.hr.infrastructure;

import java.util.UUID;

import com.hub.hr.config.RabbitConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Component;

/**
 * Reference idempotent consumer (Part 4), config-gated on
 * {@code hub.events.rabbit.enabled}. Demonstrates the at-least-once contract:
 * the AMQP message id is the event id, {@link IdempotentConsumer} makes a
 * redelivery a no-op, and an unrecoverable failure is rejected-without-requeue so
 * the listener's retry/backoff eventually routes it to the DLQ. In production each
 * downstream context binds its own queue; here the consumer is co-located as the
 * worked example (the business fan-out itself stays on the synchronous path).
 */
@Component
@ConditionalOnProperty(name = "hub.events.rabbit.enabled", havingValue = "true")
public class LifecycleEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(LifecycleEventConsumer.class);
    private static final String CONSUMER = "hr-lifecycle-consumer";

    private final IdempotentConsumer idempotency;

    public LifecycleEventConsumer(IdempotentConsumer idempotency) {
        this.idempotency = idempotency;
    }

    @RabbitListener(queues = RabbitConfig.QUEUE)
    public void onEvent(@Payload String payload,
                        @Header("amqp_messageId") String messageId,
                        @Header(name = "eventType", required = false) String eventType) {
        UUID eventId = UUID.fromString(messageId);
        if (!idempotency.firstTime(eventId, CONSUMER)) {
            log.debug("skipping duplicate delivery of event {} ({})", eventId, eventType);
            return;
        }
        log.info("consumed event {} type={} payload={}", eventId, eventType, payload);
    }
}
