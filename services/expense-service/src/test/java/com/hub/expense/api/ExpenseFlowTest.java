package com.hub.expense.api;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * End-to-end business flow at the web layer: one automated proof per business
 * rule (BR-01…BR-05) plus the state machine and the configurable threshold.
 */
class ExpenseFlowTest extends ExpenseWebTestSupport {

    @BeforeEach
    void directory() {
        givenDirectoryDefaults();
    }

    @Test
    void belowThresholdManagerApprovesDirectly() throws Exception {
        String id = submitClaim(asAlice(), "500.00");

        mockMvc.perform(post("/api/expenses/" + id + "/approve").with(asMark()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.secondApprovalRequired").value(false));
    }

    @Test
    void aboveThresholdRoutesToSecondApprovalBr03() throws Exception {
        String id = submitClaim(asAlice(), "1500.00");

        // first-level manager approval routes it, it does NOT finish
        mockMvc.perform(post("/api/expenses/" + id + "/approve").with(asMark()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING_SECOND_APPROVAL"))
                .andExpect(jsonPath("$.secondApprovalRequired").value(true));

        // a manager cannot give the second-level sign-off — HR/Admin only
        mockMvc.perform(post("/api/expenses/" + id + "/approve").with(asMark()))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/expenses/" + id + "/approve").with(asHana()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"));
    }

    @Test
    void configurableThresholdChangesRoutingBr03() throws Exception {
        // raise the threshold above the claim amount, then the same 1500 claim
        // is approved outright with no second level
        mockMvc.perform(put("/api/expenses/threshold").with(asHana())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\": 2000.00}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amount").value(2000.00));

        String id = submitClaim(asAlice(), "1500.00");
        mockMvc.perform(post("/api/expenses/" + id + "/approve").with(asMark()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.secondApprovalRequired").value(false));
    }

    @Test
    void ownerOnlyAccessBr01() throws Exception {
        String id = submitClaim(asAlice(), "300.00");

        // a different employee cannot see alice's claim...
        mockMvc.perform(get("/api/expenses/" + id).with(asBob()))
                .andExpect(status().isForbidden());
        // ...and it is not in his own list
        mockMvc.perform(get("/api/expenses/my").with(asBob()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(0));

        // owner, direct manager and HR may all read it
        mockMvc.perform(get("/api/expenses/" + id).with(asAlice())).andExpect(status().isOk());
        mockMvc.perform(get("/api/expenses/" + id).with(asMark())).andExpect(status().isOk());
        mockMvc.perform(get("/api/expenses/" + id).with(asHana())).andExpect(status().isOk());
    }

    @Test
    void onlyDirectManagerMayDecideBr02() throws Exception {
        String id = submitClaim(asBob(), "300.00");

        // eve is a manager, but not bob's — ownership beats role
        mockMvc.perform(post("/api/expenses/" + id + "/reject").with(asEve()))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/expenses/" + id + "/approve").with(asMark()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"));
    }

    @Test
    void selfManagedEscalatesToHrBr02() throws Exception {
        // mark has no manager: his claim escalates to HR and he cannot approve it
        String id = submitClaim(asMark(), "300.00");

        mockMvc.perform(post("/api/expenses/" + id + "/approve").with(asMark()))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/expenses/escalated").with(asHana()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id == '" + id + "')]").exists());
        mockMvc.perform(post("/api/expenses/" + id + "/approve").with(asHana()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"));
    }

    @Test
    void rejectedCannotBeModifiedBr04() throws Exception {
        String id = submitClaim(asAlice(), "300.00");
        mockMvc.perform(post("/api/expenses/" + id + "/reject").with(asMark())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"comment\": \"missing receipt\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"));

        // a rejected claim is terminal — no further decision or cancellation
        mockMvc.perform(post("/api/expenses/" + id + "/approve").with(asMark()))
                .andExpect(status().isConflict());
        mockMvc.perform(post("/api/expenses/" + id + "/cancel").with(asAlice()))
                .andExpect(status().isConflict());
    }

    @Test
    void everyDecisionIsAuditedBr05() throws Exception {
        String approved = submitClaim(asAlice(), "300.00");
        mockMvc.perform(post("/api/expenses/" + approved + "/approve").with(asMark()))
                .andExpect(status().isOk());

        String rejected = submitClaim(asBob(), "300.00");
        mockMvc.perform(post("/api/expenses/" + rejected + "/reject").with(asMark()))
                .andExpect(status().isOk());

        boolean approvedAudited = auditLog.findAll().stream()
                .anyMatch(e -> e.getAction().equals("EXPENSE_APPROVED")
                        && e.getResource().equals("expense:" + approved));
        boolean rejectedAudited = auditLog.findAll().stream()
                .anyMatch(e -> e.getAction().equals("EXPENSE_REJECTED")
                        && e.getResource().equals("expense:" + rejected));
        org.junit.jupiter.api.Assertions.assertTrue(approvedAudited, "approval must be audited (BR-05)");
        org.junit.jupiter.api.Assertions.assertTrue(rejectedAudited, "rejection must be audited (BR-05)");
    }

    @Test
    void ownerCancelsPendingButNotAfterTerminal() throws Exception {
        String id = submitClaim(asAlice(), "300.00");

        mockMvc.perform(post("/api/expenses/" + id + "/cancel").with(asBob()))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/expenses/" + id + "/cancel").with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        mockMvc.perform(post("/api/expenses/" + id + "/cancel").with(asAlice()))
                .andExpect(status().isConflict());
    }

    @Test
    void managerPendingInboxListsReports() throws Exception {
        submitClaim(asAlice(), "100.00");
        submitClaim(asBob(), "200.00");

        mockMvc.perform(get("/api/expenses/pending").with(asMark()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(2));
    }

    @Test
    void secondApprovalQueueListsAboveThresholdClaims() throws Exception {
        String id = submitClaim(asAlice(), "1500.00");
        mockMvc.perform(post("/api/expenses/" + id + "/approve").with(asMark()))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/expenses/second-approval").with(asAdam()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id == '" + id + "')]").exists());
    }

    @Test
    void futureDatedClaimIsRejected() throws Exception {
        mockMvc.perform(claim(asAlice(), "TRAVEL", "100.00", "2999-01-01"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void negativeAmountIsRejected() throws Exception {
        mockMvc.perform(claim(asAlice(), "TRAVEL", "-10.00", "2026-07-01"))
                .andExpect(status().isBadRequest());
    }
}
