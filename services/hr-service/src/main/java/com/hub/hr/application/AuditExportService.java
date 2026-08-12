package com.hub.hr.application;

import java.util.ArrayList;
import java.util.List;

import com.hub.hr.api.dto.AuditEntryResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Export side of the Audit Center. Collecting an export is itself a sensitive
 * action, so every export writes an {@code AUDIT_EXPORTED} row through the same
 * append-only {@link AuditTrail} in the same transaction as the read — meaning
 * the export shows up in the very trail it exported. Reuses
 * {@link AuditQueryService} for the (capped) result set; the API layer turns the
 * returned rows into the requested wire format (CSV today).
 */
@Service
@Transactional
public class AuditExportService {

    private static final String EXPORT_ACTION = "AUDIT_EXPORTED";
    private static final String EXPORT_RESOURCE = "audit_log";

    private final AuditQueryService queries;
    private final AuditTrail audit;

    public AuditExportService(AuditQueryService queries, AuditTrail audit) {
        this.queries = queries;
        this.audit = audit;
    }

    /** Fetch the filtered rows for {@code format} and record the export in the audit trail. */
    public List<AuditEntryResponse> collectForExport(Actor actor, String format, AuditFilter filter) {
        List<AuditEntryResponse> rows = queries.export(filter);
        audit.record(actor.username(), EXPORT_ACTION, EXPORT_RESOURCE,
                "format=" + format + "; rows=" + rows.size() + "; " + summarize(filter));
        return rows;
    }

    /** Compact, human-readable description of the applied filters for the audit detail. */
    private static String summarize(AuditFilter filter) {
        List<String> parts = new ArrayList<>();
        if (filter.from() != null) {
            parts.add("from=" + filter.from());
        }
        if (filter.to() != null) {
            parts.add("to=" + filter.to());
        }
        if (filter.actor() != null) {
            parts.add("user=" + filter.actor());
        }
        if (filter.action() != null) {
            parts.add("action=" + filter.action());
        }
        if (filter.resource() != null) {
            parts.add("resource=" + filter.resource());
        }
        if (filter.result() != null) {
            parts.add("result=" + filter.result());
        }
        if (filter.search() != null) {
            parts.add("search=" + filter.search());
        }
        return parts.isEmpty() ? "filters=none" : "filters=[" + String.join(", ", parts) + "]";
    }
}
