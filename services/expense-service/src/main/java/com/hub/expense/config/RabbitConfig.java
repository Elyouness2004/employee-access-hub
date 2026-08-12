package com.hub.expense.config;

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
 * This context's slice of the event fabric (Part 4), config-gated on
 * {@code hub.events.rabbit.enabled} so nothing here loads — and no broker
 * connection is attempted — in the default build or H2 tests.
 *
 * <p>Same topology contract as hr-service: the shared {@code employee.events}
 * topic exchange, a queue owned by THIS context bound to {@code employee.#},
 * dead-lettered to the shared DLX/DLQ, and bounded exponential-backoff retry that
 * rejects-without-requeue once exhausted. Declaring the exchange here as well is
 * deliberate — the declaration is idempotent, and it means expense-service can be
 * started before hr-service without the binding silently going missing.
 */
@Configuration
@EnableRabbit
@ConditionalOnProperty(name = "hub.events.rabbit.enabled", havingValue = "true")
public class RabbitConfig {

    public static final String EXCHANGE = "employee.events";
    public static final String DLX = "employee.events.dlx";
    public static final String DEAD_ROUTING_KEY = "dead";
    public static final String DLQ = "employee.events.dlq";
    /** Owned by expense-service: one queue per consuming context, never shared. */
    public static final String QUEUE = "employee.events.expense";

    @Bean
    TopicExchange employeeEventsExchange() {
        return new TopicExchange(EXCHANGE, true, false);
    }

    @Bean
    DirectExchange employeeEventsDlx() {
        return new DirectExchange(DLX, true, false);
    }

    @Bean
    Queue expenseEmployeeEventsQueue() {
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
    Binding expenseEmployeeEventsBinding() {
        return BindingBuilder.bind(expenseEmployeeEventsQueue()).to(employeeEventsExchange()).with("employee.#");
    }

    @Bean
    Binding expenseEmployeeEventsDlqBinding() {
        return BindingBuilder.bind(employeeEventsDlq()).to(employeeEventsDlx()).with(DEAD_ROUTING_KEY);
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
