package com.hub.hr.application;

import java.time.Instant;

/**
 * Query criteria for the Audit Center list/export (read side). Only the
 * dimensions the append-only {@code audit_log} actually backs are exposed:
 * a date range on {@code occurred_at}, the acting user, the action, the
 * resource, the derived result, and a free-text search. Roles, IP, browser,
 * session and correlation id are not captured by the trail, so they are not
 * filterable here; the free-text {@link #search()} still matches anything an
 * action left in {@code details}. Blank inputs are normalised to {@code null}
 * (ignored). Built by the API from request parameters.
 */
public record AuditFilter(
        Instant from,
        Instant to,
        String actor,
        String action,
        String resource,
        Result result,
        String search) {

    /** Derived from the action naming convention: failure actions end with {@code _FAILED}. */
    public enum Result { SUCCESS, FAILURE }

    public static AuditFilter of(Instant from, Instant to, String actor, String action,
                                 String resource, String result, String search) {
        return new AuditFilter(from, to,
                Filters.blankToNull(actor), Filters.blankToNull(action), Filters.blankToNull(resource),
                parseResult(result), Filters.blankToNull(search));
    }

    private static Result parseResult(String value) {
        String normalised = Filters.blankToNull(value);
        if (normalised == null) {
            return null;
        }
        try {
            return Result.valueOf(normalised.toUpperCase());
        } catch (IllegalArgumentException ignored) {
            // an unknown result is treated as "no result filter" rather than a 500
            return null;
        }
    }
}
