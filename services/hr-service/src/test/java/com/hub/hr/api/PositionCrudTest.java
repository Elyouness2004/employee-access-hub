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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PositionCrudTest extends CrudWebTestSupport {

    private static final String BASE = "/api/hr/positions";

    private String body(String title, String description) throws Exception {
        return objectMapper.writeValueAsString(
                new com.hub.hr.api.dto.PositionRequest(title, description));
    }

    private String create(String title) throws Exception {
        MvcResult result = mockMvc.perform(post(BASE).with(asHr())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(title, null)))
                .andExpect(status().isCreated())
                .andReturn();
        return jsonField(result, "id");
    }

    @Test
    void fullCrudLifecycle() throws Exception {
        String id = create("Software Engineer");

        mockMvc.perform(get(BASE).with(asHr()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].title", hasItem("Software Engineer")))
                .andExpect(jsonPath("$.totalElements").value(1));

        mockMvc.perform(get(BASE + "/" + id).with(asHr()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Software Engineer"));

        mockMvc.perform(put(BASE + "/" + id).with(asHr())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Senior Software Engineer", "promoted track")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Senior Software Engineer"));

        mockMvc.perform(delete(BASE + "/" + id).with(asHr()))
                .andExpect(status().isNoContent());

        mockMvc.perform(get(BASE + "/" + id).with(asHr()))
                .andExpect(status().isNotFound());
    }

    @Test
    void blankTitleIsRejectedWithFieldError() throws Exception {
        mockMvc.perform(post(BASE).with(asHr())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("", null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.title", notNullValue()));
    }

    @Test
    void duplicateTitleIsConflict() throws Exception {
        create("QA Engineer");
        mockMvc.perform(post(BASE).with(asHr())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("qa engineer", null)))   // uniqueness is case-insensitive
                .andExpect(status().isConflict());
    }

    @Test
    void unknownIdIs404() throws Exception {
        mockMvc.perform(get(BASE + "/" + UUID.randomUUID()).with(asHr()))
                .andExpect(status().isNotFound());
    }

    @Test
    void rbacOnlyHrAndAdminMayManage() throws Exception {
        mockMvc.perform(get(BASE)).andExpect(status().isUnauthorized());
        mockMvc.perform(get(BASE).with(asRoles("EMPLOYEE"))).andExpect(status().isForbidden());
    }
}
