package com.hub.hr.api.dto;

import java.util.List;

import com.hub.hr.infrastructure.AuditLogEntry;

/**
 * Detail view of one audit event plus the full chronological timeline of every
 * event recorded against the same resource — reusing the existing
 * {@code findAllByResourceOrderByOccurredAtAsc} finder. This gives the details
 * page the "timeline of the event" without storing anything new.
 */
public record AuditEventDetailResponse(
        AuditEntryResponse event,
        List<AuditEntryResponse> timeline) {

    public static AuditEventDetailResponse from(AuditLogEntry event, List<AuditLogEntry> timeline) {
        return new AuditEventDetailResponse(
                AuditEntryResponse.from(event),
                timeline.stream().map(AuditEntryResponse::from).toList());
    }
}
