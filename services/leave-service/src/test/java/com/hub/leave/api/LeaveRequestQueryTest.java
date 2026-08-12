package com.hub.leave.api;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Paging, sorting, filtering and search on the leave request lists. The scope of
 * each list (owner, addressed manager, HR escalation) is pinned server-side, so
 * these tests also check that a filter can only ever narrow it.
 */
class LeaveRequestQueryTest extends LeaveWebTestSupport {

    private static final String MY = "/api/leave/requests/my";
    private static final String INBOX = "/api/leave/requests/inbox";

    @BeforeEach
    void directory() {
        givenDirectoryDefaults();
    }

    @Test
    void ownListIsPagedAndCountsOnlyOwnRequests() throws Exception {
        submitAnnual(asAlice(), "2026-08-03", "2026-08-07");
        submitAnnual(asAlice(), "2026-09-07", "2026-09-11");
        submitAnnual(asBob(), "2026-08-10", "2026-08-14");

        mockMvc.perform(get(MY).with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.first").value(true));

        mockMvc.perform(get(MY).param("size", "1").with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.last").value(false));
    }

    @Test
    void filtersByStatusTypeAndPeriod() throws Exception {
        String toCancel = submitAnnual(asAlice(), "2026-08-03", "2026-08-07");
        mockMvc.perform(post("/api/leave/requests/" + toCancel + "/cancel").with(asAlice()))
                .andExpect(status().isOk());
        mockMvc.perform(submission(asAlice(), "SICK", "2026-09-07", "2026-09-11"))
                .andExpect(status().isCreated());

        mockMvc.perform(get(MY).param("status", "CANCELLED").with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(toCancel));

        mockMvc.perform(get(MY).param("type", "SICK").with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].type").value("SICK"));

        // the period window overlaps the request, it does not have to contain it
        mockMvc.perform(get(MY).param("from", "2026-09-01").param("to", "2026-09-08").with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].type").value("SICK"));

        mockMvc.perform(get(MY).param("from", "2026-11-01").with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void searchesTheReason() throws Exception {
        mockMvc.perform(post("/api/leave/requests").with(asAlice())
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"type\": \"ANNUAL\", \"startDate\": \"2026-08-03\", "
                                + "\"endDate\": \"2026-08-07\", \"reason\": \"family wedding\"}"))
                .andExpect(status().isCreated());
        submitAnnual(asAlice(), "2026-09-07", "2026-09-11");

        mockMvc.perform(get(MY).param("search", "WEDDING").with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].reason").value("family wedding"));
    }

    @Test
    void managerInboxIsPagedAndSortable() throws Exception {
        submitAnnual(asAlice(), "2026-08-03", "2026-08-07");
        submitAnnual(asBob(), "2026-08-10", "2026-08-14");

        mockMvc.perform(get(INBOX).param("sort", "createdAt,asc").with(asMark()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content[*].employeeKeycloakId",
                        contains(ALICE_KC.toString(), BOB_KC.toString())));

        mockMvc.perform(get(INBOX).param("size", "1").with(asMark()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    /** An unknown sort column must degrade to the default rather than reach the database. */
    @Test
    void unknownSortColumnFallsBackAndSizeIsClamped() throws Exception {
        submitAnnual(asAlice(), "2026-08-03", "2026-08-07");

        mockMvc.perform(get(MY).param("sort", "employeeKeycloakId,asc").param("size", "5000")
                        .with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(200))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void escalatedQueueIsPagedAndHrOnly() throws Exception {
        submitAnnual(asEve(), "2026-08-03", "2026-08-07");   // self-managed → escalates to HR

        mockMvc.perform(get("/api/leave/requests/escalated").with(asHana()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].hrEscalated").value(true));

        mockMvc.perform(get("/api/leave/requests/escalated").with(asAlice()))
                .andExpect(status().isForbidden());
    }
}
