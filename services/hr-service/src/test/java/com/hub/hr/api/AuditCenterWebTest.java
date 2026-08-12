package com.hub.hr.api;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Audit Center API (Enterprise Audit Viewer): the paged/sorted/filtered/searchable
 * list, single-event detail with its resource timeline, chart statistics, the
 * audited CSV export, RBAC (401/403 for non HR/Admin), the OpenAPI surface and
 * the immutability guarantee (no mutating verb is served). Rows are seeded via
 * JDBC into an ancient time window and behind a unique resource prefix so
 * assertions are isolated from any other test's audit rows in the shared schema.
 */
class AuditCenterWebTest extends IdentityWebTestSupport {

    private static final String PREFIX = "audit_it:";
    private static final Instant BASE = Instant.parse("2000-06-01T10:00:00Z");

    private UUID onboardedId;
    private UUID approvedId;

    @BeforeEach
    void seedAuditTrail() {
        // resource emp-1 carries a two-event timeline (onboarded then offboarded)
        onboardedId = seed("jane.doe", "EMPLOYEE_PROVISIONED", PREFIX + "emp-1", "onboarded", day(0));
        seed("bob.admin", "EMPLOYEE_SYNC_FAILED", PREFIX + "emp-2", "boom", day(1));
        seed("jane.doe", "EMPLOYEE_OFFBOARDED", PREFIX + "emp-1", "offboarded", day(2));
        approvedId = seed("carol.hr", "LEAVE_REQUEST_APPROVED", PREFIX + "req-1", null, day(3));
        seedSecurityEvent("SESSIONS_REVOKED", "jane.doe", day(1));
    }

    // ---- list: pagination, sorting, filtering, search -------------------------------------------

    @Test
    void listsAuditEventsNewestFirstWithDerivedServiceAndResult() throws Exception {
        mockMvc.perform(get("/api/hr/audit").param("resource", PREFIX).with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(4))
                .andExpect(jsonPath("$.content[0].action").value("LEAVE_REQUEST_APPROVED"))
                .andExpect(jsonPath("$.content[0].service").value("hr"))
                .andExpect(jsonPath("$.content[0].result").value("SUCCESS"))
                .andExpect(jsonPath("$.content[0].timestamp", notNullValue()));
    }

    @Test
    void paginatesTheResultSet() throws Exception {
        mockMvc.perform(get("/api/hr/audit")
                        .param("resource", PREFIX).param("size", "2").param("page", "0")
                        .with(asRoles("ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(4))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.size").value(2))
                .andExpect(jsonPath("$.first").value(true))
                .andExpect(jsonPath("$.last").value(false))
                .andExpect(jsonPath("$.content.length()").value(2));
    }

    @Test
    void sortsAscendingWhenAsked() throws Exception {
        mockMvc.perform(get("/api/hr/audit")
                        .param("resource", PREFIX).param("sort", "occurredAt,asc")
                        .with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].action").value("EMPLOYEE_PROVISIONED"));
    }

    @Test
    void filtersByAction() throws Exception {
        mockMvc.perform(get("/api/hr/audit")
                        .param("resource", PREFIX).param("action", "EMPLOYEE_OFFBOARDED")
                        .with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].action").value("EMPLOYEE_OFFBOARDED"));
    }

    @Test
    void filtersByUserCaseInsensitiveContains() throws Exception {
        mockMvc.perform(get("/api/hr/audit")
                        .param("resource", PREFIX).param("user", "JANE").with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void filtersByDerivedFailureResult() throws Exception {
        mockMvc.perform(get("/api/hr/audit")
                        .param("resource", PREFIX).param("result", "FAILURE").with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].action").value("EMPLOYEE_SYNC_FAILED"))
                .andExpect(jsonPath("$.content[0].result").value("FAILURE"));
    }

    @Test
    void filtersByDateRange() throws Exception {
        mockMvc.perform(get("/api/hr/audit")
                        .param("resource", PREFIX)
                        .param("from", day(1).toString()).param("to", day(2).toString())
                        .with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void searchesAcrossDetails() throws Exception {
        mockMvc.perform(get("/api/hr/audit")
                        .param("resource", PREFIX).param("search", "boom").with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].action").value("EMPLOYEE_SYNC_FAILED"));
    }

    // ---- detail + timeline ----------------------------------------------------------------------

    @Test
    void detailReturnsTheEventWithItsResourceTimeline() throws Exception {
        mockMvc.perform(get("/api/hr/audit/" + onboardedId).with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.event.id").value(onboardedId.toString()))
                .andExpect(jsonPath("$.event.action").value("EMPLOYEE_PROVISIONED"))
                .andExpect(jsonPath("$.timeline.length()").value(2))
                .andExpect(jsonPath("$.timeline[0].action").value("EMPLOYEE_PROVISIONED"))
                .andExpect(jsonPath("$.timeline[1].action").value("EMPLOYEE_OFFBOARDED"));
    }

    @Test
    void detailForUnknownIdIsRfc7807NotFound() throws Exception {
        mockMvc.perform(get("/api/hr/audit/" + UUID.randomUUID()).with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.title").value("Resource not found"));
    }

    // ---- statistics -----------------------------------------------------------------------------

    @Test
    void statisticsAggregatesTheChartSeriesOverTheWindow() throws Exception {
        mockMvc.perform(get("/api/hr/audit/statistics")
                        .param("from", BASE.minus(Duration.ofHours(1)).toString())
                        .param("to", day(4).toString())
                        .with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.actionsPerDay.length()").value(4))
                .andExpect(jsonPath("$.failedActionsPerDay.length()").value(1))
                .andExpect(jsonPath("$.failedActionsPerDay[0].count").value(1))
                .andExpect(jsonPath("$.provisioningPerDay.length()").value(1))
                .andExpect(jsonPath("$.offboardingPerDay.length()").value(1))
                .andExpect(jsonPath("$.loginAttempts[0].label").value("SESSIONS_REVOKED"))
                .andExpect(jsonPath("$.loginAttempts[0].count").value(1));
    }

    // ---- export (itself audited) ----------------------------------------------------------------

    @Test
    void exportsFilteredEventsAsCsv() throws Exception {
        mockMvc.perform(get("/api/hr/audit/export").param("resource", PREFIX).with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("text/csv"))
                .andExpect(header().string("Content-Disposition", containsString("audit-export.csv")))
                .andExpect(content().string(containsString("id,timestamp,user,action,resource,service,result,details")))
                .andExpect(content().string(containsString("EMPLOYEE_OFFBOARDED")));
    }

    @Test
    void everyExportIsItselfAudited() throws Exception {
        mockMvc.perform(get("/api/hr/audit/export").param("resource", PREFIX).with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk());

        // the export wrote an AUDIT_EXPORTED row that now shows up in the trail it exported
        mockMvc.perform(get("/api/hr/audit").param("action", "AUDIT_EXPORTED").with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].user").value("admin.user"))
                .andExpect(jsonPath("$.content[0].resource").value("audit_log"))
                .andExpect(jsonPath("$.content[0].result").value("SUCCESS"));
    }

    // ---- security: RBAC + immutability ----------------------------------------------------------

    @Test
    void employeeIsForbidden() throws Exception {
        mockMvc.perform(get("/api/hr/audit").with(asRoles("EMPLOYEE")))
                .andExpect(status().isForbidden());
    }

    @Test
    void managerIsForbidden() throws Exception {
        mockMvc.perform(get("/api/hr/audit").with(asRoles("MANAGER", "EMPLOYEE")))
                .andExpect(status().isForbidden());
    }

    @Test
    void anonymousIsUnauthorized() throws Exception {
        mockMvc.perform(get("/api/hr/audit"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void auditRecordsCannotBeMutated() throws Exception {
        // no mutating verb is mapped, so an authorised HR user still gets 405 — records are append-only
        mockMvc.perform(delete("/api/hr/audit/" + approvedId).with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isMethodNotAllowed());
        mockMvc.perform(post("/api/hr/audit").with(asRoles("HR", "EMPLOYEE")))
                .andExpect(status().isMethodNotAllowed());
    }

    // ---- OpenAPI surface ------------------------------------------------------------------------

    @Test
    void openApiDescribesTheAuditCenter() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/hr/audit']", notNullValue()))
                .andExpect(jsonPath("$.paths['/api/hr/audit/{id}']", notNullValue()))
                .andExpect(jsonPath("$.paths['/api/hr/audit/statistics']", notNullValue()))
                .andExpect(jsonPath("$.paths['/api/hr/audit/export']", notNullValue()));
    }

    // ---- seeding helpers ------------------------------------------------------------------------

    private static Instant day(int offset) {
        return BASE.plus(Duration.ofDays(offset));
    }

    private UUID seed(String actor, String action, String resource, String details, Instant when) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into hr.audit_log (id, actor, action, resource, details, occurred_at) "
                + "values (?, ?, ?, ?, ?, ?)", id, actor, action, resource, details, when);
        return id;
    }

    private void seedSecurityEvent(String type, String actor, Instant when) {
        jdbc.update("insert into hr.security_event (id, keycloak_id, username, type, actor, detail, occurred_at) "
                        + "values (?, ?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(), UUID.randomUUID(), actor, type, actor, null, when);
    }
}
