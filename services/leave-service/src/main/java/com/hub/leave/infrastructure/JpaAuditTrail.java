package com.hub.leave.infrastructure;

import com.hub.leave.application.AuditTrail;
import org.springframework.stereotype.Component;

@Component
public class JpaAuditTrail implements AuditTrail {

    private final AuditLogRepository repository;

    public JpaAuditTrail(AuditLogRepository repository) {
        this.repository = repository;
    }

    @Override
    public void record(String actor, String action, String resource, String details) {
        repository.save(new AuditLogEntry(actor, action, resource, details));
    }
}
