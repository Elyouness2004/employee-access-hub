package com.hub.leave.api;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end business flow at the web layer: submit → manager decision → the
 * balance moves, plus one automated proof per business rule (AC for E05).
 * 2026-08 dates: 03 and 10 are Mondays, 07 and 14 Fridays.
 */
class LeaveRequestFlowTest extends LeaveWebTestSupport {

    @BeforeEach
    void directory() {
        givenDirectoryDefaults();
    }

    @Test
    void submitThenApproveDebitsBalance() throws Exception {
        // default allocation is 25; alice takes a 5-business-day week
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/api/leave/balances/my").with(asAlice()).param("year", "2026"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalDays").value(25))
                .andExpect(jsonPath("$.usedDays").value(0))
                .andExpect(jsonPath("$.availableDays").value(25));

        String id = submitAnnual(asAlice(), "2026-08-03", "2026-08-07");

        mockMvc.perform(post("/api/leave/requests/" + id + "/approve").with(asMark()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.businessDays").value(5));

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/api/leave/balances/my").with(asAlice()).param("year", "2026"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.usedDays").value(5))
                .andExpect(jsonPath("$.availableDays").value(20));
    }

    @Test
    void submitBeyondBalanceIsRejectedBr01() throws Exception {
        // trim alice's allocation to 3 days, then request a 5-day week
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/api/leave/balances/" + ALICE_ID).with(asHana()).param("year", "2026")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"totalDays\": 3}"))
                .andExpect(status().isOk());

        mockMvc.perform(submission(asAlice(), "ANNUAL", "2026-08-03", "2026-08-07"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.rule").value("BR-01"));
    }

    @Test
    void selfApprovalIsBlockedBr02() throws Exception {
        // mark is a manager who is also an employee; his own request must not
        // be self-approved — it escalates to HR instead
        String id = submitAnnual(asMark(), "2026-08-03", "2026-08-07");

        mockMvc.perform(post("/api/leave/requests/" + id + "/approve").with(asMark()))
                .andExpect(status().isForbidden());

        // and it shows up in the HR escalation inbox
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/api/leave/requests/escalated").with(asHana()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id == '" + id + "')]").exists());

        mockMvc.perform(post("/api/leave/requests/" + id + "/approve").with(asHana()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"));
    }

    @Test
    void selfManagedEmployeeEscalatesToHrBr02() throws Exception {
        // eve manages herself: no manager may approve, so HR must
        String id = submitAnnual(asEve(), "2026-08-03", "2026-08-07");

        mockMvc.perform(post("/api/leave/requests/" + id + "/approve").with(asEve()))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/leave/requests/" + id + "/approve").with(asHana()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"));
    }

    @Test
    void overlappingApprovedLeaveIsRejectedBr03() throws Exception {
        String first = submitAnnual(asAlice(), "2026-08-03", "2026-08-07");
        mockMvc.perform(post("/api/leave/requests/" + first + "/approve").with(asMark()))
                .andExpect(status().isOk());

        // a second request touching the approved week is refused
        mockMvc.perform(submission(asAlice(), "ANNUAL", "2026-08-06", "2026-08-11"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.rule").value("BR-03"));
    }

    @Test
    void onlyDirectManagerMayDecide() throws Exception {
        // bob reports to mark; hana (HR) is not his manager and the request is
        // not escalated, so HR gets 403 too — ownership beats role here
        String id = submitAnnual(asBob(), "2026-08-03", "2026-08-07");

        // eve is a different manager, not bob's
        mockMvc.perform(post("/api/leave/requests/" + id + "/reject").with(asEve()))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/leave/requests/" + id + "/approve").with(asMark()))
                .andExpect(status().isOk());
    }

    @Test
    void ownerCancelsBeforeDecisionButNotAfter() throws Exception {
        String id = submitAnnual(asAlice(), "2026-08-03", "2026-08-07");

        // a different employee cannot cancel alice's request
        mockMvc.perform(post("/api/leave/requests/" + id + "/cancel").with(asBob()))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/leave/requests/" + id + "/cancel").with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));

        // cancelling after a terminal state is a 409
        mockMvc.perform(post("/api/leave/requests/" + id + "/cancel").with(asAlice()))
                .andExpect(status().isConflict());
    }

    @Test
    void rejectDoesNotTouchBalance() throws Exception {
        String id = submitAnnual(asAlice(), "2026-08-03", "2026-08-07");
        mockMvc.perform(post("/api/leave/requests/" + id + "/reject").with(asMark())
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"comment\": \"bad timing\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"));

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/api/leave/balances/my").with(asAlice()).param("year", "2026"))
                .andExpect(jsonPath("$.usedDays").value(0));
    }

    @Test
    void managerInboxListsPendingReports() throws Exception {
        submitAnnual(asAlice(), "2026-08-03", "2026-08-07");
        submitAnnual(asBob(), "2026-08-10", "2026-08-14");

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/api/leave/requests/inbox").with(asMark()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void sickLeaveDoesNotDrawOnBalance() throws Exception {
        String id = submitAnnual(asAlice(), "2026-08-03", "2026-08-07"); // to keep a marker
        mockMvc.perform(post("/api/leave/requests/" + id + "/cancel").with(asAlice()));

        String sick = jsonField(mockMvc.perform(submission(asAlice(), "SICK", "2026-08-03", "2026-08-07"))
                .andExpect(status().isCreated()).andReturn(), "id");
        mockMvc.perform(post("/api/leave/requests/" + sick + "/approve").with(asMark()))
                .andExpect(status().isOk());

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .get("/api/leave/balances/my").with(asAlice()).param("year", "2026"))
                .andExpect(jsonPath("$.usedDays").value(0));
    }
}
