package com.hub.leave.api;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Coarse RBAC (§2.7 layer 2) for the leave endpoints — positive and negative
 * per role. Ownership (layer 3) is covered in {@link LeaveRequestFlowTest};
 * here we assert the @PreAuthorize gate alone.
 */
class LeaveRbacMatrixTest extends LeaveWebTestSupport {

    @BeforeEach
    void directory() {
        givenDirectoryDefaults();
    }

    @Test
    void unauthenticatedIsAlways401() throws Exception {
        mockMvc.perform(get("/api/leave/requests/my")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/leave/balances/my")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/leave/requests/inbox")).andExpect(status().isUnauthorized());
    }

    @Test
    void employeeMaySubmitAndSeeOwnDataButNotManagerInbox() throws Exception {
        mockMvc.perform(get("/api/leave/requests/my").with(asAlice())).andExpect(status().isOk());
        mockMvc.perform(get("/api/leave/balances/my").with(asAlice())).andExpect(status().isOk());
        mockMvc.perform(get("/api/leave/requests/inbox").with(asAlice())).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/leave/requests/escalated").with(asAlice())).andExpect(status().isForbidden());
    }

    @Test
    void managerReachesInboxButNotHrEscalationOrBalanceAdmin() throws Exception {
        mockMvc.perform(get("/api/leave/requests/inbox").with(asMark())).andExpect(status().isOk());
        mockMvc.perform(get("/api/leave/requests/escalated").with(asMark())).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/leave/balances/" + ALICE_ID).with(asMark())).andExpect(status().isForbidden());
    }

    @Test
    void hrReachesEscalationInboxAndBalanceAdmin() throws Exception {
        mockMvc.perform(get("/api/leave/requests/escalated").with(asHana())).andExpect(status().isOk());
        mockMvc.perform(get("/api/leave/balances/" + ALICE_ID).with(asHana()).param("year", "2026"))
                .andExpect(status().isOk());
        mockMvc.perform(put("/api/leave/balances/" + ALICE_ID).with(asHana()).param("year", "2026")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"totalDays\": 30}"))
                .andExpect(status().isOk());
    }

    @Test
    void employeeCannotAdjustBalances() throws Exception {
        mockMvc.perform(put("/api/leave/balances/" + ALICE_ID).with(asAlice()).param("year", "2026")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"totalDays\": 99}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void offboardingSignalRequiresHrOrAdmin() throws Exception {
        mockMvc.perform(post("/internal/leave/offboarding").with(asAlice())
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"employeeKeycloakId\": \"" + ALICE_KC + "\"}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/internal/leave/offboarding").with(asMark())
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"employeeKeycloakId\": \"" + ALICE_KC + "\"}"))
                .andExpect(status().isForbidden());
    }
}
