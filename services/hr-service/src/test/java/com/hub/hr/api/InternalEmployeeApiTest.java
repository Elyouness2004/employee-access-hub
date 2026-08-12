package com.hub.hr.api;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Internal service-to-service API (P2.6): any authenticated token may resolve
 * the manager/status snapshot. Rows are seeded straight through JDBC because
 * identity onboarding (E04) — not the CRUD API — owns the keycloak_id column;
 * seeding via SQL also keeps the JPA first-level cache out of the assertion.
 */
class InternalEmployeeApiTest extends CrudWebTestSupport {

    @Autowired
    JdbcTemplate jdbc;

    private final UUID departmentId = UUID.randomUUID();
    private final UUID positionId = UUID.randomUUID();
    private final UUID managerId = UUID.randomUUID();
    private final UUID reportId = UUID.randomUUID();
    private final UUID managerKeycloakId = UUID.randomUUID();
    private final UUID reportKeycloakId = UUID.randomUUID();

    @BeforeEach
    void seedEmployees() {
        Instant now = Instant.now();
        jdbc.update("insert into hr.department (id, name, description, created_at, updated_at) "
                + "values (?, ?, ?, ?, ?)", departmentId, "Engineering", null, now, now);
        jdbc.update("insert into hr.position (id, title, description, created_at, updated_at) "
                + "values (?, ?, ?, ?, ?)", positionId, "Engineer", null, now, now);
        insertEmployee(managerId, managerKeycloakId, "EMP-1001", "manager@corp.test", null);
        insertEmployee(reportId, reportKeycloakId, "EMP-1002", "report@corp.test", managerId);
    }

    private void insertEmployee(UUID id, UUID keycloakId, String matricule, String email, UUID manager) {
        Instant now = Instant.now();
        jdbc.update("insert into hr.employee (id, keycloak_id, matricule, first_name, last_name, email, "
                        + "hire_date, status, manager_id, department_id, position_id, created_at, updated_at) "
                        + "values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                id, keycloakId, matricule, "Ina", "Tern", email,
                LocalDate.of(2024, 1, 8), "ACTIVE", manager, departmentId, positionId, now, now);
    }

    @Test
    void snapshotByIdCarriesManagerLinkAndStatus() throws Exception {
        mockMvc.perform(get("/internal/employees/" + reportId).with(asRoles("EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(reportId.toString()))
                .andExpect(jsonPath("$.keycloakId").value(reportKeycloakId.toString()))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.managerId").value(managerId.toString()))
                .andExpect(jsonPath("$.managerKeycloakId").value(managerKeycloakId.toString()));
    }

    @Test
    void snapshotByKeycloakIdResolvesIdentityLink() throws Exception {
        mockMvc.perform(get("/internal/employees/by-keycloak/" + reportKeycloakId).with(asRoles("EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(reportId.toString()))
                .andExpect(jsonPath("$.managerKeycloakId").value(managerKeycloakId.toString()));
    }

    @Test
    void employeeWithoutManagerHasNullManagerLink() throws Exception {
        mockMvc.perform(get("/internal/employees/" + managerId).with(asRoles("EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.managerId").isEmpty())
                .andExpect(jsonPath("$.managerKeycloakId").isEmpty());
    }

    @Test
    void unknownIdentityLinkIs404() throws Exception {
        mockMvc.perform(get("/internal/employees/by-keycloak/" + UUID.randomUUID()).with(asRoles("EMPLOYEE")))
                .andExpect(status().isNotFound());
    }

    @Test
    void internalApiRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/internal/employees/" + reportId))
                .andExpect(status().isUnauthorized());
    }
}
