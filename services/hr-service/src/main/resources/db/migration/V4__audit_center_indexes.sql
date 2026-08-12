-- Audit Center (read side): additive indexes so the HR/Admin audit viewer's
-- filters and sorts stay performant on the append-only trail. Purely additive —
-- no table, column or data change; the audit_log rows remain insert-only (BR-06).
-- Portable across PostgreSQL (compose) and H2 in PostgreSQL mode (local/tests).

-- Default sort and date-range filter are on occurred_at (newest first).
create index ix_audit_log_occurred_at on audit_log (occurred_at);
-- "User" filter / search on the actor (username).
create index ix_audit_log_actor on audit_log (actor);
-- "Action" filter and the FAILED-suffix ("Result") predicate (V1 indexed only
-- resource; documents-service already carries this action index).
create index ix_audit_log_action on audit_log (action);
