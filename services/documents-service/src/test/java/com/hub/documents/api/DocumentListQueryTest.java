package com.hub.documents.api;

import org.junit.jupiter.api.Test;

import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Paging, sorting, filtering and search on the document list. The important
 * property is that the access rule is applied <em>before</em> paging: a filtered
 * page must never be short, and {@code totalElements} must count only what the
 * caller may actually see.
 */
class DocumentListQueryTest extends DocumentsWebTestSupport {

    private static final String BASE = "/api/documents";

    @Test
    void totalCountsOnlyWhatTheCallerMaySee() throws Exception {
        upload(asHana(), "handbook", GENERAL_CAT, null);
        upload(asHana(), "salary-bands", HR_CAT, null);
        upload(asHana(), "alice-contract", GENERAL_CAT, ALICE_KC);
        upload(asHana(), "bob-contract", GENERAL_CAT, BOB_KC);

        // alice: the company-wide general document + her own contract
        mockMvc.perform(get(BASE).with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content.length()").value(2));

        // HR sees every document in its tier, owned or not
        mockMvc.perform(get(BASE).with(asHana()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(4));
    }

    /** A page must be full even when the access rule excludes rows — the filter is in SQL. */
    @Test
    void pagingIsNotShortenedByTheAccessRule() throws Exception {
        for (int i = 0; i < 3; i++) {
            upload(asHana(), "sensitive-" + i, HR_CAT, null);
            upload(asHana(), "public-" + i, GENERAL_CAT, null);
        }

        mockMvc.perform(get(BASE).param("size", "2").with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.totalPages").value(2));
    }

    @Test
    void filtersByCategoryAndOwner() throws Exception {
        upload(asHana(), "handbook", GENERAL_CAT, null);
        upload(asHana(), "alice-contract", GENERAL_CAT, ALICE_KC);
        upload(asHana(), "salary-bands", HR_CAT, null);

        mockMvc.perform(get(BASE).param("categoryId", HR_CAT).with(asHana()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].title").value("salary-bands"));

        mockMvc.perform(get(BASE).param("ownerKeycloakId", ALICE_KC.toString()).with(asHana()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].title").value("alice-contract"));
    }

    /** A filter can only narrow: asking for someone else's documents returns nothing, not a 403. */
    @Test
    void anOwnerFilterCannotWidenTheScope() throws Exception {
        upload(asHana(), "bob-contract", GENERAL_CAT, BOB_KC);

        mockMvc.perform(get(BASE).param("ownerKeycloakId", BOB_KC.toString()).with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void searchesTitleAndDescription() throws Exception {
        upload(asHana(), "annual-handbook", GENERAL_CAT, null);
        upload(asHana(), "expense-policy", GENERAL_CAT, null);

        mockMvc.perform(get(BASE).param("search", "HANDBOOK").with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].title").value("annual-handbook"));
    }

    @Test
    void sortsOnWhitelistedColumnsAndClampsTheSize() throws Exception {
        upload(asHana(), "alpha", GENERAL_CAT, null);
        upload(asHana(), "beta", GENERAL_CAT, null);

        mockMvc.perform(get(BASE).param("sort", "title,asc").with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].title", contains("alpha", "beta")));

        mockMvc.perform(get(BASE).param("sort", "storageKey,asc").param("size", "9999").with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.size").value(200));
    }

    @Test
    void categoryCatalogueIsPagedAndSearchable() throws Exception {
        mockMvc.perform(get("/api/documents/categories").with(asHana()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.content[*].name", contains("General", "HR Confidential", "Payroll")));

        mockMvc.perform(get("/api/documents/categories").param("search", "payroll").with(asHana()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].minRole").value("ADMIN"));
    }
}
