package com.hub.hr.api.dto;

import java.time.Instant;
import java.util.UUID;

import com.hub.hr.infrastructure.AuditLogEntry;

/**
 * One audit event as the Audit Center list/detail/export renders it. Fields map
 * to what the append-only {@code audit_log} actually stores plus two honest
 * derivations: {@code service} (this trail belongs to the HR context) and
 * {@code result} (failure actions end with {@code _FAILED} by convention).
 * Role, IP, browser, session id and correlation id are not captured by the
 * trail and are deliberately not surfaced here.
 */
public record AuditEntryResponse(
        UUID id,
        Instant timestamp,
        String user,
        String action,
        String resource,
        String service,
        String result,
        String details) {

    private static final String SERVICE = "hr";

    public static AuditEntryResponse from(AuditLogEntry entry) {
        return new AuditEntryResponse(
                entry.getId(),
                entry.getOccurredAt(),
                entry.getActor(),
                entry.getAction(),
                entry.getResource(),
                SERVICE,
                resultOf(entry.getAction()),
                entry.getDetails());
    }

    /** SUCCESS unless the action follows the {@code _FAILED} failure-suffix convention. */
    static String resultOf(String action) {
        return action != null && action.endsWith("FAILED") ? "FAILURE" : "SUCCESS";
    }
}
