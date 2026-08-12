package com.hub.expense.api;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.hub.expense.config.KeycloakRealmRoleConverter;
import com.hub.expense.domain.EmployeeDirectory;
import com.hub.expense.domain.EmployeeSnapshot;
import com.hub.expense.infrastructure.AuditLogRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.springframework.transaction.annotation.Transactional;

import static org.mockito.BDDMockito.given;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Shared fixture for expense web tests: full application context on the
 * H2/Flyway schema (threshold row seeded at 1000.00 EUR), MockMvc with
 * Keycloak-shaped tokens run through the production role converter, the HR
 * directory port mocked, transaction rollback per test.
 *
 * Personas mirror the realm seed: alice and bob report to mark (MANAGER); hana
 * is HR; adam is ADMIN; eve manages herself (BR-02 escalation path).
 */
@SpringBootTest(properties = {
        // decoder must not call out at startup; requests here bypass it anyway
        "spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://127.0.0.1:59999/jwks"
})
@AutoConfigureMockMvc
@Transactional
abstract class ExpenseWebTestSupport {

    static final UUID ALICE_KC = UUID.fromString("11111111-1111-1111-1111-111111111111");
    static final UUID MARK_KC  = UUID.fromString("22222222-2222-2222-2222-222222222222");
    static final UUID HANA_KC  = UUID.fromString("33333333-3333-3333-3333-333333333333");
    static final UUID EVE_KC   = UUID.fromString("44444444-4444-4444-4444-444444444444");
    static final UUID BOB_KC   = UUID.fromString("55555555-5555-5555-5555-555555555555");
    static final UUID ADAM_KC  = UUID.fromString("66666666-6666-6666-6666-666666666666");

    static final UUID ALICE_ID = UUID.fromString("aaaaaaaa-1111-1111-1111-111111111111");
    static final UUID MARK_ID  = UUID.fromString("aaaaaaaa-2222-2222-2222-222222222222");
    static final UUID EVE_ID   = UUID.fromString("aaaaaaaa-4444-4444-4444-444444444444");
    static final UUID BOB_ID   = UUID.fromString("aaaaaaaa-5555-5555-5555-555555555555");

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected ObjectMapper objectMapper;

    @Autowired
    protected AuditLogRepository auditLog;

    @MockitoBean
    protected EmployeeDirectory directory;

    protected void givenDirectoryDefaults() {
        givenEmployee(ALICE_ID, ALICE_KC, true, MARK_ID, MARK_KC);
        givenEmployee(BOB_ID, BOB_KC, true, MARK_ID, MARK_KC);
        givenEmployee(MARK_ID, MARK_KC, true, null, null);
        givenEmployee(EVE_ID, EVE_KC, true, EVE_ID, EVE_KC);   // self-managed
    }

    protected void givenEmployee(UUID id, UUID keycloakId, boolean active,
                                 UUID managerId, UUID managerKeycloakId) {
        EmployeeSnapshot snapshot = new EmployeeSnapshot(id, keycloakId, active, managerId, managerKeycloakId);
        given(directory.findByKeycloakId(keycloakId)).willReturn(Optional.of(snapshot));
        given(directory.findById(id)).willReturn(Optional.of(snapshot));
    }

    protected static RequestPostProcessor as(UUID subject, String username, String... roles) {
        Jwt token = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject(subject.toString())
                .issuer("http://test-issuer/realms/employee-hub")
                .audience(List.of("hub-api"))
                .claim("preferred_username", username)
                .claim("realm_access", Map.of("roles", List.of(roles)))
                .build();
        return jwt().jwt(token).authorities(new KeycloakRealmRoleConverter());
    }

    protected static RequestPostProcessor asAlice() {
        return as(ALICE_KC, "alice.employee", "EMPLOYEE");
    }

    protected static RequestPostProcessor asBob() {
        return as(BOB_KC, "bob.employee", "EMPLOYEE");
    }

    protected static RequestPostProcessor asMark() {
        return as(MARK_KC, "mark.manager", "MANAGER", "EMPLOYEE");
    }

    protected static RequestPostProcessor asHana() {
        return as(HANA_KC, "hana.hr", "HR", "EMPLOYEE");
    }

    protected static RequestPostProcessor asAdam() {
        return as(ADAM_KC, "adam.admin", "ADMIN", "EMPLOYEE");
    }

    protected static RequestPostProcessor asEve() {
        // eve is a self-managed manager — the BR-02 escalation persona
        return as(EVE_KC, "eve.founder", "MANAGER", "EMPLOYEE");
    }

    protected MockHttpServletRequestBuilder claim(RequestPostProcessor actor, String category,
                                                  String amount, String date) {
        return post("/api/expenses").with(actor)
                .contentType(MediaType.APPLICATION_JSON)
                .content(("{\"category\": \"%s\", \"amount\": %s, \"currency\": \"EUR\", "
                        + "\"expenseDate\": \"%s\", \"description\": \"test\"}")
                        .formatted(category, amount, date));
    }

    /** Files a TRAVEL claim and returns the created expense id. */
    protected String submitClaim(RequestPostProcessor actor, String amount) throws Exception {
        MvcResult result = mockMvc.perform(claim(actor, "TRAVEL", amount, "2026-07-01"))
                .andExpect(status().isCreated())
                .andReturn();
        return jsonField(result, "id");
    }

    protected String jsonField(MvcResult result, String field) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString()).get(field).asText();
    }
}
