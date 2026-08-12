/**
 * hr-service DTOs — transcribed from the Java records (see ./README.md).
 *
 * Source: services/hr-service/src/main/java/com/hub/hr/api/dto/*.java
 *         services/hr-service/src/main/java/com/hub/hr/domain/*.java
 */

/** `com.hub.hr.domain.EmployeeStatus` — only ACTIVE keeps the Keycloak account enabled. */
export type EmployeeStatus = 'ACTIVE' | 'DISABLED' | 'TERMINATED';

/** `com.hub.hr.domain.ProvisioningStatus` — identity-provisioning state of the record. */
export type ProvisioningStatus =
  'NOT_PROVISIONED' | 'PROVISIONED' | 'FAILED' | 'DISABLED' | 'LOCKED';

/**
 * `EmployeeResponse` — what the HR directory returns (`GET /api/hr/employees`,
 * `GET /api/hr/employees/{id}`). Ids only: HR *does* hold the department and
 * position catalogues, so the server does not resolve labels here the way it
 * does for `EmployeeProfileResponse`.
 *
 * **Known gap (verified against `EmployeeResponse.java`, 2026-07-31):** the
 * record carries NO `provisioningStatus`, `provisionedAt` or `lastSyncAt`, even
 * though `GET /api/hr/employees` accepts `provisioningStatus` as a *filter* and
 * as a sort column. The directory can therefore narrow by provisioning state but
 * cannot display each row's state. What it can state honestly is whether a login
 * account is LINKED at all — `keycloakId` is exactly `Employee.isProvisioned()`
 * in the domain (`keycloakId != null`). Anything finer requires backend work.
 */
export interface EmployeeResponse {
  /** The HR record id — NEVER a Keycloak subject. */
  id: string;
  /** The linked login account (`jwt.sub`); null until provisioning links one. */
  keycloakId: string | null;
  matricule: string;
  firstName: string;
  lastName: string;
  email: string;
  /** ISO date (`LocalDate`). */
  hireDate: string;
  status: EmployeeStatus;
  /** HR record id of the manager — an employeeId, never a Keycloak subject. */
  managerId: string | null;
  departmentId: string;
  positionId: string;
  /** ISO instants. */
  createdAt: string;
  updatedAt: string;
}

/**
 * `EmployeeRequest` — the create/update body. Bean Validation, transcribed:
 * `matricule` @NotBlank @Size(max 32) · `firstName`/`lastName` @NotBlank
 * @Size(max 100) · `email` @NotBlank @Email @Size(max 255) · `hireDate` @NotNull
 * @PastOrPresent · `status` @NotNull · `departmentId`/`positionId` @NotNull ·
 * `managerId` optional.
 *
 * `keycloakId` and `provisioningStatus` are deliberately absent: identity
 * onboarding owns them, never the CRUD API (`Employee` javadoc).
 */
export interface EmployeeRequest {
  matricule: string;
  firstName: string;
  lastName: string;
  email: string;
  hireDate: string;
  status: EmployeeStatus;
  managerId: string | null;
  departmentId: string;
  positionId: string;
}

/** `DepartmentResponse` — `GET /api/hr/departments`. */
export interface DepartmentResponse {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `DepartmentRequest` — @NotBlank @Size(max 100) name, @Size(max 500) description. */
export interface DepartmentRequest {
  name: string;
  description: string | null;
}

/** `PositionResponse` — `GET /api/hr/positions`. Titled, not named. */
export interface PositionResponse {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `PositionRequest` — @NotBlank @Size(max 100) title, @Size(max 500) description. */
export interface PositionRequest {
  title: string;
  description: string | null;
}

/**
 * `ProvisioningStatusResponse` — the identity state of one employee.
 *
 * Readable at `GET /api/hr/admin/employees/{id}/identity` and returned by every
 * identity action, so the panel shows live state rather than the last thing an
 * action happened to report.
 *
 * The two status fields answer different questions and routinely disagree:
 * `employeeStatus` is the HR record, `provisioningStatus` is what Keycloak
 * holds. A LOCKED account belongs to an ACTIVE employee; a TERMINATED employee
 * still has a DISABLED account on record. Rendering one as the other is wrong.
 */
export interface ProvisioningStatusResponse {
  employeeId: string;
  keycloakId: string | null;
  /** Whether a Keycloak account is linked at all — `keycloakId !== null`. */
  linked: boolean;
  employeeStatus: EmployeeStatus;
  provisioningStatus: ProvisioningStatus;
  /** Derived realm role (`RealmRoleResolver`), e.g. `MANAGER`. */
  realmRole: string | null;
  provisionedAt: string | null;
  lastSyncAt: string | null;
  /**
   * Whether Keycloak delivered the password-setup / enrolment e-mail for the
   * action just performed. `null` for a plain read and for actions that send no
   * mail. Never a password — the server generates none.
   */
  activationEmailSent: boolean | null;
}

/**
 * `ProvisioningHistoryResponse` — one append-only journal row
 * (`GET /api/hr/admin/employees/{id}/provisioning`, unpaged, oldest first).
 *
 * `action` is a free-form verb the services write (`ONBOARD`, `SYNC`, `LOCK`,
 * `RESET_PASSWORD`, `OFFBOARD`, …) and `status` a `ProvisioningRecordStatus`
 * literal (`PROVISIONED`, `SYNCED`, `FAILED`, `DISABLED`, `LOCKED`, `UNLOCKED`,
 * `PASSWORD_RESET`, `ROLES_SYNCED`, `SESSIONS_REVOKED`). Both are rendered, never
 * re-worded — a failure row's `detail` is the exception summary an operator needs.
 */
export interface ProvisioningHistoryResponse {
  id: string;
  employeeId: string;
  /** Null on a FAILED provisioning attempt — no account was ever linked. */
  keycloakId: string | null;
  action: string;
  status: string;
  detail: string | null;
  occurredAt: string;
}

/**
 * `PersonResponse` — a display identity for an identifier some other record
 * stores (`GET /api/hr/people`, authenticated, unpaged).
 *
 * The work-directory projection and nothing more: no hire date, no department,
 * no position, no manager, no provisioning state — those stay on the scoped
 * `EmployeeResponse` / `EmployeeProfileResponse`. `username` is DERIVED by the
 * server from the work e-mail (its local part), because hr-service provisions
 * Keycloak accounts with the e-mail as the username while accounts created
 * outside it carry the short login; both forms name the same account.
 */
export interface PersonResponse {
  /** The HR record id. */
  employeeId: string;
  /** The linked login account (`jwt.sub`); null for an unprovisioned record. */
  keycloakId: string | null;
  matricule: string;
  firstName: string;
  lastName: string;
  /** Backend-owned display name — rendered verbatim, never recomposed. */
  displayName: string;
  /** Short login form (e-mail local part). */
  username: string | null;
  email: string;
  status: EmployeeStatus;
}

/**
 * `SecurityEventResponse` — one security-event row
 * (`GET /api/hr/admin/employees/{id}/security-events`, unpaged, oldest first).
 * Keyed by `keycloakId`, so an employee with no linked account has none.
 */
export interface SecurityEventResponse {
  id: string;
  keycloakId: string | null;
  /** The account's username at the time — hr-service records the email. */
  username: string | null;
  /** `PASSWORD_RESET`, `DISABLED`, `LOCK`, `UNLOCK`, `REVOKE`, `ROLE_SYNC`, `OFFBOARDED`. */
  type: string;
  /** Who performed it (`Actor.username()`), including `system` for automation. */
  actor: string | null;
  detail: string | null;
  occurredAt: string;
}

/**
 * `OffboardingResponse` — the result of `POST /api/hr/admin/employees/{id}/offboard`.
 *
 * `notified` and `failed` are the downstream services the BR-05 fan-out reached
 * and missed. They are backend-owned lists: rendered verbatim, never recomputed,
 * and a non-empty `failed` is a PARTIAL success — the record is TERMINATED
 * either way, because `OffboardingService` commits the status change regardless.
 */
export interface OffboardingResponse {
  employeeId: string;
  keycloakId: string | null;
  /** False when no account was linked, or when Keycloak refused the disable. */
  identityDisabled: boolean;
  notified: string[];
  failed: string[];
}

/**
 * `EmployeeProfileResponse` — the self-service projection returned by
 * `GET /api/hr/me` and `GET /api/hr/me/team`. It carries the same fields as the
 * HR-only `EmployeeResponse` PLUS resolved labels, because an employee or a
 * manager cannot read the department/position catalogues (HR/Admin only) and so
 * could never turn the raw ids into anything displayable.
 *
 * Nullable on the record: department, position and manager may all be absent
 * (unresolved catalogue entry, or nobody to report to).
 */
export interface EmployeeProfileResponse {
  /** The HR record id — NEVER a Keycloak subject. */
  id: string;
  /** The linked login account (`jwt.sub`); null until identity onboarding runs. */
  keycloakId: string | null;
  matricule: string;
  firstName: string;
  lastName: string;
  email: string;
  /** ISO date (`LocalDate`). */
  hireDate: string;
  status: EmployeeStatus;
  provisioningStatus: ProvisioningStatus;
  departmentId: string | null;
  departmentName: string | null;
  positionId: string | null;
  positionTitle: string | null;
  managerId: string | null;
  managerKeycloakId: string | null;
  managerName: string | null;
  managerEmail: string | null;
  /** ISO instant. */
  createdAt: string;
  updatedAt: string;
}

/**
 * `SessionResponse` — one active Keycloak session (Part 8). The authoritative
 * Keycloak facts merged with locally-held attributes its admin representation
 * does not carry (browser, OS, device, MFA). Every one of those may be null;
 * the UI must not invent device metadata the backend does not return.
 */
export interface SessionResponse {
  id: string;
  /** Marks the session the caller is using right now. */
  current: boolean;
  browser: string | null;
  operatingSystem: string | null;
  deviceName: string | null;
  ipAddress: string | null;
  /** ISO instants. */
  loginTime: string | null;
  lastActivity: string | null;
  /**
   * Read from the `acr`/`amr` claims. MFA is NOT implemented in the realm
   * (backend P3.5), so this reads `false` today — that is the platform's real
   * state, not a bug.
   */
  mfaUsed: boolean;
  expiresAt: string | null;
  clients: string[];
}

/** `LogoutOthersResponse` — how many sessions `POST /logout-others` ended. */
export interface LogoutOthersResponse {
  terminated: number;
}

/** `NotificationCountResponse` — the caller's unread badge count. */
export interface NotificationCountResponse {
  unread: number;
}

/**
 * `NotificationResponse`. `title` and `message` are backend-owned copy: render
 * them verbatim, never re-word or re-compute them.
 */
export interface NotificationResponse {
  id: string;
  type: string;
  category: string;
  status: string;
  read: boolean;
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
}

/** `NotificationReadAllResponse` — how many notifications a mark-all actually changed. */
export interface NotificationReadAllResponse {
  markedRead: number;
}

/**
 * `AuditEntryResponse` — one row of the append-only `audit_log` as the Audit
 * Center renders it.
 *
 * Two fields are **derived by the server**, not stored, and the SPA renders them
 * as given (never recomputing either):
 *  - `service` is the constant `"hr"` — this trail belongs to the HR context;
 *  - `result` is `FAILURE` when the action ends with `FAILED`, else `SUCCESS`.
 *
 * **Known gap (verified against `AuditEntryResponse.java` + `AuditLogEntry.java`,
 * 2026-08-01):** the trail records actor, action, resource, details and
 * `occurredAt` and nothing else. There is **no correlation id, role, IP,
 * browser or session id** on an audit event, so none can be displayed or
 * filtered on. The free-text `search` covers actor/action/resource/details.
 */
export interface AuditEntryResponse {
  id: string;
  /** The column is `occurred_at`; the DTO renames it `timestamp`. */
  timestamp: string;
  /** `preferred_username` of the actor — a login name, not a Keycloak subject. */
  user: string;
  /** Machine event code (`EMPLOYEE_OFFBOARDED`) — mono, rendered verbatim. */
  action: string;
  /** Machine resource reference (`employee:<uuid>`) — mono, rendered verbatim. */
  resource: string;
  service: string;
  result: string;
  details: string | null;
}

/**
 * `AuditEventDetailResponse` — one event plus the chronological timeline of
 * every event recorded against the same `resource` string.
 */
export interface AuditEventDetailResponse {
  event: AuditEntryResponse;
  timeline: AuditEntryResponse[];
}

/** `AuditStatisticsResponse.DailyCount` — a count bucketed by calendar day (UTC). */
export interface AuditDailyCount {
  /** ISO local date (`2026-07-30`), already bucketed UTC by the server. */
  date: string;
  count: number;
}

/** `AuditStatisticsResponse.LabeledCount` — a count bucketed by a label. */
export interface AuditLabeledCount {
  label: string;
  count: number;
}

/**
 * `AuditStatisticsResponse` — the bounded-window series behind the Audit Center
 * charts. Days with no events are **absent from the arrays**, not zero-filled.
 *
 * `loginAttempts` is bucketed from the admin-driven `security_event` history:
 * Keycloak's native login/logout stream (P3.6) is not ingested, so it reflects
 * the security events the platform itself records — the UI must say so rather
 * than imply it is a login audit.
 */
export interface AuditStatisticsResponse {
  from: string;
  to: string;
  actionsPerDay: AuditDailyCount[];
  failedActionsPerDay: AuditDailyCount[];
  provisioningPerDay: AuditDailyCount[];
  offboardingPerDay: AuditDailyCount[];
  loginAttempts: AuditLabeledCount[];
}

/**
 * `GET /api/hr/auth/me` — the AuthProbeController's claim echo (a LinkedHashMap,
 * not a record). Authorities are Spring `ROLE_*` strings, sorted.
 */
export interface AuthProbeResponse {
  subject: string;
  username: string | null;
  issuer: string;
  audience: string[];
  authorities: string[];
}
