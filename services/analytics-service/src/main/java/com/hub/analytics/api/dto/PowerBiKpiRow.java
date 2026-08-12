package com.hub.analytics.api.dto;

import java.math.BigDecimal;

/**
 * One flat KPI row optimized for Power BI's tabular model: a source, a metric
 * name, a numeric value, and whether the source was available when read. A flat
 * array of these imports directly with no nesting to unpack.
 */
public record PowerBiKpiRow(
        String source,
        String metric,
        BigDecimal value,
        boolean available) {

    public static PowerBiKpiRow of(String source, String metric, long value, boolean available) {
        return new PowerBiKpiRow(source, metric, BigDecimal.valueOf(value), available);
    }

    public static PowerBiKpiRow of(String source, String metric, BigDecimal value, boolean available) {
        return new PowerBiKpiRow(source, metric, value == null ? BigDecimal.ZERO : value, available);
    }
}
