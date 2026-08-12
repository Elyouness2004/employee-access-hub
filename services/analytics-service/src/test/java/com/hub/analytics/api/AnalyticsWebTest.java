package com.hub.analytics.api;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.hub.analytics.application.DocumentsMetricsGateway;
import com.hub.analytics.application.DocumentsSummary;
import com.hub.analytics.application.EmployeeSummary;
import com.hub.analytics.application.ExpenseMetricsGateway;
import com.hub.analytics.application.ExpenseSummary;
import com.hub.analytics.application.HrMetricsGateway;
import com.hub.analytics.application.LeaveMetricsGateway;
import com.hub.analytics.application.LeaveSummary;
import com.hub.analytics.config.KeycloakRealmRoleConverter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.mockito.BDDMockito.given;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Web-layer aggregation, graceful degradation and RBAC. The four source
 * gateways are mocked, so the test never needs a downstream service running —
 * an unavailable source is simulated by returning its {@code unavailable()}
 * summary, exactly what the resilient adapter would return during an outage.
 */
@SpringBootTest(properties = {
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://127.0.0.1:59999/jwks"
})
@AutoConfigureMockMvc
class AnalyticsWebTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    HrMetricsGateway hr;
    @MockitoBean
    LeaveMetricsGateway leave;
    @MockitoBean
    ExpenseMetricsGateway expense;
    @MockitoBean
    DocumentsMetricsGateway documents;

    @BeforeEach
    void sourcesUp() {
        given(hr.employeeSummary()).willReturn(new EmployeeSummary(true, 10, 9, 1, 3, 5));
        given(leave.leaveSummary()).willReturn(new LeaveSummary(true, 2, 4, 1, 0, 7));
        given(expense.expenseSummary()).willReturn(new ExpenseSummary(true, 1, 1, 3, 1, 0, 6,
                new BigDecimal("1250.00"), "EUR"));
        given(documents.documentsSummary()).willReturn(new DocumentsSummary(true, 12, 4, 3, 20));
    }

    private static RequestPostProcessor as(String username, String... roles) {
        Jwt token = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject(UUID.randomUUID().toString())
                .issuer("http://test-issuer/realms/employee-hub")
                .audience(List.of("hub-api"))
                .claim("preferred_username", username)
                .claim("realm_access", Map.of("roles", List.of(roles)))
                .build();
        return jwt().jwt(token).authorities(new KeycloakRealmRoleConverter());
    }

    @Test
    void dashboardAggregatesEverySource() throws Exception {
        mockMvc.perform(get("/api/analytics/dashboard").with(as("hana.hr", "HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.employees.totalEmployees").value(10))
                .andExpect(jsonPath("$.leave.total").value(7))
                .andExpect(jsonPath("$.expenses.approvedAmount").value(1250.00))
                .andExpect(jsonPath("$.documents.sensitiveDocuments").value(4))
                .andExpect(jsonPath("$.generatedAt").exists());
    }

    @Test
    void unavailableSourceDoesNotFailTheDashboard() throws Exception {
        // expense-service is "down": its gateway returns the unavailable snapshot
        given(expense.expenseSummary()).willReturn(ExpenseSummary.unavailable());

        mockMvc.perform(get("/api/analytics/dashboard").with(as("adam.admin", "ADMIN", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.expenses.available").value(false))
                .andExpect(jsonPath("$.employees.available").value(true))
                .andExpect(jsonPath("$.leave.available").value(true));
    }

    @Test
    void perSourceEndpoints() throws Exception {
        mockMvc.perform(get("/api/analytics/leave-summary").with(as("hana.hr", "HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.approved").value(4));
        mockMvc.perform(get("/api/analytics/documents-summary").with(as("hana.hr", "HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.downloadsLogged").value(20));
    }

    @Test
    void powerBiKpisAreFlatRows() throws Exception {
        mockMvc.perform(get("/api/analytics/powerbi/kpis").with(as("hana.hr", "HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.source == 'hr' && @.metric == 'totalEmployees')].value")
                        .value(10))
                .andExpect(jsonPath("$[?(@.source == 'expense' && @.metric == 'approvedAmount')].value")
                        .value(1250.00));
    }

    @Test
    void reportingIsHrAdminOnly() throws Exception {
        mockMvc.perform(get("/api/analytics/dashboard")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/analytics/dashboard").with(as("alice.employee", "EMPLOYEE")))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/analytics/powerbi/kpis").with(as("mark.manager", "MANAGER", "EMPLOYEE")))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/analytics/dashboard").with(as("hana.hr", "HR", "EMPLOYEE")))
                .andExpect(status().isOk());
    }
}
