package com.hub.hr.api;

import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** The clamping rules every paged endpoint relies on, exercised directly. */
class PageablesTest {

    private static final Set<String> SORTABLE = Set.of("name", "createdAt");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.ASC, "name");

    @Test
    void clampsPageSizeToTheCeiling() {
        var sanitized = Pageables.sanitize(PageRequest.of(2, 5_000), SORTABLE, DEFAULT_SORT, 200);

        assertEquals(200, sanitized.getPageSize());
        assertEquals(2, sanitized.getPageNumber(), "the requested page is preserved");
    }

    @Test
    void keepsAReasonableSize() {
        assertEquals(25, Pageables.sanitize(PageRequest.of(0, 25), SORTABLE, DEFAULT_SORT, 200).getPageSize());
    }

    @Test
    void keepsOnlyWhitelistedSortOrders() {
        Sort requested = Sort.by(Sort.Order.desc("createdAt"), Sort.Order.asc("secret"));

        Sort sanitized = Pageables.sanitize(PageRequest.of(0, 20, requested), SORTABLE, DEFAULT_SORT, 200)
                .getSort();

        assertEquals(Sort.by(Sort.Order.desc("createdAt")), sanitized);
    }

    @Test
    void fallsBackToTheDefaultWhenNothingIsWhitelisted() {
        Sort requested = Sort.by(Sort.Order.asc("password"));

        Sort sanitized = Pageables.sanitize(PageRequest.of(0, 20, requested), SORTABLE, DEFAULT_SORT, 200)
                .getSort();

        assertEquals(DEFAULT_SORT, sanitized);
    }

    @Test
    void fallsBackToTheDefaultWhenUnsorted() {
        Sort sanitized = Pageables.sanitize(PageRequest.of(0, 20), SORTABLE, DEFAULT_SORT, 200).getSort();

        assertEquals(DEFAULT_SORT, sanitized);
    }
}
