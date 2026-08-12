package com.hub.hr.api;

import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Paging, sorting, filtering and search on the HR employee directory. Also pins
 * the two hardening rules every collection endpoint shares: an oversized page is
 * clamped, and a sort on a column outside the whitelist degrades to the default
 * instead of reaching the persistence layer.
 */
class EmployeeDirectoryQueryTest extends IdentityWebTestSupport {

    private static final String BASE = "/api/hr/employees";

    @Test
    void filtersByStatusAndProvisioning() throws Exception {
        seedEmployee("EMP-Q1", "Ann", "Kettle", "ACTIVE", UUID.randomUUID(), null);
        seedEmployee("EMP-Q2", "Ben", "Lomond", "DISABLED", null, null);

        mockMvc.perform(get(BASE).param("status", "ACTIVE").with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].matricule").value("EMP-Q1"));

        mockMvc.perform(get(BASE).param("provisioningStatus", "NOT_PROVISIONED")
                        .with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].matricule").value("EMP-Q2"));
    }

    @Test
    void searchesAcrossMatriculeNameAndEmail() throws Exception {
        seedEmployee("EMP-Q3", "Cara", "Nowak", "ACTIVE", UUID.randomUUID(), null);
        seedEmployee("EMP-Q4", "Dan", "Ortiz", "ACTIVE", UUID.randomUUID(), null);

        mockMvc.perform(get(BASE).param("search", "nowak").with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].lastName").value("Nowak"));

        // case-insensitive, and matches the matricule too
        mockMvc.perform(get(BASE).param("search", "emp-q4").with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].firstName").value("Dan"));
    }

    @Test
    void filtersByManagerAndDepartment() throws Exception {
        UUID managerId = seedEmployee("EMP-Q5", "Eve", "Prieto", "ACTIVE", UUID.randomUUID(), null);
        seedEmployee("EMP-Q6", "Finn", "Quist", "ACTIVE", UUID.randomUUID(), managerId);
        seedEmployee("EMP-Q7", "Gil", "Rossi", "ACTIVE", UUID.randomUUID(), null);

        mockMvc.perform(get(BASE).param("managerId", managerId.toString()).with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].matricule").value("EMP-Q6"));

        mockMvc.perform(get(BASE).param("departmentId", departmentId().toString())
                        .with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(3));

        mockMvc.perform(get(BASE).param("departmentId", UUID.randomUUID().toString())
                        .with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0))
                .andExpect(jsonPath("$.content").isEmpty());
    }

    @Test
    void sortsOnWhitelistedColumnsAndPagesTheResult() throws Exception {
        seedEmployee("EMP-Q8", "Hana", "Silva", "ACTIVE", UUID.randomUUID(), null);
        seedEmployee("EMP-Q9", "Ivan", "Toth", "ACTIVE", UUID.randomUUID(), null);

        mockMvc.perform(get(BASE).param("sort", "lastName,desc").with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].lastName", contains("Toth", "Silva")));

        mockMvc.perform(get(BASE).param("size", "1").with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.first").value(true))
                .andExpect(jsonPath("$.last").value(false));
    }

    /** No caller may ask for an unbounded page: the size is clamped to the endpoint's ceiling. */
    @Test
    void oversizedPageIsClamped() throws Exception {
        seedEmployee("EMP-QA", "Jo", "Ueda", "ACTIVE", UUID.randomUUID(), null);

        mockMvc.perform(get(BASE).param("size", "100000").with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(200));
    }

    @Test
    void unknownSortColumnFallsBackToTheDefault() throws Exception {
        seedEmployee("EMP-QB", "Kai", "Vogel", "ACTIVE", UUID.randomUUID(), null);

        mockMvc.perform(get(BASE).param("sort", "salary,desc").with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void unknownFilterValueIsARejectedParameterNotA500() throws Exception {
        mockMvc.perform(get(BASE).param("status", "RETIRED").with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid parameter"));
    }
}
