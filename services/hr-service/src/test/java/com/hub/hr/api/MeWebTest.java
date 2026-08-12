package com.hub.hr.api;

import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Self-service HR record (P2.4 / P2.5). The point of these tests is the layer-3
 * scope: both endpoints resolve the caller from {@code jwt.sub}, so an employee
 * can only reach their own record and a manager only their own reports —
 * including when they ask for someone else's.
 */
class MeWebTest extends IdentityWebTestSupport {

    private static final String PROFILE = "/api/hr/me";
    private static final String TEAM = "/api/hr/me/team";

    @Test
    void employeeReadsOwnProfileWithResolvedLabels() throws Exception {
        UUID managerKc = UUID.randomUUID();
        UUID managerId = seedEmployee("EMP-M1", "Mona", "Reyes", "ACTIVE", managerKc, null);
        UUID aliceKc = UUID.randomUUID();
        seedEmployee("EMP-A1", "Alice", "Martin", "ACTIVE", aliceKc, managerId);

        mockMvc.perform(get(PROFILE).with(asSubject(aliceKc, "alice.employee", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.matricule").value("EMP-A1"))
                .andExpect(jsonPath("$.firstName").value("Alice"))
                .andExpect(jsonPath("$.keycloakId").value(aliceKc.toString()))
                .andExpect(jsonPath("$.provisioningStatus").value("PROVISIONED"))
                // the labels an employee cannot look up themselves (the catalogues are HR-only)
                .andExpect(jsonPath("$.departmentName").value("Engineering"))
                .andExpect(jsonPath("$.positionTitle").value("Engineer"))
                .andExpect(jsonPath("$.managerName").value("Mona Reyes"))
                .andExpect(jsonPath("$.managerKeycloakId").value(managerKc.toString()))
                .andExpect(jsonPath("$.createdAt", notNullValue()));
    }

    @Test
    void profileWithoutAManagerResolvesToNullRatherThanFailing() throws Exception {
        UUID loneKc = UUID.randomUUID();
        seedEmployee("EMP-L1", "Lone", "Wolf", "ACTIVE", loneKc, null);

        mockMvc.perform(get(PROFILE).with(asSubject(loneKc, "lone.wolf", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.managerId").isEmpty())
                .andExpect(jsonPath("$.managerName").isEmpty());
    }

    /** An authenticated caller identity onboarding has not linked yet is a 404, not a 500. */
    @Test
    void identityWithNoEmployeeRecordIsNotFound() throws Exception {
        mockMvc.perform(get(PROFILE).with(asSubject(UUID.randomUUID(), "ghost", "EMPLOYEE")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.title").value("Resource not found"));
    }

    @Test
    void profileRequiresAuthentication() throws Exception {
        mockMvc.perform(get(PROFILE)).andExpect(status().isUnauthorized());
        mockMvc.perform(get(TEAM)).andExpect(status().isUnauthorized());
    }

    @Test
    void managerSeesOnlyTheirOwnDirectReports() throws Exception {
        UUID markKc = UUID.randomUUID();
        UUID markId = seedEmployee("EMP-M2", "Mark", "Stone", "ACTIVE", markKc, null);
        UUID otherManagerId = seedEmployee("EMP-M3", "Olga", "Petit", "ACTIVE", UUID.randomUUID(), null);

        seedEmployee("EMP-R1", "Rita", "Adams", "ACTIVE", UUID.randomUUID(), markId);
        seedEmployee("EMP-R2", "Rick", "Blume", "ACTIVE", UUID.randomUUID(), markId);
        seedEmployee("EMP-X1", "Xena", "Cruz", "ACTIVE", UUID.randomUUID(), otherManagerId);

        mockMvc.perform(get(TEAM).with(asSubject(markKc, "mark.manager", "MANAGER", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content[*].matricule", contains("EMP-R1", "EMP-R2")))
                .andExpect(jsonPath("$.content[*].managerId", everyItem(equalTo(markId.toString()))));
    }

    @Test
    void teamViewSupportsFilteringSearchingSortingAndPaging() throws Exception {
        UUID markKc = UUID.randomUUID();
        UUID markId = seedEmployee("EMP-M4", "Mark", "Stone", "ACTIVE", markKc, null);
        seedEmployee("EMP-R3", "Rita", "Adams", "ACTIVE", UUID.randomUUID(), markId);
        seedEmployee("EMP-R4", "Rick", "Blume", "DISABLED", UUID.randomUUID(), markId);

        var manager = asSubject(markKc, "mark.manager", "MANAGER", "EMPLOYEE");

        mockMvc.perform(get(TEAM).param("status", "ACTIVE").with(manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].matricule").value("EMP-R3"));

        mockMvc.perform(get(TEAM).param("search", "blume").with(manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].lastName").value("Blume"));

        mockMvc.perform(get(TEAM).param("sort", "lastName,asc").with(manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].lastName", contains("Adams", "Blume")));

        mockMvc.perform(get(TEAM).param("size", "1").param("page", "1").with(manager))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(1))
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.first").value(false))
                .andExpect(jsonPath("$.last").value(true));
    }

    /** A sort on a column outside the whitelist must degrade to the default, never 500. */
    @Test
    void unknownSortColumnFallsBackToTheDefault() throws Exception {
        UUID markKc = UUID.randomUUID();
        UUID markId = seedEmployee("EMP-M5", "Mark", "Stone", "ACTIVE", markKc, null);
        seedEmployee("EMP-R5", "Rita", "Adams", "ACTIVE", UUID.randomUUID(), markId);

        mockMvc.perform(get(TEAM).param("sort", "email';drop table employee;--,asc")
                        .with(asSubject(markKc, "mark.manager", "MANAGER", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void teamViewIsManagerOnly() throws Exception {
        UUID aliceKc = UUID.randomUUID();
        seedEmployee("EMP-A2", "Alice", "Martin", "ACTIVE", aliceKc, null);

        mockMvc.perform(get(TEAM).with(asSubject(aliceKc, "alice.employee", "EMPLOYEE")))
                .andExpect(status().isForbidden());
    }

    /** A manager token with no linked employee record cannot enumerate anyone. */
    @Test
    void managerWithoutAnEmployeeRecordIsNotFound() throws Exception {
        mockMvc.perform(get(TEAM).with(asSubject(UUID.randomUUID(), "ghost.manager", "MANAGER", "EMPLOYEE")))
                .andExpect(status().isNotFound());
    }
}
