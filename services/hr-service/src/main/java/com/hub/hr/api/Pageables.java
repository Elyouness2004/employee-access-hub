package com.hub.hr.api;

import java.util.List;
import java.util.Set;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

/**
 * Shared hardening of client-supplied paging for every collection endpoint:
 * the page size is clamped so no caller can ask for an unbounded page, and a
 * sort on a column that is not whitelisted is dropped rather than reaching the
 * persistence layer (an unknown property would otherwise surface as a 500).
 */
final class Pageables {

    private Pageables() {
    }

    static Pageable sanitize(Pageable pageable, Set<String> sortable, Sort defaultSort, int maxPageSize) {
        List<Sort.Order> allowed = pageable.getSort().stream()
                .filter(order -> sortable.contains(order.getProperty()))
                .toList();
        Sort sort = allowed.isEmpty() ? defaultSort : Sort.by(allowed);
        int size = Math.min(Math.max(pageable.getPageSize(), 1), maxPageSize);
        return PageRequest.of(pageable.getPageNumber(), size, sort);
    }
}
