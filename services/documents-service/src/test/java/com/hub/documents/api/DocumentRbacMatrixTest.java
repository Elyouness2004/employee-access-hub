package com.hub.documents.api;

import java.util.List;
import java.util.Map;

import com.hub.documents.config.KeycloakRealmRoleConverter;
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

/** Coarse RBAC matrix (§1.5) at the web layer, read-only endpoints only. */
@SpringBootTest(properties = {
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://127.0.0.1:59999/jwks"
})
@AutoConfigureMockMvc
class DocumentRbacMatrixTest {

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
        mockMvc.perform(get("/api/documents")).andExpect(status().isUnauthorized());
    }

    @ParameterizedTest(name = "{0} with roles [{1}] -> {2}")
    @CsvSource({
        "/api/documents,            EMPLOYEE,        200",
        // category listing is HR/Admin only
        "/api/documents/categories, EMPLOYEE,        403",
        "/api/documents/categories, MANAGER;EMPLOYEE,403",
        "/api/documents/categories, HR;EMPLOYEE,     200",
        "/api/documents/categories, ADMIN;EMPLOYEE,  200"
    })
    void rbacMatrix(String path, String roles, int expectedStatus) throws Exception {
        mockMvc.perform(asRoles(path, roles.split(";")))
                .andExpect(status().is(expectedStatus));
    }
}
