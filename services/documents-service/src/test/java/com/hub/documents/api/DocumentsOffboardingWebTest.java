package com.hub.documents.api;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Offboarding consumer (P3.3): revokes the departed employee's document ownership
 * (documents pass into company/HR custody), HR/Admin only, audit trail preserved.
 */
class DocumentsOffboardingWebTest extends DocumentsWebTestSupport {

    private final String offboard = "{\"employeeKeycloakId\": \"" + ALICE_KC + "\"}";

    @Test
    void offboardingRevokesOwnershipAndIsIdempotent() throws Exception {
        upload(asHana(), "AliceRecord", GENERAL_CAT, ALICE_KC);

        mockMvc.perform(post("/internal/documents/offboarding").with(asHana())
                        .contentType(MediaType.APPLICATION_JSON).content(offboard))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ownershipRevoked").value(1));

        // a second pass finds no owned documents — nothing deleted, audit preserved
        mockMvc.perform(post("/internal/documents/offboarding").with(asHana())
                        .contentType(MediaType.APPLICATION_JSON).content(offboard))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ownershipRevoked").value(0));
    }

    @Test
    void revokesEveryDocumentOwnedByTheEmployee() throws Exception {
        upload(asHana(), "AliceOne", GENERAL_CAT, ALICE_KC);
        upload(asHana(), "AliceTwo", HR_CAT, ALICE_KC);

        mockMvc.perform(post("/internal/documents/offboarding").with(asAdam())
                        .contentType(MediaType.APPLICATION_JSON).content(offboard))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ownershipRevoked").value(2));
    }

    @Test
    void companyWideDocumentsAreLeftUntouched() throws Exception {
        upload(asHana(), "CompanyPolicy", GENERAL_CAT, null); // company-wide, no owner

        mockMvc.perform(post("/internal/documents/offboarding").with(asHana())
                        .contentType(MediaType.APPLICATION_JSON).content(offboard))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ownershipRevoked").value(0));
    }

    @Test
    void offboardingIsHrOrAdminOnly() throws Exception {
        mockMvc.perform(post("/internal/documents/offboarding").with(asAlice())
                        .contentType(MediaType.APPLICATION_JSON).content(offboard))
                .andExpect(status().isForbidden());
    }

    @Test
    void offboardingRequiresAuthentication() throws Exception {
        mockMvc.perform(post("/internal/documents/offboarding")
                        .contentType(MediaType.APPLICATION_JSON).content(offboard))
                .andExpect(status().isUnauthorized());
    }
}
