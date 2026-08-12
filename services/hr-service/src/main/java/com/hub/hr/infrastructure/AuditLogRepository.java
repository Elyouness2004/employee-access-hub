package com.hub.hr.infrastructure;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface AuditLogRepository extends JpaRepository<AuditLogEntry, UUID>,
        JpaSpecificationExecutor<AuditLogEntry> {

    List<AuditLogEntry> findAllByResourceOrderByOccurredAtAsc(String resource);

    /** Bounded window scan backing the Audit Center statistics (uses ix_audit_log_occurred_at). */
    List<AuditLogEntry> findByOccurredAtBetween(Instant from, Instant to);
}
