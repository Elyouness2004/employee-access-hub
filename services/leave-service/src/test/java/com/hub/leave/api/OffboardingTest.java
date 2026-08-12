package com.hub.leave.api;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * BR-05: offboarding cancels pending requests and re-credits not-yet-started
 * approved leave. Future dates keep the approved leave in the re-credit path.
 */
class OffboardingTest extends LeaveWebTestSupport {

    @BeforeEach
    void directory() {
        givenDirectoryDefaults();
    }

    @Test
    void offboardingCancelsPendingAndRecreditsFutureApproved() throws Exception {
        // one approved future week (debits 5) and one still-pending week
        String approved = submitAnnual(asAlice(), "2026-12-07", "2026-12-11");
        mockMvc.perform(post("/api/leave/requests/" + approved + "/approve").with(asMark()))
                .andExpect(status().isOk());
        String pending = submitAnnual(asAlice(), "2026-11-02", "2026-11-06");

        mockMvc.perform(get("/api/leave/balances/my").with(asAlice()).param("year", "2026"))
                .andExpect(jsonPath("$.usedDays").value(5));

        // hr-service relays the offboarding signal
        mockMvc.perform(post("/internal/leave/offboarding").with(asHana())
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"employeeKeycloakId\": \"" + ALICE_KC + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cancelledRequests").value(2))
                .andExpect(jsonPath("$.recreditedDays").value(5));

        // both requests are CANCELLED and the debited days came back
        mockMvc.perform(get("/api/leave/requests/" + approved).with(asHana()))
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        mockMvc.perform(get("/api/leave/requests/" + pending).with(asHana()))
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        mockMvc.perform(get("/api/leave/balances/my").with(asAlice()).param("year", "2026"))
                .andExpect(jsonPath("$.usedDays").value(0));
    }
}
