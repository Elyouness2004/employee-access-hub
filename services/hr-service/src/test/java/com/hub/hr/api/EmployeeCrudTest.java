package com.hub.hr.api;

import java.time.LocalDate;
import java.util.UUID;

import com.hub.hr.api.dto.EmployeeRequest;
import com.hub.hr.domain.EmployeeStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class EmployeeCrudTest extends CrudWebTestSupport {

    private static final String BASE = "/api/hr/employees";

    private UUID departmentId;
    private UUID positionId;

    @BeforeEach
    void orgFixtures() throws Exception {
        departmentId = UUID.fromString(createVia("/api/hr/departments",
                "{\"name\": \"Engineering\"}"));
        positionId = UUID.fromString(createVia("/api/hr/positions",
                "{\"title\": \"Software Engineer\"}"));
    }

    private String createVia(String path, String json) throws Exception {
        MvcResult result = mockMvc.perform(post(path).with(asHr())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isCreated())
                .andReturn();
        return jsonField(result, "id");
    }

    private EmployeeRequest request(String matricule, String email, UUID managerId) {
        return new EmployeeRequest(matricule, "Alice", "Martin", email,
                LocalDate.of(2024, 3, 1), EmployeeStatus.ACTIVE,
                managerId, departmentId, positionId);
    }

    private String createEmployee(String matricule, String email, UUID managerId) throws Exception {
        return createVia(BASE, objectMapper.writeValueAsString(request(matricule, email, managerId)));
    }

    @Test
    void fullCrudLifecycle() throws Exception {
        MvcResult created = mockMvc.perform(post(BASE).with(asHr())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                request("EMP-0001", "alice.martin@corp.test", null))))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", notNullValue()))
                .andExpect(jsonPath("$.matricule").value("EMP-0001"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.keycloakId").isEmpty())
                .andReturn();
        String id = jsonField(created, "id");

        mockMvc.perform(get(BASE).with(asHr()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].matricule", hasItem("EMP-0001")))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.totalElements").value(1));

        mockMvc.perform(get(BASE + "/" + id).with(asHr()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("alice.martin@corp.test"))
                .andExpect(jsonPath("$.departmentId").value(departmentId.toString()));

        EmployeeRequest update = new EmployeeRequest("EMP-0001", "Alice", "Durand",
                "alice.durand@corp.test", LocalDate.of(2024, 3, 1), EmployeeStatus.DISABLED,
                null, departmentId, positionId);
        mockMvc.perform(put(BASE + "/" + id).with(asHr())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(update)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lastName").value("Durand"))
                .andExpect(jsonPath("$.status").value("DISABLED"));

        mockMvc.perform(delete(BASE + "/" + id).with(asHr()))
                .andExpect(status().isNoContent());

        mockMvc.perform(get(BASE + "/" + id).with(asHr()))
                .andExpect(status().isNotFound());
    }

    @Test
    void invalidFieldsAreRejectedWithFieldErrors() throws Exception {
        EmployeeRequest invalid = new EmployeeRequest("", "Alice", " ",
                "not-an-email", LocalDate.now().plusDays(1), null,
                null, departmentId, positionId);
        mockMvc.perform(post(BASE).with(asHr())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalid)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.matricule", notNullValue()))
                .andExpect(jsonPath("$.errors.lastName", notNullValue()))
                .andExpect(jsonPath("$.errors.email", notNullValue()))
                .andExpect(jsonPath("$.errors.hireDate", notNullValue()))
                .andExpect(jsonPath("$.errors.status", notNullValue()));
    }

    @Test
    void unknownStatusValueIsBadRequest() throws Exception {
        String json = objectMapper.writeValueAsString(request("EMP-0002", "b@corp.test", null))
                .replace("ACTIVE", "RETIRED");
        mockMvc.perform(post(BASE).with(asHr())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isBadRequest());
    }

    @Test
    void unknownReferencesAreUnprocessable() throws Exception {
        EmployeeRequest unknownDepartment = new EmployeeRequest("EMP-0003", "Bob", "Stone",
                "bob@corp.test", LocalDate.of(2023, 1, 9), EmployeeStatus.ACTIVE,
                null, UUID.randomUUID(), positionId);
        mockMvc.perform(post(BASE).with(asHr())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(unknownDepartment)))
                .andExpect(status().isUnprocessableEntity());

        EmployeeRequest unknownPosition = new EmployeeRequest("EMP-0003", "Bob", "Stone",
                "bob@corp.test", LocalDate.of(2023, 1, 9), EmployeeStatus.ACTIVE,
                null, departmentId, UUID.randomUUID());
        mockMvc.perform(post(BASE).with(asHr())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(unknownPosition)))
                .andExpect(status().isUnprocessableEntity());

        mockMvc.perform(post(BASE).with(asHr())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                request("EMP-0003", "bob@corp.test", UUID.randomUUID()))))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void selfManagementIsUnprocessable() throws Exception {
        String id = createEmployee("EMP-0004", "carol@corp.test", null);
        mockMvc.perform(put(BASE + "/" + id).with(asHr())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                request("EMP-0004", "carol@corp.test", UUID.fromString(id)))))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void duplicateMatriculeOrEmailIsConflict() throws Exception {
        createEmployee("EMP-0005", "dave@corp.test", null);
        mockMvc.perform(post(BASE).with(asHr())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                request("EMP-0005", "other@corp.test", null))))
                .andExpect(status().isConflict());
        mockMvc.perform(post(BASE).with(asHr())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                request("EMP-0006", "DAVE@corp.test", null))))   // case-insensitive
                .andExpect(status().isConflict());
    }

    @Test
    void managerAssignmentWorksAndManagerDeletionIsBlocked() throws Exception {
        String managerId = createEmployee("EMP-0007", "mona@corp.test", null);
        String reportId = createEmployee("EMP-0008", "rita@corp.test", UUID.fromString(managerId));

        mockMvc.perform(get(BASE + "/" + reportId).with(asHr()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.managerId").value(managerId));

        mockMvc.perform(delete(BASE + "/" + managerId).with(asHr()))
                .andExpect(status().isConflict());

        // once the report is gone the manager can be deleted
        mockMvc.perform(delete(BASE + "/" + reportId).with(asHr()))
                .andExpect(status().isNoContent());
        mockMvc.perform(delete(BASE + "/" + managerId).with(asHr()))
                .andExpect(status().isNoContent());
    }

    @Test
    void departmentAndPositionInUseCannotBeDeleted() throws Exception {
        createEmployee("EMP-0009", "erik@corp.test", null);
        mockMvc.perform(delete("/api/hr/departments/" + departmentId).with(asHr()))
                .andExpect(status().isConflict());
        mockMvc.perform(delete("/api/hr/positions/" + positionId).with(asHr()))
                .andExpect(status().isConflict());
    }

    @Test
    void rbacOnlyHrAndAdminMayManage() throws Exception {
        mockMvc.perform(get(BASE)).andExpect(status().isUnauthorized());
        mockMvc.perform(get(BASE).with(asRoles("EMPLOYEE"))).andExpect(status().isForbidden());
        mockMvc.perform(get(BASE).with(asRoles("MANAGER", "EMPLOYEE"))).andExpect(status().isForbidden());
        mockMvc.perform(get(BASE).with(asRoles("ADMIN", "EMPLOYEE"))).andExpect(status().isOk());
    }
}
