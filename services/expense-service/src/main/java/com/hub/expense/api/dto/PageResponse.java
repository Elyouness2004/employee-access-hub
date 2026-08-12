package com.hub.expense.api.dto;

import java.util.List;
import java.util.function.Function;

import org.springframework.data.domain.Page;

/**
 * Generic paged envelope for collection endpoints — the same JSON shape every
 * service in the platform returns for a page. Built from a Spring Data
 * {@link Page} rather than exposing {@code PageImpl} directly, so the JSON
 * contract is explicit and stable.
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

    public static <E, T> PageResponse<T> from(Page<E> page, Function<E, T> mapper) {
        return new PageResponse<>(
                page.getContent().stream().map(mapper).toList(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages(),
                page.isFirst(),
                page.isLast());
    }
}
