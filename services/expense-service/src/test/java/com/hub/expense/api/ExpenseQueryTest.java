package com.hub.expense.api;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Paging, sorting, filtering and search on the expense lists. The scope of each
 * list (owner, addressed manager, escalation, second-approval queue) is pinned
 * server-side, so these tests also check that a filter can only ever narrow it.
 */
class ExpenseQueryTest extends ExpenseWebTestSupport {

    private static final String MY = "/api/expenses/my";
    private static final String SEARCH = "/api/expenses/search";

    @BeforeEach
    void directory() {
        givenDirectoryDefaults();
    }

    @Test
    void ownListIsPagedAndCountsOnlyOwnClaims() throws Exception {
        submitClaim(asAlice(), "100.00");
        submitClaim(asAlice(), "200.00");
        submitClaim(asBob(), "300.00");

        mockMvc.perform(get(MY).with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.first").value(true));

        mockMvc.perform(get(MY).param("size", "1").with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.totalPages").value(2));
    }

    @Test
    void filtersByCategoryDateRangeAndAmountRange() throws Exception {
        mockMvc.perform(claim(asAlice(), "TRAVEL", "100.00", "2026-06-01")).andExpect(status().isCreated());
        mockMvc.perform(claim(asAlice(), "MEALS", "900.00", "2026-07-15")).andExpect(status().isCreated());

        mockMvc.perform(get(MY).param("category", "MEALS").with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].category").value("MEALS"));

        mockMvc.perform(get(MY).param("from", "2026-07-01").with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].category").value("MEALS"));

        mockMvc.perform(get(MY).param("minAmount", "500").with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));

        mockMvc.perform(get(MY).param("maxAmount", "500").with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].category").value("TRAVEL"));
    }

    @Test
    void hrSearchSpansEveryClaimAndIsPaged() throws Exception {
        submitClaim(asAlice(), "100.00");
        submitClaim(asBob(), "200.00");

        mockMvc.perform(get(SEARCH).with(asHana()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));

        mockMvc.perform(get(SEARCH).param("status", "SUBMITTED").param("category", "TRAVEL")
                        .with(asHana()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));

        mockMvc.perform(get(SEARCH).param("status", "APPROVED").with(asHana()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void searchesTheDescription() throws Exception {
        mockMvc.perform(claim(asAlice(), "TRAVEL", "100.00", "2026-06-01").with(asAlice()))
                .andExpect(status().isCreated());

        mockMvc.perform(get(SEARCH).param("search", "TEST").with(asHana()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));

        mockMvc.perform(get(SEARCH).param("search", "nothing-matches").with(asHana()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void managerInboxIsPagedAndSortable() throws Exception {
        submitClaim(asAlice(), "100.00");
        submitClaim(asBob(), "200.00");

        mockMvc.perform(get("/api/expenses/pending").param("sort", "createdAt,asc").with(asMark()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content[*].employeeKeycloakId",
                        contains(ALICE_KC.toString(), BOB_KC.toString())));
    }

    @Test
    void unknownSortColumnFallsBackAndSizeIsClamped() throws Exception {
        submitClaim(asAlice(), "100.00");

        mockMvc.perform(get(MY).param("sort", "employeeKeycloakId,asc").param("size", "5000")
                        .with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(200))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void secondApprovalQueueIsPaged() throws Exception {
        String id = submitClaim(asAlice(), "1500.00");
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/expenses/" + id + "/approve").with(asMark()))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/expenses/second-approval").with(asAdam()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].status").value("PENDING_SECOND_APPROVAL"));
    }
}
