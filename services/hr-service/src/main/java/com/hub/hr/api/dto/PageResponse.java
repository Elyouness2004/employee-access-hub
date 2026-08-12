package com.hub.hr.api.dto;

import java.util.List;
import java.util.function.Function;

import org.springframework.data.domain.Page;

/**
 * Generic paged envelope for collection endpoints. Same JSON shape as the
 * purpose-built {@link AuditPageResponse} / {@link NotificationPageResponse}
 * (which stay as-is so their published contracts and OpenAPI schema names do not
 * move), so every paged endpoint in the platform answers with the same fields.
 * Built from a Spring Data {@link Page} rather than exposing {@code PageImpl}
 * directly, so the JSON contract is explicit and stable.
 *
 * @param <T> the response DTO carried in {@link #content()}
 */
public record PageResponse<T>(
        List<T> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean first,
        boolean last) {

    /** Projects a page of entities through {@code mapper} into the response envelope. */
    public static <E, T> PageResponse<T> from(Page<E> page, Function<E, T> mapper) {
        return of(page, page.getContent().stream().map(mapper).toList());
    }

    /**
     * Envelope around content the caller has already projected — for read models
     * that resolve a whole page at once (batch lookups) instead of row by row.
     */
    public static <E, T> PageResponse<T> of(Page<E> page, List<T> content) {
        return new PageResponse<>(
                content,
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages(),
                page.isFirst(),
                page.isLast());
    }
}
