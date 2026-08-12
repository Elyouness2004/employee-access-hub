package com.hub.hr.api;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.hub.hr.config.KeycloakRealmRoleConverter;
import com.hub.hr.support.RecordingSessionDirectory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Session-management API (Part 8): self-service listing/termination with
 * fine-grained ownership, the current-session confirmation guard, logout-others,
 * the HR/Admin read of another employee's sessions, RBAC (401/403) and the
 * OpenAPI surface. Built on the shared identity web fixture with the recording
 * session directory seeded per test.
 */
class SessionWebTest extends IdentityWebTestSupport {

    private static final UUID SUBJECT = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final String CHROME_UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36";

    @Autowired
    RecordingSessionDirectory directory;

    @BeforeEach
    void resetSessionDirectory() {
        directory.reset();
    }

    @Test
    void listsMyActiveSessionsFlaggingTheCurrentOneWithParsedBrowser() throws Exception {
        directory.seed("sid-1", SUBJECT);
        directory.seed("sid-2", SUBJECT);

        mockMvc.perform(get("/api/hr/sessions").header("User-Agent", CHROME_UA).with(user("sid-1", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value("sid-1"))
                .andExpect(jsonPath("$[0].current").value(true))
                .andExpect(jsonPath("$[0].browser").value("Chrome"))
                .andExpect(jsonPath("$[0].operatingSystem").value("Windows"))
                .andExpect(jsonPath("$[1].id").value("sid-2"))
                .andExpect(jsonPath("$[1].current").value(false));
    }

    @Test
    void currentSessionCannotBeTerminatedWithoutConfirmation() throws Exception {
        directory.seed("sid-1", SUBJECT);

        mockMvc.perform(delete("/api/hr/sessions/sid-1").with(user("sid-1", "EMPLOYEE")))
                .andExpect(status().isConflict());
        assertThat(directory.terminated).isEmpty();
    }

    @Test
    void currentSessionIsTerminatedWithExplicitConfirmation() throws Exception {
        directory.seed("sid-1", SUBJECT);

        mockMvc.perform(delete("/api/hr/sessions/sid-1").param("confirmCurrent", "true")
                        .with(user("sid-1", "EMPLOYEE")))
                .andExpect(status().isNoContent());
        assertThat(directory.terminated).containsExactly("sid-1");
    }

    @Test
    void anotherOwnSessionIsTerminatedWithoutConfirmation() throws Exception {
        directory.seed("sid-1", SUBJECT);
        directory.seed("sid-2", SUBJECT);

        mockMvc.perform(delete("/api/hr/sessions/sid-2").with(user("sid-1", "EMPLOYEE")))
                .andExpect(status().isNoContent());
        assertThat(directory.terminated).containsExactly("sid-2");
    }

    @Test
    void aSessionThatIsNotMineCannotBeTerminated() throws Exception {
        directory.seed("foreign", UUID.randomUUID());

        mockMvc.perform(delete("/api/hr/sessions/foreign").with(user("sid-1", "EMPLOYEE")))
                .andExpect(status().isNotFound());
        assertThat(directory.terminated).isEmpty();
    }

    @Test
    void logoutOthersTerminatesEveryOtherSession() throws Exception {
        directory.seed("sid-1", SUBJECT);
        directory.seed("sid-2", SUBJECT);
        directory.seed("sid-3", SUBJECT);

        mockMvc.perform(post("/api/hr/sessions/logout-others").with(user("sid-1", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.terminated").value(2));
        assertThat(directory.terminated).containsExactlyInAnyOrder("sid-2", "sid-3");
    }

    @Test
    void oneOwnSessionCanBeReadAndAnUnknownOneIs404() throws Exception {
        directory.seed("sid-1", SUBJECT);

        mockMvc.perform(get("/api/hr/sessions/sid-1").with(user("sid-1", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("sid-1"))
                .andExpect(jsonPath("$.current").value(true));

        mockMvc.perform(get("/api/hr/sessions/missing").with(user("sid-1", "EMPLOYEE")))
                .andExpect(status().isNotFound());
    }

    @Test
    void unauthenticatedSessionAccessIsRejected() throws Exception {
        mockMvc.perform(get("/api/hr/sessions"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void adminCanReadAnotherEmployeesSessions() throws Exception {
        UUID keycloakId = UUID.randomUUID();
        UUID employeeId = seedEmployee("ACTIVE", keycloakId);
        directory.seed("emp-s1", keycloakId);

        mockMvc.perform(get("/api/hr/admin/employees/" + employeeId + "/sessions").with(asRoles("HR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value("emp-s1"));
    }

    @Test
    void adminSessionReadIsForbiddenForPlainEmployees() throws Exception {
        UUID employeeId = seedEmployee("ACTIVE", UUID.randomUUID());

        mockMvc.perform(get("/api/hr/admin/employees/" + employeeId + "/sessions").with(asRoles("EMPLOYEE")))
                .andExpect(status().isForbidden());
    }

    @Test
    void openApiDocumentsTheSessionEndpoints() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/hr/sessions']", notNullValue()))
                .andExpect(jsonPath("$.paths['/api/hr/sessions/logout-others']", notNullValue()))
                .andExpect(jsonPath("$.paths['/api/hr/sessions/{sessionId}']", notNullValue()))
                .andExpect(jsonPath("$.paths['/api/hr/admin/employees/{id}/sessions']", notNullValue()));
    }

    /** A Keycloak-shaped token with a fixed subject and the session id in the {@code sid} claim. */
    private static RequestPostProcessor user(String sid, String... roles) {
        Jwt.Builder builder = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject(SUBJECT.toString())
                .issuer("http://test-issuer/realms/employee-hub")
                .audience(List.of("hub-api"))
                .claim("preferred_username", "jane.doe")
                .claim("realm_access", Map.of("roles", List.of(roles)));
        if (sid != null) {
            builder.claim("sid", sid);
        }
        return jwt().jwt(builder.build()).authorities(new KeycloakRealmRoleConverter());
    }
}
