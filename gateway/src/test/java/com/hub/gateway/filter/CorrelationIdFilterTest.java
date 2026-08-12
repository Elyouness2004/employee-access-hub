package com.hub.gateway.filter;

import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;

import reactor.core.publisher.Mono;

import static com.hub.gateway.filter.CorrelationIdFilter.CORRELATION_ID_HEADER;
import static org.assertj.core.api.Assertions.assertThat;

class CorrelationIdFilterTest {

    private final CorrelationIdFilter filter = new CorrelationIdFilter();

    private ServerWebExchange runFilter(MockServerWebExchange exchange, AtomicReference<ServerWebExchange> downstream) {
        GatewayFilterChain chain = mutated -> {
            downstream.set(mutated);
            return Mono.empty();
        };
        filter.filter(exchange, chain).block();
        return downstream.get();
    }

    @Test
    void generatesIdWhenAbsentAndForwardsItDownstreamAndBack() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/hr/auth/me").build());
        AtomicReference<ServerWebExchange> downstream = new AtomicReference<>();

        ServerWebExchange forwarded = runFilter(exchange, downstream);

        String forwardedId = forwarded.getRequest().getHeaders().getFirst(CORRELATION_ID_HEADER);
        String responseId = exchange.getResponse().getHeaders().getFirst(CORRELATION_ID_HEADER);
        assertThat(forwardedId).isNotBlank();
        assertThat(responseId).isEqualTo(forwardedId);
    }

    @Test
    void preservesIncomingId() {
        MockServerWebExchange exchange = MockServerWebExchange.from(
                MockServerHttpRequest.get("/api/hr/auth/me")
                        .header(CORRELATION_ID_HEADER, "caller-supplied-id")
                        .build());
        AtomicReference<ServerWebExchange> downstream = new AtomicReference<>();

        ServerWebExchange forwarded = runFilter(exchange, downstream);

        assertThat(forwarded.getRequest().getHeaders().getFirst(CORRELATION_ID_HEADER))
                .isEqualTo("caller-supplied-id");
        assertThat(exchange.getResponse().getHeaders().getFirst(CORRELATION_ID_HEADER))
                .isEqualTo("caller-supplied-id");
    }
}
