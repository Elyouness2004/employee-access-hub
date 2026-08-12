package com.hub.hr.infrastructure;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Consumer idempotency (Part 4): at-least-once delivery must have at-most-once
 * effects. The first sighting of an event id is applied; any redelivery is a
 * no-op, and different consumers track the same event independently.
 */
@SpringBootTest(properties = {
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://127.0.0.1:59999/jwks"
})
@Transactional
class IdempotentConsumerTest {

    @Autowired
    IdempotentConsumer idempotency;

    @Test
    void firstDeliveryIsAppliedAndRedeliveryIsSkipped() {
        UUID eventId = UUID.randomUUID();
        assertThat(idempotency.firstTime(eventId, "consumer-a")).isTrue();
        assertThat(idempotency.firstTime(eventId, "consumer-a")).isFalse();
        assertThat(idempotency.firstTime(eventId, "consumer-a")).isFalse();
    }

    @Test
    void differentConsumersTrackTheSameEventIndependently() {
        UUID eventId = UUID.randomUUID();
        assertThat(idempotency.firstTime(eventId, "consumer-a")).isTrue();
        assertThat(idempotency.firstTime(eventId, "consumer-b")).isTrue();
    }
}
