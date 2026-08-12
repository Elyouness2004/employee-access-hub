package com.hub.expense.api;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * BR-05 offboarding consumer (P3.3): cancels the departed employee's still-open
 * claims, HR/Admin only, and leaves the (now cancelled) claim immutable.
 */
class ExpenseOffboardingWebTest extends ExpenseWebTestSupport {

    private String offboard = "{\"employeeKeycloakId\": \"" + ALICE_KC + "\"}";

    @Test
    void offboardingCancelsOpenClaimsAndIsIdempotent() throws Exception {
        givenDirectoryDefaults();
        submitClaim(asAlice(), "120.00");

        mockMvc.perform(post("/internal/expense/offboarding").with(asHana())
                        .contentType(MediaType.APPLICATION_JSON).content(offboard))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cancelledClaims").value(1));

        // a second pass finds nothing open — the cancelled claim stays on record
        mockMvc.perform(post("/internal/expense/offboarding").with(asHana())
                        .contentType(MediaType.APPLICATION_JSON).content(offboard))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cancelledClaims").value(0));
    }

    @Test
    void offboardingIsHrOrAdminOnly() throws Exception {
        mockMvc.perform(post("/internal/expense/offboarding").with(asAlice())
                        .contentType(MediaType.APPLICATION_JSON).content(offboard))
                .andExpect(status().isForbidden());
    }

    @Test
    void offboardingRequiresAuthentication() throws Exception {
        mockMvc.perform(post("/internal/expense/offboarding")
                        .contentType(MediaType.APPLICATION_JSON).content(offboard))
                .andExpect(status().isUnauthorized());
    }
}
