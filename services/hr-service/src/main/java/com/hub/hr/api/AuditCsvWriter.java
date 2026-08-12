package com.hub.hr.api;

import java.util.List;

import com.hub.hr.api.dto.AuditEntryResponse;

/**
 * Renders audit events as RFC-4180 CSV with zero third-party dependencies.
 * Fields containing a comma, quote or newline are double-quoted with quotes
 * doubled; leading formula characters ({@code = + - @}) are neutralised with a
 * leading apostrophe so a downloaded audit file cannot become a spreadsheet
 * formula-injection vector.
 */
final class AuditCsvWriter {

    private static final String HEADER = "id,timestamp,user,action,resource,service,result,details";
    private static final String NEWLINE = "\r\n";

    private AuditCsvWriter() {
    }

    static String toCsv(List<AuditEntryResponse> rows) {
        StringBuilder out = new StringBuilder(HEADER).append(NEWLINE);
        for (AuditEntryResponse row : rows) {
            out.append(field(row.id() == null ? null : row.id().toString())).append(',')
                    .append(field(row.timestamp() == null ? null : row.timestamp().toString())).append(',')
                    .append(field(row.user())).append(',')
                    .append(field(row.action())).append(',')
                    .append(field(row.resource())).append(',')
                    .append(field(row.service())).append(',')
                    .append(field(row.result())).append(',')
                    .append(field(row.details())).append(NEWLINE);
        }
        return out.toString();
    }

    private static String field(String value) {
        if (value == null || value.isEmpty()) {
            return "";
        }
        String sanitised = neutraliseFormula(value);
        boolean mustQuote = sanitised.indexOf(',') >= 0 || sanitised.indexOf('"') >= 0
                || sanitised.indexOf('\n') >= 0 || sanitised.indexOf('\r') >= 0;
        String escaped = sanitised.replace("\"", "\"\"");
        return mustQuote ? '"' + escaped + '"' : escaped;
    }

    private static String neutraliseFormula(String value) {
        char first = value.charAt(0);
        return (first == '=' || first == '+' || first == '-' || first == '@') ? "'" + value : value;
    }
}
