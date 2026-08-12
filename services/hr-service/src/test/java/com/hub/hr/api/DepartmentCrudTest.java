package com.hub.hr.api;

import java.util.UUID;

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

class DepartmentCrudTest extends CrudWebTestSupport {

    private static final String BASE = "/api/hr/departments";

    private String body(String name, String description) throws Exception {
        return objectMapper.writeValueAsString(
                new com.hub.hr.api.dto.DepartmentRequest(name, description));
    }

    private String create(String name) throws Exception {
        MvcResult result = mockMvc.perform(post(BASE).with(asHr())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(name, "created in test")))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", notNullValue()))
                .andExpect(jsonPath("$.id", notNullValue()))
                .andReturn();
        return jsonField(result, "id");
    }

    @Test
    void fullCrudLifecycle() throws Exception {
        String id = create("Engineering");

        mockMvc.perform(get(BASE).with(asHr()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].name", hasItem("Engineering")))
                .andExpect(jsonPath("$.totalElements").value(1));

        mockMvc.perform(get(BASE + "/" + id).with(asHr()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Engineering"))
                .andExpect(jsonPath("$.createdAt", notNullValue()));

        mockMvc.perform(put(BASE + "/" + id).with(asHr())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Platform Engineering", "renamed")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Platform Engineering"))
                .andExpect(jsonPath("$.description").value("renamed"));

        mockMvc.perform(delete(BASE + "/" + id).with(asHr()))
                .andExpect(status().isNoContent());

        mockMvc.perform(get(BASE + "/" + id).with(asHr()))
                .andExpect(status().isNotFound());
    }

    @Test
    void blankNameIsRejectedWithFieldError() throws Exception {
        mockMvc.perform(post(BASE).with(asHr())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("  ", null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.name", notNullValue()));
    }

    @Test
    void duplicateNameIsConflict() throws Exception {
        create("Finance");
        mockMvc.perform(post(BASE).with(asHr())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("finance", null)))   // uniqueness is case-insensitive
                .andExpect(status().isConflict());
    }

    @Test
    void renamingOntoExistingNameIsConflict() throws Exception {
        create("Sales");
        String id = create("Marketing");
        mockMvc.perform(put(BASE + "/" + id).with(asHr())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Sales", null)))
                .andExpect(status().isConflict());
    }

    @Test
    void unknownIdIs404ForGetPutDelete() throws Exception {
        String unknown = BASE + "/" + UUID.randomUUID();
        mockMvc.perform(get(unknown).with(asHr())).andExpect(status().isNotFound());
        mockMvc.perform(put(unknown).with(asHr())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Ghost", null)))
                .andExpect(status().isNotFound());
        mockMvc.perform(delete(unknown).with(asHr())).andExpect(status().isNotFound());
    }

    @Test
    void malformedUuidIsBadRequest() throws Exception {
        mockMvc.perform(get(BASE + "/not-a-uuid").with(asHr()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void rbacOnlyHrAndAdminMayManage() throws Exception {
        mockMvc.perform(get(BASE)).andExpect(status().isUnauthorized());
        mockMvc.perform(get(BASE).with(asRoles("EMPLOYEE"))).andExpect(status().isForbidden());
        mockMvc.perform(post(BASE).with(asRoles("MANAGER", "EMPLOYEE"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Ops", null)))
                .andExpect(status().isForbidden());
        mockMvc.perform(post(BASE).with(asRoles("ADMIN", "EMPLOYEE"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Ops", null)))
                .andExpect(status().isCreated());
    }
}
