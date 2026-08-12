package com.hub.expense.api;

import java.util.List;
import java.util.Map;

import com.hub.expense.config.KeycloakRealmRoleConverter;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Coarse RBAC matrix (§1.5) at the web layer. Tokens are Keycloak-shaped
 * (realm_access.roles with composites already expanded) and run through the
 * production role converter. Read-only endpoints are used so the check exercises
 * only the @PreAuthorize gate, not ownership.
 */
@SpringBootTest(properties = {
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://127.0.0.1:59999/jwks"
})
@AutoConfigureMockMvc
class ExpenseRbacMatrixTest {

    @Autowired
    MockMvc mockMvc;

    private MockHttpServletRequestBuilder asRoles(String path, String... roles) {
        Jwt token = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject("11111111-1111-1111-1111-111111111111")
                .issuer("http://test-issuer/realms/employee-hub")
                .audience(List.of("hub-api"))
                .claim("preferred_username", "matrix.user")
                .claim("realm_access", Map.of("roles", List.of(roles)))
                .build();
        return get(path).with(jwt().jwt(token).authorities(new KeycloakRealmRoleConverter()));
    }

    @Test
    void unauthenticatedApiRequestIs401() throws Exception {
        mockMvc.perform(get("/api/expenses/my")).andExpect(status().isUnauthorized());
    }

    @ParameterizedTest(name = "{0} with roles [{1}] -> {2}")
    @CsvSource({
        // employee inbox
        "/api/expenses/my,             EMPLOYEE,         200",
        // manager pending inbox
        "/api/expenses/pending,        EMPLOYEE,         403",
        "/api/expenses/pending,        MANAGER;EMPLOYEE, 200",
        // HR-only escalation, second-level queue, search, threshold
        "/api/expenses/escalated,      MANAGER;EMPLOYEE, 403",
        "/api/expenses/escalated,      HR;EMPLOYEE,      200",
        "/api/expenses/second-approval,MANAGER;EMPLOYEE, 403",
        "/api/expenses/second-approval,ADMIN;EMPLOYEE,   200",
        "/api/expenses/search,         EMPLOYEE,         403",
        "/api/expenses/search,         HR;EMPLOYEE,      200",
        "/api/expenses/threshold,      EMPLOYEE,         403",
        "/api/expenses/threshold,      HR;EMPLOYEE,      200"
    })
    void rbacMatrix(String path, String roles, int expectedStatus) throws Exception {
        mockMvc.perform(asRoles(path, roles.split(";")))
                .andExpect(status().is(expectedStatus));
    }
}
