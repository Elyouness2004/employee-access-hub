package com.hub.hr.infrastructure;

import com.hub.hr.config.RabbitConfig;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * RabbitMQ broker adapter (Part 4), config-gated on {@code hub.events.rabbit.enabled}.
 * Publishes the outbox event to the topic exchange keyed by its type
 * ({@code employee.provisioned} etc.), carrying the correlation id and the event
 * id as the AMQP message id — the same id consumers use for idempotency.
 */
@Component
@ConditionalOnProperty(name = "hub.events.rabbit.enabled", havingValue = "true")
public class RabbitMessageBroker implements MessageBroker {

    private final RabbitTemplate rabbitTemplate;

    public RabbitMessageBroker(RabbitTemplate rabbitTemplate) {
        this.rabbitTemplate = rabbitTemplate;
    }

    @Override
    public void publish(OutboxEvent event) {
        rabbitTemplate.convertAndSend(RabbitConfig.EXCHANGE, event.getType(), event.getPayload(), message -> {
            message.getMessageProperties().setMessageId(event.getId().toString());
            message.getMessageProperties().setCorrelationId(event.getCorrelationId());
            message.getMessageProperties().setHeader("eventType", event.getType());
            message.getMessageProperties().setContentType("application/json");
            return message;
        });
    }
}
