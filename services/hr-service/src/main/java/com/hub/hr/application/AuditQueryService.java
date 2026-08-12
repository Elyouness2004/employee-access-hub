package com.hub.hr.application;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Predicate;

import com.hub.hr.api.dto.AuditEntryResponse;
import com.hub.hr.api.dto.AuditEventDetailResponse;
import com.hub.hr.api.dto.AuditPageResponse;
import com.hub.hr.api.dto.AuditStatisticsResponse;
import com.hub.hr.api.dto.AuditStatisticsResponse.DailyCount;
import com.hub.hr.api.dto.AuditStatisticsResponse.LabeledCount;
import com.hub.hr.infrastructure.AuditLogEntry;
import com.hub.hr.infrastructure.AuditLogRepository;
import com.hub.hr.infrastructure.AuditLogSpecifications;
import com.hub.hr.infrastructure.SecurityEvent;
import com.hub.hr.infrastructure.SecurityEventRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read side of the Audit Center (HR/Admin). Serves the paged/sorted/filtered
 * list, the single-event detail with its resource timeline, the bounded export
 * projection and the chart statistics — all by reusing the existing append-only
 * repositories (no data duplicated, nothing mutated). Mirrors the read-only
 * query-service pattern of {@link IdentityQueryService}.
 */
@Service
@Transactional(readOnly = true)
public class AuditQueryService {

    /** Hard cap on a single export so a filter can never stream an unbounded result. */
    static final int MAX_EXPORT_ROWS = 10_000;

    private static final String ACTION_PROVISIONED = "EMPLOYEE_PROVISIONED";
    private static final String ACTION_OFFBOARDED = "EMPLOYEE_OFFBOARDED";

    private final AuditLogRepository auditLog;
    private final SecurityEventRepository securityEvents;

    public AuditQueryService(AuditLogRepository auditLog, SecurityEventRepository securityEvents) {
        this.auditLog = auditLog;
        this.securityEvents = securityEvents;
    }

    /** Paged, sorted and filtered list for the DataGrid. */
    public AuditPageResponse page(AuditFilter filter, Pageable pageable) {
        Page<AuditLogEntry> page = auditLog.findAll(AuditLogSpecifications.matching(filter), pageable);
        return AuditPageResponse.from(page);
    }

    /** One event plus the chronological timeline of everything on the same resource. */
    public AuditEventDetailResponse detail(UUID id) {
        AuditLogEntry entry = auditLog.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("audit event", id));
        List<AuditLogEntry> timeline = auditLog.findAllByResourceOrderByOccurredAtAsc(entry.getResource());
        return AuditEventDetailResponse.from(entry, timeline);
    }

    /** Bounded, newest-first projection of the filtered events for CSV export. */
    public List<AuditEntryResponse> export(AuditFilter filter) {
        Pageable capped = PageRequest.of(0, MAX_EXPORT_ROWS, Sort.by(Sort.Direction.DESC, "occurredAt"));
        return auditLog.findAll(AuditLogSpecifications.matching(filter), capped)
                .map(AuditEntryResponse::from)
                .getContent();
    }

    /** Chart series over a bounded [from, to] window, aggregated in memory (one scan per source). */
    public AuditStatisticsResponse statistics(Instant from, Instant to) {
        List<AuditLogEntry> entries = auditLog.findByOccurredAtBetween(from, to);
        List<SecurityEvent> events = securityEvents.findByOccurredAtBetween(from, to);

        return new AuditStatisticsResponse(
                from,
                to,
                dailyCounts(entries, entry -> true),
                dailyCounts(entries, entry -> isFailure(entry.getAction())),
                dailyCounts(entries, entry -> ACTION_PROVISIONED.equals(entry.getAction())),
                dailyCounts(entries, entry -> ACTION_OFFBOARDED.equals(entry.getAction())),
                loginAttempts(events));
    }

    private static boolean isFailure(String action) {
        return action != null && action.endsWith("FAILED");
    }

    private static List<DailyCount> dailyCounts(List<AuditLogEntry> entries, Predicate<AuditLogEntry> keep) {
        Map<LocalDate, Long> byDay = new LinkedHashMap<>();
        entries.stream()
                .filter(keep)
                .map(entry -> LocalDate.ofInstant(entry.getOccurredAt(), ZoneOffset.UTC))
                .sorted()
                .forEach(day -> byDay.merge(day, 1L, Long::sum));
        return byDay.entrySet().stream()
                .map(e -> new DailyCount(e.getKey(), e.getValue()))
                .toList();
    }

    private static List<LabeledCount> loginAttempts(List<SecurityEvent> events) {
        Map<String, Long> byType = new LinkedHashMap<>();
        events.stream()
                .map(SecurityEvent::getType)
                .sorted()
                .forEach(type -> byType.merge(type, 1L, Long::sum));
        return byType.entrySet().stream()
                .map(e -> new LabeledCount(e.getKey(), e.getValue()))
                .toList();
    }
}
