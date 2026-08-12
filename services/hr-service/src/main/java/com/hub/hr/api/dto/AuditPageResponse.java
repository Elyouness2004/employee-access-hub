package com.hub.hr.api.dto;

import java.util.List;

import com.hub.hr.infrastructure.AuditLogEntry;
import org.springframework.data.domain.Page;

/**
 * A page of audit events with the paging metadata the DataGrid needs. Built from
 * a Spring Data {@link Page} rather than exposing {@code PageImpl} directly, so
 * the JSON contract is explicit and stable.
 */
public record AuditPageResponse(
        List<AuditEntryResponse> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean first,
        boolean last) {

    public static AuditPageResponse from(Page<AuditLogEntry> page) {
        return new AuditPageResponse(
                page.getContent().stream().map(AuditEntryResponse::from).toList(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages(),
                page.isFirst(),
                page.isLast());
    }
}
