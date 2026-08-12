/**
 * Reading an audit row the way a person would.
 *
 * Everything the trail stores is machine-shaped: an action is a code, a target
 * is `employee:<uuid>`, a failure is `SomeException: some message`. All of it is
 * worth keeping — an administrator investigating a failed onboarding needs the
 * exception name and the id — but none of it is what someone reads FIRST.
 *
 * So this module derives, and never replaces:
 *
 *  - the raw `action`, `resource` and `details` remain available verbatim and
 *    are rendered in the technical section of every surface that uses this;
 *  - `result` is untouched — it is backend-owned (api-conventions) and is
 *    rendered exactly as received;
 *  - an action or exception this map does not know falls back to the raw value
 *    rather than to an invented sentence. A trail that paraphrases something it
 *    did not recognise is worse than one that shows the code.
 */

/** The `<kind>:<id>` targets the services write (`audit.record(..., resource, ...)`). */
export type AuditResourceKind =
  | 'employee'
  | 'document'
  | 'document_category'
  | 'expense'
  | 'expense_settings'
  | 'leave_request'
  | 'leave_balance'
  | 'notification'
  | 'session'
  | 'unknown';

export interface AuditResource {
  kind: AuditResourceKind;
  /** The identifier after the colon, or the whole string when there is none. */
  id: string;
  /** What the kind is called in words: `Employee`, `Leave request`. */
  label: string;
  /** The verbatim stored value — what the technical section shows. */
  raw: string;
}

const RESOURCE_LABELS: Record<AuditResourceKind, string> = {
  employee: 'Employee',
  document: 'Document',
  document_category: 'Document category',
  expense: 'Expense claim',
  expense_settings: 'Expense settings',
  leave_request: 'Leave request',
  leave_balance: 'Leave balance',
  notification: 'Notification',
  session: 'Session',
  unknown: 'Target',
};

const KNOWN_KINDS = new Set<string>(Object.keys(RESOURCE_LABELS));

export function parseAuditResource(resource: string | null | undefined): AuditResource | null {
  if (!resource) return null;
  const colon = resource.indexOf(':');
  if (colon < 0) {
    return { kind: 'unknown', id: resource, label: RESOURCE_LABELS.unknown, raw: resource };
  }
  const prefix = resource.slice(0, colon);
  const id = resource.slice(colon + 1);
  const kind: AuditResourceKind = KNOWN_KINDS.has(prefix)
    ? (prefix as AuditResourceKind)
    : 'unknown';
  return { kind, id, label: RESOURCE_LABELS[kind], raw: resource };
}

/**
 * Human labels for the action codes the services actually write. Transcribed
 * from the `audit.record(...)` call sites, not guessed.
 *
 * The `_FAILED` suffix is handled structurally rather than by listing every
 * failure twice: `ProvisioningJournal.recordFailure` writes `<action>_FAILED`
 * for any action, so a code this map has never seen still reads correctly.
 */
const ACTION_LABELS: Record<string, string> = {
  EMPLOYEE_PROVISIONED: 'Login account provisioned',
  EMPLOYEE_SYNCED: 'Realm role synchronised',
  EMPLOYEE_OFFBOARDED: 'Employee offboarded',
  ONBOARD: 'Onboarding',
  EMPLOYEE_SYNC: 'Role synchronisation',
  AUDIT_EXPORTED: 'Audit trail exported',
  SECURITY_RESET_PASSWORD: 'Password reset',
  SECURITY_REQUIRE_MFA: 'MFA enrolment required',
  SECURITY_LOCK: 'Account locked',
  SECURITY_UNLOCK: 'Account unlocked',
  SECURITY_DISABLE: 'Employee deactivated',
  SECURITY_REACTIVATE: 'Employee reactivated',
  SECURITY_REVOKE_SESSIONS: 'Sessions revoked',
  SECURITY_SYNC_ROLES: 'Realm role synchronised',
  LEAVE_REQUEST_SUBMITTED: 'Leave request submitted',
  LEAVE_REQUEST_APPROVED: 'Leave request approved',
  LEAVE_REQUEST_REJECTED: 'Leave request rejected',
  LEAVE_REQUEST_CANCELLED: 'Leave request withdrawn',
  LEAVE_BALANCE_ADJUSTED: 'Leave balance adjusted',
  LEAVE_OFFBOARDING_CANCELLATION: 'Leave cancelled on offboarding',
  EXPENSE_SUBMITTED: 'Expense claim submitted',
  EXPENSE_FIRST_APPROVED: 'Expense claim approved (first level)',
  EXPENSE_APPROVED: 'Expense claim approved',
  EXPENSE_REJECTED: 'Expense claim rejected',
  EXPENSE_CANCELLED: 'Expense claim withdrawn',
  EXPENSE_THRESHOLD_UPDATED: 'Expense threshold changed',
  EXPENSE_OFFBOARDING_CANCELLATION: 'Expense claims cancelled on offboarding',
  DOCUMENT_UPLOADED: 'Document uploaded',
  DOCUMENT_UPDATED: 'Document updated',
  DOCUMENT_DELETED: 'Document deleted',
  DOCUMENT_DOWNLOADED: 'Document downloaded',
  DOCUMENT_CATEGORY_CREATED: 'Document category created',
  DOCUMENT_CATEGORY_UPDATED: 'Document category updated',
  DOCUMENT_CATEGORY_DELETED: 'Document category deleted',
  DOCUMENT_OFFBOARDING_REVOCATION: 'Document access revoked on offboarding',
};

/**
 * The action in words, or `null` when the code is not one we know — the caller
 * then shows the code itself, which is the honest answer.
 */
export function auditActionLabel(action: string | null | undefined): string | null {
  if (!action) return null;
  const direct = ACTION_LABELS[action];
  if (direct) return direct;
  if (action.endsWith('_FAILED')) {
    const base = ACTION_LABELS[action.slice(0, -'_FAILED'.length)];
    if (base) return `${base} failed`;
  }
  return null;
}

export interface AuditFailure {
  /** `IdentityUnavailableException` — the exception's simple name. */
  exception?: string;
  /** The exception's own message, verbatim. */
  message?: string;
  /** An HTTP status mentioned in the message, when there is one. */
  httpStatus?: string;
  /**
   * What the failure means, in a sentence — derived from the EXCEPTION TYPE
   * only. Absent for a type this map does not know, in which case the caller
   * shows the server's message rather than a paraphrase of it.
   */
  explanation?: string;
}

/**
 * Explanations keyed on the exception types this platform actually throws
 * (`ApiExceptionHandler` and the identity services). Each one says what
 * happened and what it implies — the two things a code alone does not.
 */
const FAILURE_EXPLANATIONS: Record<string, string> = {
  IdentityUnavailableException:
    'The identity provider could not be reached, so nothing was changed in Keycloak.',
  ProvisioningException:
    'Keycloak was reached and refused the operation — the record was left unlinked.',
  EmployeeNotProvisionedException:
    'The action needs a linked login account and this record has none.',
  ResourceNotFoundException: 'The record the action referred to no longer exists.',
  DuplicateResourceException: 'A record with the same unique value already exists.',
  IllegalEmployeeStateException: 'The record was not in a state that allows this action.',
  DataIntegrityViolationException: 'The write conflicted with existing data and was rolled back.',
};

/**
 * The failure behind a `details` blob. `summarize(Throwable)` in the identity
 * services writes `SimpleName: message`, which is what this reads; a `details`
 * that is not shaped that way (`role=EMPLOYEE account=created …`) is not a
 * failure and yields nothing.
 */
export function parseAuditFailure(details: string | null | undefined): AuditFailure | null {
  if (!details) return null;
  const match = /^([A-Z][A-Za-z0-9_]*(?:Exception|Error))(?::\s*(.*))?$/s.exec(details.trim());
  if (!match) return null;

  const exception = match[1]!;
  const message = match[2]?.trim() || undefined;
  const status = message ? /\b([45]\d{2})\b/.exec(message)?.[1] : undefined;

  return {
    exception,
    ...(message ? { message } : {}),
    ...(status ? { httpStatus: status } : {}),
    ...(FAILURE_EXPLANATIONS[exception] ? { explanation: FAILURE_EXPLANATIONS[exception] } : {}),
  };
}

/** The service that owns a trail, in words. `AuditEntryResponse.service` is `hr`. */
export function auditServiceLabel(service: string | null | undefined): string {
  if (!service) return '—';
  const labels: Record<string, string> = {
    hr: 'HR',
    leave: 'Leave',
    expense: 'Expenses',
    documents: 'Documents',
  };
  return labels[service] ?? service;
}
