package com.hub.analytics.api;

import com.hub.analytics.application.DocumentsMetricsGateway;
import com.hub.analytics.application.ExpenseMetricsGateway;
import com.hub.analytics.application.HrMetricsGateway;
import com.hub.analytics.application.LeaveMetricsGateway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The generated OpenAPI document is reachable without a token and covers the analytics API. */
@SpringBootTest(properties = {
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://127.0.0.1:59999/jwks"
})
@AutoConfigureMockMvc
class OpenApiDocsTest {

    @Autowired
    MockMvc mockMvc;

    // gateways mocked only so the context need not reach real downstream services
    @MockitoBean
    HrMetricsGateway hr;
    @MockitoBean
    LeaveMetricsGateway leave;
    @MockitoBean
    ExpenseMetricsGateway expense;
    @MockitoBean
    DocumentsMetricsGateway documents;

    @Test
    void apiDocsArePublicAndDescribeAnalyticsEndpoints() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.info.title").value("Analytics Service API"))
                .andExpect(jsonPath("$.paths['/api/analytics/dashboard']", notNullValue()))
                .andExpect(jsonPath("$.paths['/api/analytics/powerbi/kpis']", notNullValue()))
                .andExpect(jsonPath("$.components.securitySchemes['bearer-jwt']", notNullValue()));
    }
}
