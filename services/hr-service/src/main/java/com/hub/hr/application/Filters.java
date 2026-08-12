package com.hub.hr.application;

/**
 * Normalisation shared by the query-criteria records ({@link AuditFilter},
 * {@link EmployeeFilter}): a query parameter that is absent, empty or only
 * whitespace means "no filter", so it is normalised to {@code null} once, here,
 * instead of in every criteria record.
 */
final class Filters {

    private Filters() {
    }

    static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
