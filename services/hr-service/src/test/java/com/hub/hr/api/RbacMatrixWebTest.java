package com.hub.hr.api;

import java.util.List;
import java.util.Map;

import com.hub.hr.config.KeycloakRealmRoleConverter;
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
 * (realm_access.roles with composites already expanded, as Keycloak issues
 * them) and run through the production role converter.
 */
@SpringBootTest(properties = {
        // decoder must not call out at startup; requests here bypass it anyway
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://127.0.0.1:59999/jwks"
})
@AutoConfigureMockMvc
class RbacMatrixWebTest {

    @Autowired
    MockMvc mockMvc;

    private MockHttpServletRequestBuilder asRoles(String path, String... roles) {
        // Keycloak-shaped token: aud and iss are always present in real tokens
        Jwt token = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject("test-subject")
                .issuer("http://test-issuer/realms/employee-hub")
                .audience(List.of("hub-api"))
                .claim("preferred_username", "matrix.user")
                .claim("realm_access", Map.of("roles", List.of(roles)))
                .build();
        return get(path).with(jwt().jwt(token).authorities(new KeycloakRealmRoleConverter()));
    }

    @Test
    void unauthenticatedApiRequestIs401() throws Exception {
        mockMvc.perform(get("/api/hr/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void nonApiPathIsDeniedEvenAuthenticated() throws Exception {
        mockMvc.perform(asRoles("/not-api", "ADMIN", "EMPLOYEE")).andExpect(status().isForbidden());
    }

    @ParameterizedTest(name = "{0} with roles [{1}] -> {2}")
    @CsvSource({
        // EMPLOYEE only (alice)
        "/api/hr/auth/me,             EMPLOYEE,          200",
        "/api/hr/auth/employee-check, EMPLOYEE,          200",
        "/api/hr/auth/manager-check,  EMPLOYEE,          403",
        "/api/hr/auth/hr-check,       EMPLOYEE,          403",
        "/api/hr/auth/admin-check,    EMPLOYEE,          403",
        // MANAGER composite (mark)
        "/api/hr/auth/manager-check,  MANAGER;EMPLOYEE,  200",
        "/api/hr/auth/employee-check, MANAGER;EMPLOYEE,  200",
        "/api/hr/auth/hr-check,       MANAGER;EMPLOYEE,  403",
        "/api/hr/auth/admin-check,    MANAGER;EMPLOYEE,  403",
        // HR composite (hana)
        "/api/hr/auth/hr-check,       HR;EMPLOYEE,       200",
        "/api/hr/auth/employee-check, HR;EMPLOYEE,       200",
        "/api/hr/auth/admin-check,    HR;EMPLOYEE,       403",
        // ADMIN composite (adam)
        "/api/hr/auth/admin-check,    ADMIN;EMPLOYEE,    200",
        "/api/hr/auth/employee-check, ADMIN;EMPLOYEE,    200",
        "/api/hr/auth/manager-check,  ADMIN;EMPLOYEE,    403"
    })
    void rbacMatrix(String path, String roles, int expectedStatus) throws Exception {
        mockMvc.perform(asRoles(path, roles.split(";")))
                .andExpect(status().is(expectedStatus));
    }
}
