package com.hub.hr.api;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The people resolver — the one place a stored identifier becomes a person.
 *
 * The tests are about what the endpoint deliberately will NOT do as much as
 * about resolution: it answers only for references the caller already holds, so
 * there is nothing to search, nothing to page, and an unknown reference is an
 * absence rather than an error.
 */
class PeopleDirectoryWebTest extends IdentityWebTestSupport {

    private static final String PEOPLE = "/api/hr/people";

    @Test
    void resolvesAKeycloakSubjectToAPerson() throws Exception {
        UUID kc = UUID.randomUUID();
        seedEmployee("EMP-P1", "Ilham", "Aboulkacem", "ACTIVE", kc, null);

        mockMvc.perform(get(PEOPLE).param("keycloakId", kc.toString())
                        .with(asSubject(UUID.randomUUID(), "any.employee", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].displayName").value("Ilham Aboulkacem"))
                .andExpect(jsonPath("$[0].firstName").value("Ilham"))
                .andExpect(jsonPath("$[0].lastName").value("Aboulkacem"))
                .andExpect(jsonPath("$[0].matricule").value("EMP-P1"))
                .andExpect(jsonPath("$[0].keycloakId").value(kc.toString()))
                .andExpect(jsonPath("$[0].status").value("ACTIVE"));
    }

    @Test
    void resolvesAnEmployeeIdToTheSamePerson() throws Exception {
        UUID id = seedEmployee("EMP-P2", "Hafid", "Daoudi", "ACTIVE", UUID.randomUUID(), null);

        mockMvc.perform(get(PEOPLE).param("employeeId", id.toString())
                        .with(asSubject(UUID.randomUUID(), "any.employee", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].employeeId").value(id.toString()))
                .andExpect(jsonPath("$[0].displayName").value("Hafid Daoudi"));
    }

    /**
     * Both Keycloak username conventions land on the same record: hr-service
     * provisions with the e-mail as username, the seeder uses the short login.
     * A caller holding an audit actor does not know which it has.
     */
    @Test
    void resolvesAUsernameInEitherTheShortOrTheEmailForm() throws Exception {
        UUID id = seedEmployee("EMP-P3", "Nadia", "Chraibi", "ACTIVE", UUID.randomUUID(), null);
        String email = emailOf(id);
        String login = email.substring(0, email.indexOf('@'));

        mockMvc.perform(get(PEOPLE).param("username", login)
                        .with(asSubject(UUID.randomUUID(), "any.employee", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].employeeId").value(id.toString()))
                .andExpect(jsonPath("$[0].username").value(login));

        mockMvc.perform(get(PEOPLE).param("username", email.toUpperCase())
                        .with(asSubject(UUID.randomUUID(), "any.employee", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].employeeId").value(id.toString()));
    }

    /** A short login must not match a longer one that merely starts the same way. */
    @Test
    void doesNotResolveALoginThatIsOnlyAPrefixOfAnother() throws Exception {
        UUID id = seedEmployee("EMP-P4", "Sara", "Bennani", "ACTIVE", UUID.randomUUID(), null);
        String email = emailOf(id);
        String login = email.substring(0, email.indexOf('@'));

        mockMvc.perform(get(PEOPLE).param("username", login.substring(0, login.length() - 1))
                        .with(asSubject(UUID.randomUUID(), "any.employee", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    /** The same person reached two ways is one answer, not two. */
    @Test
    void deduplicatesAPersonReferencedByBothIdentifiers() throws Exception {
        UUID kc = UUID.randomUUID();
        UUID id = seedEmployee("EMP-P5", "Youssef", "Alami", "ACTIVE", kc, null);

        mockMvc.perform(get(PEOPLE)
                        .param("keycloakId", kc.toString())
                        .param("employeeId", id.toString())
                        .with(asSubject(UUID.randomUUID(), "any.employee", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));
    }

    /**
     * A batch is normal — a page of rows references many people — and the answer
     * is stable, ordered by matricule.
     */
    @Test
    void resolvesABatchInAStableOrder() throws Exception {
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        seedEmployee("EMP-B2", "Bravo", "Two", "ACTIVE", second, null);
        seedEmployee("EMP-B1", "Alpha", "One", "ACTIVE", first, null);

        mockMvc.perform(get(PEOPLE)
                        .param("keycloakId", second.toString(), first.toString())
                        .with(asSubject(UUID.randomUUID(), "any.employee", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].matricule", contains("EMP-B1", "EMP-B2")));
    }

    /**
     * A reference to something that no longer exists is an absence. The caller
     * batched ids off rows it does not control and cannot know in advance which
     * still resolve — failing the whole batch would blank a whole page.
     */
    @Test
    void omitsUnknownReferencesRatherThanFailing() throws Exception {
        UUID kc = UUID.randomUUID();
        seedEmployee("EMP-P6", "Rachid", "Tazi", "ACTIVE", kc, null);

        mockMvc.perform(get(PEOPLE)
                        .param("keycloakId", kc.toString(), UUID.randomUUID().toString())
                        .param("username", "system")
                        .with(asSubject(UUID.randomUUID(), "any.employee", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].matricule").value("EMP-P6"));
    }

    /** No references at all is an empty answer, not a listing of everyone. */
    @Test
    void resolvesNothingWhenAskedForNothing() throws Exception {
        seedEmployee("EMP-P7", "Karim", "Idrissi", "ACTIVE", UUID.randomUUID(), null);

        mockMvc.perform(get(PEOPLE).with(asSubject(UUID.randomUUID(), "any.employee", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    /** Beyond the ceiling the caller is enumerating, which this endpoint is not for. */
    @Test
    void refusesABatchLargerThanTheCeiling() throws Exception {
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < 201; i++) {
            ids.add(UUID.randomUUID().toString());
        }

        mockMvc.perform(get(PEOPLE).param("keycloakId", ids.toArray(String[]::new))
                        .with(asSubject(UUID.randomUUID(), "any.employee", "EMPLOYEE")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Too many references"));
    }

    @Test
    void requiresAuthentication() throws Exception {
        mockMvc.perform(get(PEOPLE).param("keycloakId", UUID.randomUUID().toString()))
                .andExpect(status().isUnauthorized());
    }

    /**
     * Every role may resolve — the identifiers appear on records their subjects
     * already read, and leaving them raw for everyone but HR is the defect this
     * endpoint exists to fix.
     */
    @Test
    void everyAuthenticatedRoleMayResolve() throws Exception {
        UUID kc = UUID.randomUUID();
        seedEmployee("EMP-P8", "Ilham", "Aboulkacem", "ACTIVE", kc, null);

        for (String role : List.of("EMPLOYEE", "MANAGER", "HR", "ADMIN")) {
            mockMvc.perform(get(PEOPLE).param("keycloakId", kc.toString())
                            .with(asSubject(UUID.randomUUID(), "some.user", role)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].displayName").value("Ilham Aboulkacem"));
        }
    }

    /**
     * A work-directory projection, not the HR record: the fields that make the
     * directory HR-only must not leak through the resolver.
     */
    @Test
    void carriesDisplayFieldsOnlyAndNoHrRecordDetail() throws Exception {
        UUID kc = UUID.randomUUID();
        seedEmployee("EMP-P9", "Salma", "Fassi", "ACTIVE", kc, null);

        String body = mockMvc.perform(get(PEOPLE).param("keycloakId", kc.toString())
                        .with(asSubject(UUID.randomUUID(), "any.employee", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        List<String> fields = new ArrayList<>();
        objectMapper.readTree(body).get(0).fieldNames().forEachRemaining(fields::add);
        assertFieldsAre(fields);
    }

    private static void assertFieldsAre(List<String> fields) {
        List<String> expected = List.of("employeeId", "keycloakId", "matricule", "firstName",
                "lastName", "displayName", "username", "email", "status");
        org.assertj.core.api.Assertions.assertThat(fields)
                .as("people resolver exposes display fields only, got %s",
                        fields.stream().collect(Collectors.joining(", ")))
                .containsExactlyInAnyOrderElementsOf(expected);
        org.assertj.core.api.Assertions.assertThat(fields)
                .doesNotContain("hireDate", "departmentId", "positionId", "managerId",
                        "provisioningStatus");
    }

    /** The resolver never becomes a listing: unknown usernames simply drop out. */
    @Test
    void mixedReferenceKindsResolveInOneRequest() throws Exception {
        UUID kcA = UUID.randomUUID();
        seedEmployee("EMP-M1", "Amina", "Berrada", "ACTIVE", kcA, null);
        UUID idB = seedEmployee("EMP-M2", "Omar", "Sefrioui", "ACTIVE", UUID.randomUUID(), null);
        UUID idC = seedEmployee("EMP-M3", "Leila", "Haddad", "ACTIVE", UUID.randomUUID(), null);
        String loginC = emailOf(idC).split("@")[0];

        mockMvc.perform(get(PEOPLE)
                        .param("keycloakId", kcA.toString())
                        .param("employeeId", idB.toString())
                        .param("username", loginC)
                        .with(asSubject(UUID.randomUUID(), "any.employee", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].matricule", containsInAnyOrder("EMP-M1", "EMP-M2", "EMP-M3")));
    }

    private String emailOf(UUID employeeId) {
        return jdbc.queryForObject("select email from hr.employee where id = ?", String.class, employeeId);
    }
}
