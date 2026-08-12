/**
 * Public surface of the audit feature (P23 Audit Center). Read-only by
 * construction: there is no mutation hook here because `audit_log` is
 * append-only (BR-06) and the controller exposes nothing that writes.
 */
export { AuditCenterPage } from './pages/AuditCenterPage';
export { auditKeys, useAuditStatisticsQuery } from './api/audit-api';
