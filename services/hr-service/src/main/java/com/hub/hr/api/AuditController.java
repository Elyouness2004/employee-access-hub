package com.hub.hr.api;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import com.hub.hr.api.dto.AuditEntryResponse;
import com.hub.hr.api.dto.AuditEventDetailResponse;
import com.hub.hr.api.dto.AuditPageResponse;
import com.hub.hr.api.dto.AuditStatisticsResponse;
import com.hub.hr.application.AuditExportService;
import com.hub.hr.application.AuditFilter;
import com.hub.hr.application.AuditQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Audit Center (Enterprise Audit Viewer) — read-only HR/Admin window onto the
 * append-only {@code audit_log}. Coarse RBAC at layer 2 (HR/ADMIN), routed
 * through the gateway like the rest of {@code /api/hr/**}. Provides the paged /
 * sorted / filtered / searchable list, single-event detail with its resource
 * timeline, chart statistics and an audited CSV export. There is deliberately no
 * mutating endpoint: audit records can never be edited or deleted (BR-06).
 */
@RestController
@RequestMapping("/api/hr/audit")
@PreAuthorize("hasAnyRole('HR', 'ADMIN')")
@Tag(name = "Audit Center")
public class AuditController {

    /** Sortable columns; anything else falls back to the default to avoid a 500 on a bad sort. */
    private static final Set<String> SORTABLE = Set.of("occurredAt", "actor", "action", "resource");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.DESC, "occurredAt");
    private static final int MAX_PAGE_SIZE = 200;
    private static final Duration DEFAULT_STATS_WINDOW = Duration.ofDays(30);

    private final AuditQueryService queries;
    private final AuditExportService exports;

    public AuditController(AuditQueryService queries, AuditExportService exports) {
        this.queries = queries;
        this.exports = exports;
    }

    @GetMapping
    @Operation(summary = "List audit events (paged, sorted, filtered, full-text search)")
    public AuditPageResponse list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(required = false) String user,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String resource,
            @RequestParam(required = false) String result,
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20, sort = "occurredAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return queries.page(filter(from, to, user, action, resource, result, search), sanitize(pageable));
    }

    @GetMapping("/{id}")
    @Operation(summary = "One audit event with the full timeline of its resource")
    public AuditEventDetailResponse detail(@PathVariable UUID id) {
        return queries.detail(id);
    }

    @GetMapping("/statistics")
    @Operation(summary = "Chart series: actions/day, failed actions, provisioning, offboarding, login attempts")
    public AuditStatisticsResponse statistics(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {
        Instant resolvedTo = to != null ? to : Instant.now();
        Instant resolvedFrom = from != null ? from : resolvedTo.minus(DEFAULT_STATS_WINDOW);
        return queries.statistics(resolvedFrom, resolvedTo);
    }

    @GetMapping(value = "/export", produces = "text/csv")
    @Operation(summary = "Export the filtered events as CSV (the export is itself audited)")
    public ResponseEntity<String> exportCsv(
            @AuthenticationPrincipal Jwt jwt, Authentication authentication,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
            @RequestParam(required = false) String user,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String resource,
            @RequestParam(required = false) String result,
            @RequestParam(required = false) String search) {
        List<AuditEntryResponse> rows = exports.collectForExport(Actors.from(jwt, authentication), "CSV",
                filter(from, to, user, action, resource, result, search));
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"audit-export.csv\"")
                .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
                .body(AuditCsvWriter.toCsv(rows));
    }

    private static AuditFilter filter(Instant from, Instant to, String user, String action,
                                      String resource, String result, String search) {
        return AuditFilter.of(from, to, user, action, resource, result, search);
    }

    /** Clamp the page size and drop any sort on a non-whitelisted column. */
    private static Pageable sanitize(Pageable pageable) {
        return Pageables.sanitize(pageable, SORTABLE, DEFAULT_SORT, MAX_PAGE_SIZE);
    }
}
