package com.hub.hr.api;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.hub.hr.api.dto.AuditEntryResponse;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** RFC-4180 formatting, quoting/escaping and formula-injection neutralisation of the CSV export. */
class AuditCsvWriterTest {

    private static final UUID ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final Instant WHEN = Instant.parse("2026-07-21T09:30:00Z");

    @Test
    void writesHeaderAndACrlfTerminatedRow() {
        String csv = AuditCsvWriter.toCsv(List.of(row("jane.doe", "EMPLOYEE_PROVISIONED",
                "employee:e1", "onboarded")));

        assertThat(csv).startsWith("id,timestamp,user,action,resource,service,result,details\r\n");
        assertThat(csv).contains(ID + ",2026-07-21T09:30:00Z,jane.doe,EMPLOYEE_PROVISIONED,"
                + "employee:e1,hr,SUCCESS,onboarded\r\n");
    }

    @Test
    void quotesFieldsContainingCommasQuotesAndNewlines() {
        String csv = AuditCsvWriter.toCsv(List.of(row("jane.doe", "EMPLOYEE_UPDATED",
                "employee:e1", "changed name to \"Doe, Jane\"\nby HR")));

        assertThat(csv).contains("\"changed name to \"\"Doe, Jane\"\"\nby HR\"");
    }

    @Test
    void rendersNullDetailsAsAnEmptyField() {
        String csv = AuditCsvWriter.toCsv(List.of(row("bob.admin", "LEAVE_REQUEST_APPROVED",
                "leave_request:l1", null)));

        assertThat(csv).contains("leave_request:l1,hr,SUCCESS,\r\n");
    }

    @Test
    void derivesFailureResultFromTheActionSuffix() {
        String csv = AuditCsvWriter.toCsv(List.of(row("bob.admin", "EMPLOYEE_SYNC_FAILED",
                "employee:e2", "boom")));

        assertThat(csv).contains(",EMPLOYEE_SYNC_FAILED,employee:e2,hr,FAILURE,boom\r\n");
    }

    @Test
    void neutralisesSpreadsheetFormulaInjection() {
        String csv = AuditCsvWriter.toCsv(List.of(row("jane.doe", "EMPLOYEE_UPDATED",
                "employee:e1", "=cmd|'/c calc'!A1")));

        // leading '=' is neutralised with an apostrophe so a spreadsheet won't evaluate it
        assertThat(csv).contains(",SUCCESS,'=cmd|'/c calc'!A1\r\n");
    }

    private static AuditEntryResponse row(String user, String action, String resource, String details) {
        String result = action.endsWith("FAILED") ? "FAILURE" : "SUCCESS";
        return new AuditEntryResponse(ID, WHEN, user, action, resource, "hr", result, details);
    }
}
