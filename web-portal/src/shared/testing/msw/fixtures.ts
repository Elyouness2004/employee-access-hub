import type { PageResponse } from '@/shared/api';
import type { Role } from '@/shared/auth';
import type { AnalyticsDashboardResponse } from '@/shared/types/analytics';
import type { DocumentCategoryResponse, DocumentResponse } from '@/shared/types/documents';
import type { ExpenseResponse, ThresholdResponse } from '@/shared/types/expenses';
import type {
  AuditEntryResponse,
  AuditEventDetailResponse,
  AuditStatisticsResponse,
  DepartmentResponse,
  EmployeeProfileResponse,
  EmployeeResponse,
  NotificationResponse,
  OffboardingResponse,
  PersonResponse,
  PositionResponse,
  ProvisioningHistoryResponse,
  ProvisioningStatusResponse,
  SecurityEventResponse,
  SessionResponse,
} from '@/shared/types/hr';
import type { LeaveBalanceResponse, LeaveRequestResponse } from '@/shared/types/leave';

/**
 * Fixtures derived from REAL backend response shapes — never invented.
 *
 * Every field below exists on the corresponding Java record, with the same name
 * and the same nullability. Where the backend can legitimately return null (an
 * employee with no manager, a session Keycloak has no user-agent detail for) at
 * least one fixture does, so the UI is exercised against the data the platform
 * actually produces rather than a convenient subset.
 *
 * Sources:
 *   AuthProbeController.me()                    → { subject, username, issuer, audience, authorities }
 *   EmployeeProfileResponse, SessionResponse    → hr-service/api/dto
 *   LeaveRequestResponse, LeaveBalanceResponse  → leave-service/api/dto
 *   ExpenseResponse                             → expense-service/api/dto
 */

export interface AuthMeResponse {
  subject: string;
  username: string;
  issuer: string;
  audience: string[];
  authorities: string[];
}

export interface NotificationCountResponse {
  unread: number;
}

/** Roles as Keycloak expands them into a token (composites include EMPLOYEE). */
export const EXPANDED_ROLES: Record<Role, Role[]> = {
  EMPLOYEE: ['EMPLOYEE'],
  MANAGER: ['MANAGER', 'EMPLOYEE'],
  HR: ['HR', 'EMPLOYEE'],
  ADMIN: ['ADMIN', 'EMPLOYEE'],
};

export function authMeFixture(role: Role, issuer: string): AuthMeResponse {
  return {
    subject: `msw-subject-${role.toLowerCase()}`,
    username: `msw.${role.toLowerCase()}`,
    issuer,
    audience: ['hub-api'],
    authorities: EXPANDED_ROLES[role].map((r) => `ROLE_${r}`).sort(),
  };
}

export const notificationCountFixture: NotificationCountResponse = { unread: 3 };

/** The paged envelope every collection endpoint answers with (api-conventions §1). */
export function pageOf<T>(content: T[], overrides: Partial<PageResponse<T>> = {}): PageResponse<T> {
  const size = overrides.size ?? 20;
  const totalElements = overrides.totalElements ?? content.length;
  const page = overrides.page ?? 0;
  const totalPages = Math.max(Math.ceil(totalElements / size), 1);
  return {
    content,
    page,
    size,
    totalElements,
    totalPages,
    first: page === 0,
    last: page >= totalPages - 1,
    ...overrides,
  };
}

// ── HR ─────────────────────────────────────────────────────────────────────

export const employeeProfileFixture: EmployeeProfileResponse = {
  id: '11111111-1111-1111-1111-111111111111',
  keycloakId: '22222222-2222-2222-2222-222222222222',
  matricule: 'EMP-0042',
  firstName: 'Amina',
  lastName: 'Berrada',
  email: 'amina.berrada@example.com',
  hireDate: '2023-04-03',
  status: 'ACTIVE',
  provisioningStatus: 'PROVISIONED',
  departmentId: '33333333-3333-3333-3333-333333333333',
  departmentName: 'Engineering',
  positionId: '44444444-4444-4444-4444-444444444444',
  positionTitle: 'Senior Engineer',
  managerId: '55555555-5555-5555-5555-555555555555',
  managerKeycloakId: '66666666-6666-6666-6666-666666666666',
  managerName: 'Youssef Alami',
  managerEmail: 'youssef.alami@example.com',
  createdAt: '2023-04-03T08:00:00Z',
  updatedAt: '2026-01-12T10:30:00Z',
};

/** A report with no manager and unresolved catalogue entries — all legal nulls. */
export const teamMemberFixture: EmployeeProfileResponse = {
  ...employeeProfileFixture,
  id: '77777777-7777-7777-7777-777777777777',
  keycloakId: '88888888-8888-8888-8888-888888888888',
  matricule: 'EMP-0107',
  firstName: 'Hana',
  lastName: 'Mansouri',
  email: 'hana.mansouri@example.com',
  departmentId: null,
  departmentName: null,
  positionId: null,
  positionTitle: null,
  managerId: null,
  managerKeycloakId: null,
  managerName: null,
  managerEmail: null,
};

export const sessionsFixture: SessionResponse[] = [
  {
    id: 'session-current',
    current: true,
    browser: 'Firefox',
    operatingSystem: 'Ubuntu',
    deviceName: 'Workstation',
    ipAddress: '10.2.14.7',
    loginTime: '2026-07-31T07:12:00Z',
    lastActivity: '2026-07-31T09:41:00Z',
    // MFA is not implemented in the realm (backend P3.5): false is the truth.
    mfaUsed: false,
    expiresAt: '2026-07-31T15:12:00Z',
    clients: ['web-portal'],
  },
  {
    // Everything Keycloak's admin representation does not carry is null.
    id: 'session-other',
    current: false,
    browser: null,
    operatingSystem: null,
    deviceName: null,
    ipAddress: '10.2.14.99',
    loginTime: '2026-07-30T18:03:00Z',
    lastActivity: '2026-07-30T18:44:00Z',
    mfaUsed: false,
    expiresAt: null,
    clients: [],
  },
];

// ── HR workforce administration (Phase 4) ──────────────────────────────────

/**
 * `EmployeeResponse` — the HR directory row. Note what is NOT here:
 * `provisioningStatus`, `provisionedAt` and `lastSyncAt` are absent from the
 * Java record, so they are absent from the fixture. A fixture that carried them
 * would let a test certify a column the backend cannot fill.
 */
export const employeeFixture: EmployeeResponse = {
  id: '11111111-1111-1111-1111-111111111111',
  keycloakId: '22222222-2222-2222-2222-222222222222',
  matricule: 'EMP-0042',
  firstName: 'Amina',
  lastName: 'Berrada',
  email: 'amina.berrada@example.com',
  hireDate: '2023-04-03',
  status: 'ACTIVE',
  managerId: '55555555-5555-5555-5555-555555555555',
  departmentId: '33333333-3333-3333-3333-333333333333',
  positionId: '44444444-4444-4444-4444-444444444444',
  createdAt: '2023-04-03T08:00:00Z',
  updatedAt: '2026-01-12T10:30:00Z',
};

/**
 * A record identity onboarding has never reached: no account, no manager, and a
 * different department and position from the first fixture so a catalogue join
 * cannot pass by resolving one label for every row.
 */
export const unprovisionedEmployeeFixture: EmployeeResponse = {
  ...employeeFixture,
  id: '77777777-7777-7777-7777-777777777777',
  keycloakId: null,
  matricule: 'EMP-0107',
  firstName: 'Hana',
  lastName: 'Mansouri',
  email: 'hana.mansouri@example.com',
  managerId: null,
  departmentId: '33333333-3333-3333-3333-333333333334',
  positionId: '44444444-4444-4444-4444-444444444445',
};

/** The manager `employeeFixture.managerId` points at — a real record, not itself. */
export const managerEmployeeFixture: EmployeeResponse = {
  ...employeeFixture,
  id: '55555555-5555-5555-5555-555555555555',
  keycloakId: '66666666-6666-6666-6666-666666666666',
  matricule: 'EMP-0001',
  firstName: 'Youssef',
  lastName: 'Alami',
  email: 'youssef.alami@example.com',
  managerId: null,
};

/** Offboarded: TERMINATED, but the account link survives the termination. */
export const terminatedEmployeeFixture: EmployeeResponse = {
  ...employeeFixture,
  id: '99999999-0000-0000-0000-000000000009',
  keycloakId: '99999999-0000-0000-0000-00000000000a',
  matricule: 'EMP-0009',
  firstName: 'Omar',
  lastName: 'Idrissi',
  email: 'omar.idrissi@example.com',
  status: 'TERMINATED',
};

export const departmentFixtures: DepartmentResponse[] = [
  {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Engineering',
    description: 'Platform and product engineering.',
    createdAt: '2022-01-04T09:00:00Z',
    updatedAt: '2025-11-02T14:12:00Z',
  },
  {
    // `description` is optional on `DepartmentRequest` — null is legal.
    id: '33333333-3333-3333-3333-333333333334',
    name: 'People Operations',
    description: null,
    createdAt: '2022-01-04T09:05:00Z',
    updatedAt: '2022-01-04T09:05:00Z',
  },
];

export const positionFixtures: PositionResponse[] = [
  {
    id: '44444444-4444-4444-4444-444444444444',
    title: 'Senior Engineer',
    description: 'Individual contributor, senior band.',
    createdAt: '2022-01-04T09:10:00Z',
    updatedAt: '2025-06-18T11:40:00Z',
  },
  {
    id: '44444444-4444-4444-4444-444444444445',
    title: 'HR Business Partner',
    description: null,
    createdAt: '2022-01-04T09:12:00Z',
    updatedAt: '2022-01-04T09:12:00Z',
  },
];

/**
 * The shape `GET .../identity` and every identity action answer with.
 * `activationEmailSent` is null on a plain read: it describes an action that
 * sent mail, not a property of the employee.
 */
export const provisioningStatusFixture: ProvisioningStatusResponse = {
  employeeId: employeeFixture.id,
  keycloakId: employeeFixture.keycloakId,
  linked: employeeFixture.keycloakId !== null,
  employeeStatus: 'ACTIVE',
  provisioningStatus: 'PROVISIONED',
  realmRole: 'EMPLOYEE',
  provisionedAt: '2023-04-03T08:05:00Z',
  lastSyncAt: '2026-01-12T10:30:12Z',
  activationEmailSent: null,
};

/**
 * The journal, oldest first, exactly as `IdentityQueryService.historyFor`
 * returns it. `status` values are `ProvisioningRecordStatus`, a different enum
 * from `ProvisioningStatus` — SYNCED and ROLES_SYNCED exist only here.
 */
export const provisioningHistoryFixture: ProvisioningHistoryResponse[] = [
  {
    id: 'aaaa1111-0000-0000-0000-000000000001',
    employeeId: employeeFixture.id,
    keycloakId: employeeFixture.keycloakId,
    action: 'ONBOARD',
    status: 'PROVISIONED',
    detail: 'role=EMPLOYEE',
    occurredAt: '2023-04-03T08:05:00Z',
  },
  {
    id: 'aaaa1111-0000-0000-0000-000000000002',
    employeeId: employeeFixture.id,
    keycloakId: employeeFixture.keycloakId,
    action: 'SYNC',
    status: 'SYNCED',
    detail: 'status=ACTIVE enabled=true',
    occurredAt: '2026-01-12T10:30:12Z',
  },
];

/** A record sitting on a failed provisioning attempt: no account was linked. */
export const failedProvisioningHistoryFixture: ProvisioningHistoryResponse[] = [
  {
    id: 'aaaa2222-0000-0000-0000-000000000001',
    employeeId: unprovisionedEmployeeFixture.id,
    keycloakId: null,
    action: 'ONBOARD',
    status: 'FAILED',
    detail: 'IdentityProvisioningException: user with that email already exists in the realm',
    occurredAt: '2026-07-30T09:14:00Z',
  },
];

export const securityEventsFixture: SecurityEventResponse[] = [
  {
    id: 'bbbb1111-0000-0000-0000-000000000001',
    keycloakId: employeeFixture.keycloakId,
    username: employeeFixture.email,
    type: 'PASSWORD_RESET',
    actor: 'hr.admin',
    detail: 'temporary password issued, change forced',
    occurredAt: '2026-05-04T13:22:00Z',
  },
  {
    // `actor` is `system` for the automatic lifecycle listener.
    id: 'bbbb1111-0000-0000-0000-000000000002',
    keycloakId: employeeFixture.keycloakId,
    username: employeeFixture.email,
    type: 'ROLE_SYNC',
    actor: 'system',
    detail: 'role=MANAGER',
    occurredAt: '2026-06-11T08:03:00Z',
  },
];

/** Everything reached: the complete offboarding. */
export const offboardingSuccessFixture: OffboardingResponse = {
  employeeId: employeeFixture.id,
  keycloakId: employeeFixture.keycloakId,
  identityDisabled: true,
  notified: ['leave-service', 'expense-service', 'documents-service'],
  failed: [],
};

/** Partial success: the account is gone, one downstream service is not closed out. */
export const offboardingPartialFixture: OffboardingResponse = {
  ...offboardingSuccessFixture,
  notified: ['leave-service', 'documents-service'],
  failed: ['expense-service'],
};

// ── Leave ──────────────────────────────────────────────────────────────────

export const leaveBalanceFixture: LeaveBalanceResponse = {
  id: '99999999-9999-9999-9999-999999999999',
  employeeId: employeeProfileFixture.id,
  employeeKeycloakId: employeeProfileFixture.keycloakId ?? '',
  year: 2026,
  totalDays: 25,
  usedDays: 12,
  availableDays: 13,
};

export const leaveRequestFixture: LeaveRequestResponse = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  employeeId: employeeProfileFixture.id,
  employeeKeycloakId: employeeProfileFixture.keycloakId ?? '',
  managerKeycloakId: employeeProfileFixture.managerKeycloakId,
  hrEscalated: false,
  type: 'ANNUAL',
  startDate: '2026-08-10',
  endDate: '2026-08-14',
  businessDays: 5,
  reason: 'Family holiday',
  status: 'SUBMITTED',
  decidedBy: null,
  decidedAt: null,
  decisionComment: null,
  createdAt: '2026-07-20T09:00:00Z',
  updatedAt: '2026-07-20T09:00:00Z',
};

export const approvedLeaveFixture: LeaveRequestResponse = {
  ...leaveRequestFixture,
  id: 'aaaaaaaa-0000-0000-0000-000000000002',
  startDate: '2026-05-04',
  endDate: '2026-05-05',
  businessDays: 2,
  status: 'APPROVED',
  decidedBy: employeeProfileFixture.managerKeycloakId,
  decidedAt: '2026-04-21T11:04:00Z',
  decisionComment: 'Enjoy.',
};

/** Escalated to HR: nobody local could decide it (BR-02). */
export const escalatedLeaveFixture: LeaveRequestResponse = {
  ...leaveRequestFixture,
  id: 'aaaaaaaa-0000-0000-0000-000000000003',
  managerKeycloakId: null,
  hrEscalated: true,
  reason: null,
};

// ── Expenses ───────────────────────────────────────────────────────────────

export const expenseFixture: ExpenseResponse = {
  id: 'bbbbbbbb-0000-0000-0000-000000000001',
  employeeId: employeeProfileFixture.id,
  employeeKeycloakId: employeeProfileFixture.keycloakId ?? '',
  managerKeycloakId: employeeProfileFixture.managerKeycloakId,
  hrEscalated: false,
  category: 'TRAVEL',
  amount: 249.9,
  currency: 'MAD',
  expenseDate: '2026-07-02',
  description: 'Return train, Casablanca',
  status: 'SUBMITTED',
  secondApprovalRequired: false,
  firstApproverKeycloakId: null,
  firstApprovedAt: null,
  decidedBy: null,
  decidedAt: null,
  decisionComment: null,
  createdAt: '2026-07-03T08:15:00Z',
  updatedAt: '2026-07-03T08:15:00Z',
};

/** Escalated to HR: the claimant has no manager who could decide it (BR-02). */
export const escalatedExpenseFixture: ExpenseResponse = {
  ...expenseFixture,
  id: 'bbbbbbbb-0000-0000-0000-000000000003',
  managerKeycloakId: null,
  hrEscalated: true,
  category: 'SUPPLIES',
  amount: 89.5,
  expenseDate: '2026-06-18',
  description: 'Desk lamp',
};

/**
 * The BR-03 threshold with its provenance. `updatedBy` is a USERNAME — the Java
 * record stores `Actor.username()`, not a subject.
 */
export const thresholdFixture: ThresholdResponse = {
  amount: 3000,
  currency: 'MAD',
  updatedBy: 'msw.hr',
  updatedAt: '2026-06-01T09:30:00Z',
};

/**
 * Approved once, above the threshold, waiting for HR (BR-03). This is the state
 * the UI must never render as "Approved".
 */
export const secondApprovalExpenseFixture: ExpenseResponse = {
  ...expenseFixture,
  id: 'bbbbbbbb-0000-0000-0000-000000000002',
  amount: 4800,
  category: 'TRAINING',
  description: 'Certification course',
  status: 'PENDING_SECOND_APPROVAL',
  secondApprovalRequired: true,
  firstApproverKeycloakId: employeeProfileFixture.managerKeycloakId,
  firstApprovedAt: '2026-07-10T14:02:00Z',
};

// ── Documents (Phase 5) ────────────────────────────────────────────────────

/**
 * A company-wide document with stored bytes. `ownerKeycloakId: null` is what
 * makes it company-wide — the field is a Keycloak subject, never an employeeId.
 */
export const documentFixture: DocumentResponse = {
  id: 'dddddddd-0000-0000-0000-000000000001',
  title: 'Employee handbook 2026',
  description: 'Company policies, leave rules and the code of conduct.',
  categoryId: 'cccccccc-0000-0000-0000-000000000001',
  categoryName: 'Company policies',
  sensitive: false,
  ownerKeycloakId: null,
  contentType: 'application/pdf',
  sizeBytes: 482_133,
  uploadedBy: 'msw.hr',
  createdAt: '2026-01-15T09:00:00Z',
  updatedAt: '2026-01-15T09:00:00Z',
};

/**
 * A personal document in a sensitive category (its `minRole` is HR/ADMIN), owned
 * by one subject. Both facts change what the UI may show, so they are exercised
 * together.
 */
export const sensitiveDocumentFixture: DocumentResponse = {
  ...documentFixture,
  id: 'dddddddd-0000-0000-0000-000000000002',
  title: 'Contract — Amina Berrada',
  description: null,
  categoryId: 'cccccccc-0000-0000-0000-000000000002',
  categoryName: 'HR records',
  sensitive: true,
  ownerKeycloakId: '22222222-2222-2222-2222-222222222222',
  contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  sizeBytes: 41_204,
  createdAt: '2026-02-02T11:20:00Z',
  updatedAt: '2026-03-04T16:45:00Z',
};

/**
 * A metadata-only record: registered for a blob written outside this service,
 * so `/content` answers 404 and neither size nor type was ever recorded. The
 * UI must call this "metadata only" rather than an error.
 */
export const metadataOnlyDocumentFixture: DocumentResponse = {
  ...documentFixture,
  id: 'dddddddd-0000-0000-0000-000000000003',
  title: 'Archived payroll export (2019)',
  description: 'Held in the legacy archive; this record is the pointer only.',
  contentType: null,
  sizeBytes: null,
  createdAt: '2019-12-31T23:00:00Z',
  updatedAt: '2019-12-31T23:00:00Z',
};

export const documentCategoryFixtures: DocumentCategoryResponse[] = [
  {
    id: 'cccccccc-0000-0000-0000-000000000001',
    name: 'Company policies',
    description: 'Readable by everyone in the company.',
    minRole: 'EMPLOYEE',
    sensitive: false,
    createdAt: '2025-11-02T10:00:00Z',
    updatedAt: '2025-11-02T10:00:00Z',
  },
  {
    id: 'cccccccc-0000-0000-0000-000000000002',
    name: 'HR records',
    description: 'Contracts and personnel files.',
    // minRole HR is exactly what makes the category (and its documents) sensitive.
    minRole: 'HR',
    sensitive: true,
    createdAt: '2025-11-02T10:05:00Z',
    updatedAt: '2026-01-08T09:15:00Z',
  },
];

// ── Notifications (Phase 5) ────────────────────────────────────────────────

/**
 * Copy comes from `NotificationType` — the backend owns `title` and `message`
 * and the SPA renders them verbatim. These are the enum's own sentences.
 */
export const unreadNotificationFixture: NotificationResponse = {
  id: 'ffffffff-0000-0000-0000-000000000001',
  type: 'ACCOUNT_UNLOCKED',
  category: 'SECURITY',
  status: 'UNREAD',
  read: false,
  title: 'Account unlocked',
  message: 'Your account has been unlocked.',
  createdAt: '2026-07-31T08:12:00Z',
  readAt: null,
};

export const readNotificationFixture: NotificationResponse = {
  id: 'ffffffff-0000-0000-0000-000000000002',
  type: 'EMPLOYEE_PROVISIONED',
  category: 'LIFECYCLE',
  status: 'READ',
  read: true,
  title: 'Account provisioned',
  message: 'Your employee account has been created and is ready to use.',
  createdAt: '2026-07-28T14:03:00Z',
  readAt: '2026-07-28T14:40:00Z',
};

// ── Audit (Phase 5) ────────────────────────────────────────────────────────

/**
 * `service` and `result` are DERIVED server-side (the constant "hr", and the
 * `_FAILED` suffix convention). They are present because the DTO carries them —
 * the SPA never recomputes either.
 */
/**
 * The people directory the resolver answers with — one entry per identity the
 * other fixtures reference, derived from those fixtures rather than invented, so
 * a page that renders a name is asserting the same person the row points at.
 *
 * `msw.hr` is the audit/document actor: its login is the e-mail's local part,
 * which is exactly the second username convention the endpoint has to cover.
 */
export const peopleFixtures: PersonResponse[] = [
  {
    employeeId: employeeFixture.id,
    keycloakId: employeeFixture.keycloakId,
    matricule: employeeFixture.matricule,
    firstName: employeeFixture.firstName,
    lastName: employeeFixture.lastName,
    displayName: `${employeeFixture.firstName} ${employeeFixture.lastName}`,
    username: 'amina.berrada',
    email: employeeFixture.email,
    status: employeeFixture.status,
  },
  {
    employeeId: managerEmployeeFixture.id,
    keycloakId: managerEmployeeFixture.keycloakId,
    matricule: managerEmployeeFixture.matricule,
    firstName: managerEmployeeFixture.firstName,
    lastName: managerEmployeeFixture.lastName,
    displayName: 'Youssef Alami',
    username: 'youssef.alami',
    email: managerEmployeeFixture.email,
    status: managerEmployeeFixture.status,
  },
  {
    employeeId: unprovisionedEmployeeFixture.id,
    // The team fixture gives this same HR record a linked account; the queues
    // reference it by that subject.
    keycloakId: '88888888-8888-8888-8888-888888888888',
    matricule: unprovisionedEmployeeFixture.matricule,
    firstName: unprovisionedEmployeeFixture.firstName,
    lastName: unprovisionedEmployeeFixture.lastName,
    displayName: 'Hana Mansouri',
    username: 'hana.mansouri',
    email: unprovisionedEmployeeFixture.email,
    status: unprovisionedEmployeeFixture.status,
  },
  {
    employeeId: 'eeeeeeee-0000-0000-0000-000000000001',
    keycloakId: 'eeeeeeee-0000-0000-0000-000000000002',
    matricule: 'EMP-0002',
    firstName: 'Ilham',
    lastName: 'Aboulkacem',
    displayName: 'Ilham Aboulkacem',
    username: 'msw.hr',
    email: 'msw.hr@example.com',
    status: 'ACTIVE',
  },
];

export const auditEntryFixture: AuditEntryResponse = {
  id: 'aaaaaaaa-1111-0000-0000-000000000001',
  timestamp: '2026-07-31T09:41:22Z',
  user: 'msw.hr',
  action: 'EMPLOYEE_OFFBOARDED',
  resource: 'employee:11111111-1111-1111-1111-111111111111',
  service: 'hr',
  result: 'SUCCESS',
  details: 'identityDisabled=true; sessionsRevoked=2',
};

export const failedAuditEntryFixture: AuditEntryResponse = {
  id: 'aaaaaaaa-1111-0000-0000-000000000002',
  timestamp: '2026-07-31T09:39:02Z',
  user: 'msw.hr',
  action: 'EMPLOYEE_PROVISIONING_FAILED',
  resource: 'employee:77777777-7777-7777-7777-777777777777',
  service: 'hr',
  // Derived FAILURE: the action ends with FAILED.
  result: 'FAILURE',
  details: 'Keycloak rejected the operation: user already exists',
};

export const auditDetailFixture: AuditEventDetailResponse = {
  event: auditEntryFixture,
  timeline: [
    {
      ...auditEntryFixture,
      id: 'aaaaaaaa-1111-0000-0000-000000000003',
      timestamp: '2026-05-02T07:15:00Z',
      action: 'EMPLOYEE_CREATED',
      details: 'matricule=EMP-0042',
    },
    auditEntryFixture,
  ],
};

/**
 * Days with no events are ABSENT from these arrays — the server buckets only
 * what it found, and the UI must not zero-fill the gaps.
 */
export const auditStatisticsFixture: AuditStatisticsResponse = {
  from: '2026-07-01T00:00:00Z',
  to: '2026-07-31T00:00:00Z',
  actionsPerDay: [
    { date: '2026-07-28', count: 14 },
    { date: '2026-07-29', count: 9 },
    { date: '2026-07-31', count: 22 },
  ],
  failedActionsPerDay: [{ date: '2026-07-31', count: 2 }],
  provisioningPerDay: [{ date: '2026-07-29', count: 3 }],
  offboardingPerDay: [{ date: '2026-07-31', count: 1 }],
  loginAttempts: [
    { label: 'ACCOUNT_LOCKED', count: 2 },
    { label: 'PASSWORD_RESET', count: 5 },
  ],
};

// ── Analytics (Phase 5) ────────────────────────────────────────────────────

export const analyticsDashboardFixture: AnalyticsDashboardResponse = {
  employees: {
    available: true,
    totalEmployees: 137,
    activeEmployees: 128,
    disabledEmployees: 9,
    departments: 8,
    positions: 21,
  },
  leave: {
    available: true,
    submitted: 12,
    approved: 240,
    rejected: 18,
    cancelled: 6,
    total: 276,
  },
  expenses: {
    available: true,
    submitted: 7,
    pendingSecondApproval: 3,
    approved: 191,
    rejected: 12,
    cancelled: 4,
    total: 217,
    approvedAmount: 184_320.5,
    currency: 'MAD',
  },
  documents: {
    available: true,
    totalDocuments: 412,
    sensitiveDocuments: 96,
    totalCategories: 6,
    downloadsLogged: 1_884,
  },
  generatedAt: '2026-07-31T09:45:00Z',
};

/**
 * What an unreachable source really looks like on the wire: `available: false`
 * with every count filled by `LeaveSummary.unavailable()` — i.e. ZERO. These
 * zeros are padding, and any UI that prints them is reporting a fact the
 * platform never measured.
 */
export const analyticsDegradedFixture: AnalyticsDashboardResponse = {
  ...analyticsDashboardFixture,
  leave: {
    available: false,
    submitted: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
    total: 0,
  },
  expenses: {
    available: false,
    submitted: 0,
    pendingSecondApproval: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
    total: 0,
    approvedAmount: 0,
    currency: null,
  },
};
