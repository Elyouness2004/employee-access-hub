package com.hub.hr.config;

import java.util.Map;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.DirectExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.annotation.EnableRabbit;
import org.springframework.amqp.rabbit.config.RetryInterceptorBuilder;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.retry.RejectAndDontRequeueRecoverer;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.retry.interceptor.RetryOperationsInterceptor;

/**
 * Event fabric topology (Part 4), config-gated on {@code hub.events.rabbit.enabled}
 * so nothing here loads — and no broker connection is attempted — in the default
 * build or H2 tests. Declares a topic exchange, the hr consumer queue dead-lettered
 * to a DLX/DLQ, and a listener factory with bounded exponential-backoff retry that
 * rejects-without-requeue to the DLQ once exhausted (retry policy + DLQ).
 */
@Configuration
@EnableRabbit
@ConditionalOnProperty(name = "hub.events.rabbit.enabled", havingValue = "true")
public class RabbitConfig {

    public static final String EXCHANGE = "employee.events";
    public static final String DLX = "employee.events.dlx";
    public static final String QUEUE = "employee.events.hr";
    public static final String DLQ = "employee.events.dlq";
    public static final String DEAD_ROUTING_KEY = "dead";
    /**
     * Notification Center queue: the downstream context that turns cross-context
     * business events (leave / expense / documents) into notifications. Bound to
     * the SAME topic exchange and dead-lettered to the SAME DLX/DLQ as the hr
     * consumer — only the routing patterns differ, so it never receives (or
     * duplicates) the employee.* lifecycle events, which are notified in-process.
     */
    public static final String NOTIFICATIONS_QUEUE = "employee.events.notifications";

    @Bean
    TopicExchange employeeEventsExchange() {
        return new TopicExchange(EXCHANGE, true, false);
    }

    @Bean
    DirectExchange employeeEventsDlx() {
        return new DirectExchange(DLX, true, false);
    }

    @Bean
    Queue employeeEventsQueue() {
        return QueueBuilder.durable(QUEUE)
                .withArguments(Map.of(
                        "x-dead-letter-exchange", DLX,
                        "x-dead-letter-routing-key", DEAD_ROUTING_KEY))
                .build();
    }

    @Bean
    Queue employeeEventsDlq() {
        return QueueBuilder.durable(DLQ).build();
    }

    @Bean
    Binding employeeEventsBinding() {
        return BindingBuilder.bind(employeeEventsQueue()).to(employeeEventsExchange()).with("employee.#");
    }

    @Bean
    Binding employeeEventsDlqBinding() {
        return BindingBuilder.bind(employeeEventsDlq()).to(employeeEventsDlx()).with(DEAD_ROUTING_KEY);
    }

    @Bean
    Queue notificationsQueue() {
        return QueueBuilder.durable(NOTIFICATIONS_QUEUE)
                .withArguments(Map.of(
                        "x-dead-letter-exchange", DLX,
                        "x-dead-letter-routing-key", DEAD_ROUTING_KEY))
                .build();
    }

    @Bean
    Binding notificationsLeaveBinding() {
        return BindingBuilder.bind(notificationsQueue()).to(employeeEventsExchange()).with("leave.#");
    }

    @Bean
    Binding notificationsExpenseBinding() {
        return BindingBuilder.bind(notificationsQueue()).to(employeeEventsExchange()).with("expense.#");
    }

    @Bean
    Binding notificationsDocumentBinding() {
        return BindingBuilder.bind(notificationsQueue()).to(employeeEventsExchange()).with("document.#");
    }

    @Bean
    RetryOperationsInterceptor eventsRetryInterceptor() {
        return RetryInterceptorBuilder.stateless()
                .maxAttempts(4)
                .backOffOptions(1000, 2.0, 10_000)
                .recoverer(new RejectAndDontRequeueRecoverer())
                .build();
    }

    @Bean
    SimpleRabbitListenerContainerFactory rabbitListenerContainerFactory(ConnectionFactory connectionFactory,
                                                                        RetryOperationsInterceptor eventsRetryInterceptor) {
        SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
        factory.setConnectionFactory(connectionFactory);
        factory.setDefaultRequeueRejected(false);
        factory.setAdviceChain(eventsRetryInterceptor);
        return factory;
    }
}
