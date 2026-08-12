package com.hub.hr.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Aggregated series backing the Audit Center charts over a bounded window. All
 * counts are derived from existing append-only tables (no new data): the daily
 * series come from {@code audit_log}, the login-attempt breakdown from the
 * admin-driven {@code security_event} history. Keycloak's native login/logout
 * stream (P3.6) is not yet ingested, so "login attempts" reflects the security
 * events the platform records today.
 */
public record AuditStatisticsResponse(
        Instant from,
        Instant to,
        List<DailyCount> actionsPerDay,
        List<DailyCount> failedActionsPerDay,
        List<DailyCount> provisioningPerDay,
        List<DailyCount> offboardingPerDay,
        List<LabeledCount> loginAttempts) {

    /** A count bucketed by calendar day (UTC). */
    public record DailyCount(LocalDate date, long count) {
    }

    /** A count bucketed by a label (e.g. a security-event type). */
    public record LabeledCount(String label, long count) {
    }
}
