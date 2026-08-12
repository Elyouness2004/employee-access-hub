package com.hub.hr.infrastructure;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Default broker adapter: the service runs and the relay drains without any
 * message broker. Active unless the RabbitMQ adapter is enabled
 * (hub.events.rabbit.enabled=true).
 */
@Component
@ConditionalOnProperty(name = "hub.events.rabbit.enabled", havingValue = "false", matchIfMissing = true)
public class LoggingMessageBroker implements MessageBroker {

    private static final Logger log = LoggerFactory.getLogger(LoggingMessageBroker.class);

    @Override
    public void publish(OutboxEvent event) {
        log.info("event published type={} aggregate={} correlationId={} payload={}",
                event.getType(), event.getAggregateId(), event.getCorrelationId(), event.getPayload());
    }
}
