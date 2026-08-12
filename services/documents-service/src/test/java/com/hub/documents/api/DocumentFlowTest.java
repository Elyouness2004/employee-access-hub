package com.hub.documents.api;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Role-based access (FR-41), sensitive-document gating, and download auditing. */
class DocumentFlowTest extends DocumentsWebTestSupport {

    @Test
    void employeeSeesAndDownloadsGeneralDocument() throws Exception {
        String id = upload(asHana(), "handbook", GENERAL_CAT, null);

        mockMvc.perform(get("/api/documents").with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id == '" + id + "')]").exists());
        mockMvc.perform(get("/api/documents/" + id + "/download").with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.storageKey").value("blob://docs/handbook"));
    }

    @Test
    void sensitiveDocumentRequiresHr() throws Exception {
        String id = upload(asHana(), "salary-bands", HR_CAT, null);

        // an employee cannot list, read or download a sensitive document
        mockMvc.perform(get("/api/documents").with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id == '" + id + "')]").doesNotExist());
        mockMvc.perform(get("/api/documents/" + id).with(asAlice()))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/documents/" + id + "/download").with(asAlice()))
                .andExpect(status().isForbidden());

        // HR may
        mockMvc.perform(get("/api/documents/" + id).with(asHana()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sensitive").value(true));
        mockMvc.perform(get("/api/documents/" + id + "/download").with(asHana()))
                .andExpect(status().isOk());
    }

    @Test
    void ownerScopedDocumentIsPrivateToOwnerAndHr() throws Exception {
        String id = upload(asHana(), "alice-contract", GENERAL_CAT, ALICE_KC);

        mockMvc.perform(get("/api/documents/" + id).with(asAlice())).andExpect(status().isOk());
        // bob is an employee in the same (EMPLOYEE) tier but not the owner
        mockMvc.perform(get("/api/documents/" + id).with(asBob())).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/documents").with(asBob()))
                .andExpect(jsonPath("$.content[?(@.id == '" + id + "')]").doesNotExist());
        // HR reads everything
        mockMvc.perform(get("/api/documents/" + id).with(asHana())).andExpect(status().isOk());
    }

    @Test
    void everyDownloadIsAudited() throws Exception {
        String id = upload(asHana(), "policy", GENERAL_CAT, null);
        mockMvc.perform(get("/api/documents/" + id + "/download").with(asAlice()))
                .andExpect(status().isOk());

        boolean audited = auditLog.findAll().stream()
                .anyMatch(e -> e.getAction().equals("DOCUMENT_DOWNLOADED")
                        && e.getResource().equals("document:" + id));
        org.junit.jupiter.api.Assertions.assertTrue(audited, "every download must be audited (FR-41)");
    }

    @Test
    void employeeCannotUpload() throws Exception {
        mockMvc.perform(post("/api/documents").with(asAlice())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\": \"x\", \"categoryId\": \"" + GENERAL_CAT
                                + "\", \"storageKey\": \"blob://x\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void hrUpdatesAndDeletes() throws Exception {
        String id = upload(asHana(), "draft", GENERAL_CAT, null);

        mockMvc.perform(put("/api/documents/" + id).with(asHana())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\": \"final\", \"categoryId\": \"" + HR_CAT
                                + "\", \"storageKey\": \"blob://docs/final\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("final"))
                .andExpect(jsonPath("$.sensitive").value(true));

        mockMvc.perform(delete("/api/documents/" + id).with(asHana()))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/documents/" + id).with(asHana()))
                .andExpect(status().isNotFound());
    }

    @Test
    void uploadWithUnknownCategoryIs422() throws Exception {
        mockMvc.perform(post("/api/documents").with(asHana())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\": \"x\", \"categoryId\": \"99999999-9999-9999-9999-999999999999\", "
                                + "\"storageKey\": \"blob://x\"}"))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void adminManagesCategoriesButHrCannot() throws Exception {
        // admin creates a category
        String created = jsonField(mockMvc.perform(post("/api/documents/categories").with(asAdam())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Legal\", \"minRole\": \"MANAGER\"}"))
                .andExpect(status().isCreated()).andReturn(), "id");

        mockMvc.perform(put("/api/documents/categories/" + created).with(asAdam())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Legal & Compliance\", \"minRole\": \"HR\"}"))
                .andExpect(status().isOk());

        // HR may read categories but not manage them
        mockMvc.perform(get("/api/documents/categories").with(asHana())).andExpect(status().isOk());
        mockMvc.perform(post("/api/documents/categories").with(asHana())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Nope\", \"minRole\": \"EMPLOYEE\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(delete("/api/documents/categories/" + created).with(asAdam()))
                .andExpect(status().isNoContent());
    }

    @Test
    void categoryInUseCannotBeDeleted() throws Exception {
        String category = jsonField(mockMvc.perform(post("/api/documents/categories").with(asAdam())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Onboarding\", \"minRole\": \"EMPLOYEE\"}"))
                .andExpect(status().isCreated()).andReturn(), "id");
        upload(asHana(), "welcome", category, null);

        mockMvc.perform(delete("/api/documents/categories/" + category).with(asAdam()))
                .andExpect(status().isConflict());
    }

    @Test
    void duplicateCategoryNameConflicts() throws Exception {
        mockMvc.perform(post("/api/documents/categories").with(asAdam())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"General\", \"minRole\": \"EMPLOYEE\"}"))
                .andExpect(status().isConflict());
    }
}
