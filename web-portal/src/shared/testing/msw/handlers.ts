import { http, HttpResponse, type HttpHandler } from 'msw';

import { env } from '@/config/env';
import type { EmployeeResponse } from '@/shared/types/hr';

import {
  analyticsDashboardFixture,
  approvedLeaveFixture,
  auditDetailFixture,
  auditEntryFixture,
  auditStatisticsFixture,
  authMeFixture,
  departmentFixtures,
  documentCategoryFixtures,
  documentFixture,
  employeeFixture,
  escalatedExpenseFixture,
  escalatedLeaveFixture,
  failedAuditEntryFixture,
  employeeProfileFixture,
  expenseFixture,
  leaveBalanceFixture,
  leaveRequestFixture,
  managerEmployeeFixture,
  metadataOnlyDocumentFixture,
  notificationCountFixture,
  offboardingSuccessFixture,
  pageOf,
  peopleFixtures,
  positionFixtures,
  provisioningHistoryFixture,
  provisioningStatusFixture,
  readNotificationFixture,
  secondApprovalExpenseFixture,
  securityEventsFixture,
  sensitiveDocumentFixture,
  sessionsFixture,
  teamMemberFixture,
  terminatedEmployeeFixture,
  thresholdFixture,
  unprovisionedEmployeeFixture,
  unreadNotificationFixture,
} from './fixtures';

/**
 * Default happy-path handlers for every endpoint Phase 3 consumes.
 *
 * They speak the REAL contracts: paged envelopes with the correct clamps and
 * defaults, the same nullability the Java records allow, and an echoed
 * `X-Correlation-Id` on every response so client plumbing can be asserted
 * end to end. Tests override individual routes with `server.use(...)` to
 * exercise empty, error, forbidden and conflict states.
 *
 * `onUnhandledRequest: 'error'` is on (see setup.ts), so anything a page
 * requests must appear here — which keeps this file an honest inventory of the
 * app's real API surface.
 */

const base = env.apiBaseUrl;

/** Every service echoes the correlation id it was given. */
function ok(body: unknown, request: Request) {
  return HttpResponse.json(body as never, {
    headers: { 'X-Correlation-Id': request.headers.get('X-Correlation-Id') ?? 'corr-generated' },
  });
}

/**
 * `201 Created` with a `Location` header — what the HR controllers actually
 * answer to a POST (`ResponseEntity.created(...)`). Nothing in the SPA reads
 * the status today, but a fixture that speaks 200 would let a future consumer
 * be written against a contract the backend does not have.
 */
function created<T extends { id: string }>(body: T | undefined, request: Request) {
  return HttpResponse.json(body as never, {
    status: 201,
    headers: {
      'X-Correlation-Id': request.headers.get('X-Correlation-Id') ?? 'corr-generated',
      Location: `${new URL(request.url).pathname}/${body?.id ?? 'unknown'}`,
    },
  });
}

/**
 * `text/csv` with the `Content-Disposition` the audit export really sends —
 * `AuditController.exportCsv` hardcodes `audit-export.csv`, and that name is the
 * one the SPA must save under.
 */
function csv(body: string, request: Request) {
  return new HttpResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv;charset=UTF-8',
      'Content-Disposition': 'attachment; filename="audit-export.csv"',
      'X-Correlation-Id': request.headers.get('X-Correlation-Id') ?? 'corr-generated',
    },
  });
}

/** The header `AuditCsvWriter` writes, plus one row, CRLF-terminated as it is. */
const AUDIT_CSV =
  'id,timestamp,user,action,resource,service,result,details\r\n' +
  'aaaaaaaa-1111-0000-0000-000000000001,2026-07-31T09:41:22Z,msw.hr,EMPLOYEE_OFFBOARDED,' +
  'employee:11111111-1111-1111-1111-111111111111,hr,SUCCESS,"identityDisabled=true; sessionsRevoked=2"\r\n';

const NOW = '2026-07-31T10:00:00Z';

export const hrHandlers: HttpHandler[] = [
  http.get(`${base}/api/hr/auth/me`, ({ request }) =>
    ok(authMeFixture('EMPLOYEE', env.oidcAuthority), request),
  ),
  http.get(`${base}/api/hr/me/team`, ({ request }) => ok(pageOf([teamMemberFixture]), request)),
  // Registered after /me/team so the more specific path wins.
  http.get(`${base}/api/hr/me`, ({ request }) => ok(employeeProfileFixture, request)),
  http.get(`${base}/api/hr/notifications/count`, ({ request }) =>
    ok(notificationCountFixture, request),
  ),
  http.get(`${base}/api/hr/sessions`, ({ request }) => ok(sessionsFixture, request)),
  http.delete(`${base}/api/hr/sessions/:id`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${base}/api/hr/sessions/logout-others`, ({ request }) =>
    ok({ terminated: 1 }, request),
  ),
];

/**
 * HR workforce administration (Phase 4). Routes are registered most-specific
 * first, because MSW matches in order: `/employees/:id/provisioning` must win
 * over `/employees/:id`.
 */
export const hrAdminHandlers: HttpHandler[] = [
  /**
   * The people resolver. It answers only for the references it is ASKED for and
   * omits the ones it does not know — the two behaviours every consuming
   * surface depends on, so the handler implements them rather than returning
   * the whole fixture list and letting a test pass on a name nobody requested.
   *
   * Usernames match either convention (`msw.hr` and `msw.hr@example.com`),
   * exactly as `EmployeeRepository.findAllByUsername` does.
   */
  http.get(`${base}/api/hr/people`, ({ request }) => {
    const params = new URL(request.url).searchParams;
    const keycloakIds = new Set(params.getAll('keycloakId'));
    const employeeIds = new Set(params.getAll('employeeId'));
    const usernames = new Set(params.getAll('username').map((value) => value.toLowerCase()));

    const matched = peopleFixtures.filter(
      (person) =>
        (person.keycloakId !== null && keycloakIds.has(person.keycloakId)) ||
        employeeIds.has(person.employeeId) ||
        (person.username !== null && usernames.has(person.username.toLowerCase())) ||
        usernames.has(person.email.toLowerCase()),
    );
    return ok(matched, request);
  }),

  http.get(`${base}/api/hr/departments`, ({ request }) => ok(pageOf(departmentFixtures), request)),
  http.post(`${base}/api/hr/departments`, ({ request }) => created(departmentFixtures[0], request)),
  http.put(`${base}/api/hr/departments/:id`, ({ request }) => ok(departmentFixtures[0], request)),
  http.delete(`${base}/api/hr/departments/:id`, () => new HttpResponse(null, { status: 204 })),

  http.get(`${base}/api/hr/positions`, ({ request }) => ok(pageOf(positionFixtures), request)),
  http.post(`${base}/api/hr/positions`, ({ request }) => created(positionFixtures[0], request)),
  http.put(`${base}/api/hr/positions/:id`, ({ request }) => ok(positionFixtures[0], request)),
  http.delete(`${base}/api/hr/positions/:id`, () => new HttpResponse(null, { status: 204 })),

  // The identity surface. `GET .../identity` is the live read; every action but
  // offboard answers with the same shape, and offboard with the fan-out result.
  // The read is registered BEFORE the `:action` POST catch-all only for
  // readability — they differ by method, so order does not decide the match.
  http.get(`${base}/api/hr/admin/employees/:id/identity`, ({ params, request }) => {
    const employee = [
      employeeFixture,
      unprovisionedEmployeeFixture,
      managerEmployeeFixture,
      terminatedEmployeeFixture,
    ].find((candidate) => candidate.id === params.id);
    if (!employee) return ok(provisioningStatusFixture, request);
    // An unlinked record is a different state, not a missing field: the panel
    // has to render "no account exists" distinctly, so the fixture must too.
    return ok(
      {
        ...provisioningStatusFixture,
        employeeId: employee.id,
        keycloakId: employee.keycloakId,
        linked: employee.keycloakId !== null,
        employeeStatus: employee.status,
        // A terminated employee keeps a DISABLED account on record — the exact
        // employment/account disagreement the panel has to render.
        provisioningStatus: !employee.keycloakId
          ? 'NOT_PROVISIONED'
          : employee.status === 'ACTIVE'
            ? 'PROVISIONED'
            : 'DISABLED',
        provisionedAt: employee.keycloakId ? provisioningStatusFixture.provisionedAt : null,
      },
      request,
    );
  }),
  http.post(`${base}/api/hr/admin/employees/:id/offboard`, ({ request }) =>
    ok(offboardingSuccessFixture, request),
  ),
  http.post(`${base}/api/hr/admin/employees/:id/:action`, ({ params, request }) =>
    ok(
      {
        ...provisioningStatusFixture,
        // Only the actions that ask Keycloak to e-mail the employee report
        // delivery; the rest leave it null, as the server does.
        activationEmailSent: ['provision', 'reprovision', 'reset-password', 'require-mfa'].includes(
          String(params.action),
        )
          ? true
          : null,
      },
      request,
    ),
  ),
  http.get(`${base}/api/hr/admin/employees/:id/provisioning`, ({ request }) =>
    ok(provisioningHistoryFixture, request),
  ),
  http.get(`${base}/api/hr/admin/employees/:id/security-events`, ({ request }) =>
    ok(securityEventsFixture, request),
  ),
  http.get(`${base}/api/hr/admin/employees/:id/sessions`, ({ request }) =>
    ok(sessionsFixture, request),
  ),

  http.get(`${base}/api/hr/employees/:id`, ({ params, request }) => {
    const byId = [employeeFixture, unprovisionedEmployeeFixture, managerEmployeeFixture].find(
      (candidate) => candidate.id === params.id,
    );
    return ok(byId ?? employeeFixture, request);
  }),
  http.get(`${base}/api/hr/employees`, ({ request }) =>
    ok(pageOf([employeeFixture, unprovisionedEmployeeFixture]), request),
  ),
  http.post(`${base}/api/hr/employees`, ({ request }) =>
    // A create answers before the AFTER_COMMIT provisioning listener runs, so
    // `keycloakId` is null even for an ACTIVE record.
    created<EmployeeResponse>({ ...employeeFixture, keycloakId: null }, request),
  ),
  http.put(`${base}/api/hr/employees/:id`, ({ request }) => ok(employeeFixture, request)),
  http.delete(`${base}/api/hr/employees/:id`, () => new HttpResponse(null, { status: 204 })),
];

export const leaveHandlers: HttpHandler[] = [
  http.get(`${base}/api/leave/balances/my`, ({ request }) => ok(leaveBalanceFixture, request)),
  // P20 — HR reads and adjusts an allocation by EMPLOYEE id (never a subject).
  http.get(`${base}/api/leave/balances/:employeeId`, ({ request }) =>
    ok(leaveBalanceFixture, request),
  ),
  http.put(`${base}/api/leave/balances/:employeeId`, async ({ request }) => {
    const body = (await request.json()) as { totalDays: number };
    return ok(
      {
        ...leaveBalanceFixture,
        totalDays: body.totalDays,
        availableDays: body.totalDays - leaveBalanceFixture.usedDays,
      },
      request,
    );
  }),
  http.get(`${base}/api/leave/requests/my`, ({ request }) =>
    ok(pageOf([leaveRequestFixture, approvedLeaveFixture]), request),
  ),
  http.get(`${base}/api/leave/requests/inbox`, ({ request }) =>
    ok(pageOf([leaveRequestFixture]), request),
  ),
  // P20. Registered before `:id`, which would otherwise match "escalated".
  http.get(`${base}/api/leave/requests/escalated`, ({ request }) =>
    ok(pageOf([escalatedLeaveFixture]), request),
  ),
  http.get(`${base}/api/leave/requests/:id`, ({ request }) => ok(leaveRequestFixture, request)),
  http.post(`${base}/api/leave/requests`, ({ request }) => ok(leaveRequestFixture, request)),
  http.post(`${base}/api/leave/requests/:id/cancel`, ({ request }) =>
    ok({ ...leaveRequestFixture, status: 'CANCELLED' }, request),
  ),
  http.post(`${base}/api/leave/requests/:id/approve`, ({ request }) =>
    ok(approvedLeaveFixture, request),
  ),
  http.post(`${base}/api/leave/requests/:id/reject`, ({ request }) =>
    ok({ ...leaveRequestFixture, status: 'REJECTED' }, request),
  ),
];

export const expenseHandlers: HttpHandler[] = [
  http.get(`${base}/api/expenses/my`, ({ request }) =>
    ok(pageOf([expenseFixture, secondApprovalExpenseFixture]), request),
  ),
  http.get(`${base}/api/expenses/pending`, ({ request }) => ok(pageOf([expenseFixture]), request)),
  // P21. All four are registered before `:id`, which would otherwise swallow
  // "escalated", "second-approval", "search" and "threshold" as claim ids.
  http.get(`${base}/api/expenses/escalated`, ({ request }) =>
    ok(pageOf([escalatedExpenseFixture]), request),
  ),
  http.get(`${base}/api/expenses/second-approval`, ({ request }) =>
    ok(pageOf([secondApprovalExpenseFixture]), request),
  ),
  http.get(`${base}/api/expenses/search`, ({ request }) =>
    ok(pageOf([expenseFixture, secondApprovalExpenseFixture, escalatedExpenseFixture]), request),
  ),
  http.get(`${base}/api/expenses/threshold`, ({ request }) => ok(thresholdFixture, request)),
  http.put(`${base}/api/expenses/threshold`, async ({ request }) => {
    const body = (await request.json()) as { amount: number; currency?: string };
    return ok(
      {
        ...thresholdFixture,
        amount: body.amount,
        currency: body.currency ?? thresholdFixture.currency,
        updatedBy: 'msw.hr',
        updatedAt: '2026-08-01T10:00:00Z',
      },
      request,
    );
  }),
  http.get(`${base}/api/expenses/:id`, ({ request }) => ok(expenseFixture, request)),
  http.post(`${base}/api/expenses`, ({ request }) => ok(expenseFixture, request)),
  http.post(`${base}/api/expenses/:id/cancel`, ({ request }) =>
    ok({ ...expenseFixture, status: 'CANCELLED' }, request),
  ),
  http.post(`${base}/api/expenses/:id/approve`, ({ request }) =>
    ok({ ...expenseFixture, status: 'APPROVED' }, request),
  ),
  http.post(`${base}/api/expenses/:id/reject`, ({ request }) =>
    ok({ ...expenseFixture, status: 'REJECTED' }, request),
  ),
];

/**
 * Notification Center (Phase 5). The history endpoint takes **page and size
 * only** — `NotificationController.sanitize` drops any sort, and the controller
 * accepts no search or category parameter. Handlers that honoured one would
 * certify a filter the backend does not have.
 */
export const notificationHandlers: HttpHandler[] = [
  http.get(`${base}/api/hr/notifications/unread`, ({ request }) =>
    ok([unreadNotificationFixture], request),
  ),
  http.patch(`${base}/api/hr/notifications/read-all`, ({ request }) =>
    ok({ markedRead: 1 }, request),
  ),
  http.patch(`${base}/api/hr/notifications/:id/read`, ({ request }) =>
    ok({ ...unreadNotificationFixture, read: true, status: 'READ', readAt: NOW }, request),
  ),
  http.get(`${base}/api/hr/notifications`, ({ request }) =>
    ok(pageOf([unreadNotificationFixture, readNotificationFixture], { size: 20 }), request),
  ),
];

/** Audit Center (Phase 5) — most specific path first, as MSW matches in order. */
export const auditHandlers: HttpHandler[] = [
  http.get(`${base}/api/hr/audit/statistics`, ({ request }) => ok(auditStatisticsFixture, request)),
  http.get(`${base}/api/hr/audit/export`, ({ request }) => csv(AUDIT_CSV, request)),
  http.get(`${base}/api/hr/audit/:id`, ({ request }) => ok(auditDetailFixture, request)),
  http.get(`${base}/api/hr/audit`, ({ request }) =>
    ok(pageOf([auditEntryFixture, failedAuditEntryFixture]), request),
  ),
];

/**
 * Documents (Phase 5). `/content` streams bytes with the `Content-Disposition`
 * the SPA reads its filename from — the header the gateway exposes through CORS
 * precisely so a browser client can name the file it saves.
 */
export const documentHandlers: HttpHandler[] = [
  http.get(`${base}/api/documents/categories`, ({ request }) =>
    ok(pageOf(documentCategoryFixtures), request),
  ),
  http.post(`${base}/api/documents/categories`, ({ request }) =>
    created(documentCategoryFixtures[0], request),
  ),
  http.put(`${base}/api/documents/categories/:id`, ({ request }) =>
    ok(documentCategoryFixtures[0], request),
  ),
  http.delete(
    `${base}/api/documents/categories/:id`,
    () => new HttpResponse(null, { status: 204 }),
  ),

  http.get(
    `${base}/api/documents/:id/content`,
    () =>
      new HttpResponse(new Blob(['%PDF-1.4 msw']), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="employee-handbook-2026.pdf"',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
        },
      }),
  ),
  http.get(`${base}/api/documents/:id`, ({ params, request }) => {
    const byId = [documentFixture, sensitiveDocumentFixture, metadataOnlyDocumentFixture].find(
      (candidate) => candidate.id === params.id,
    );
    return ok(byId ?? documentFixture, request);
  }),
  http.get(`${base}/api/documents`, ({ request }) =>
    ok(pageOf([documentFixture, sensitiveDocumentFixture, metadataOnlyDocumentFixture]), request),
  ),
  http.post(`${base}/api/documents`, ({ request }) => created(documentFixture, request)),
  http.put(`${base}/api/documents/:id/metadata`, ({ request }) => ok(documentFixture, request)),
  http.delete(`${base}/api/documents/:id`, () => new HttpResponse(null, { status: 204 })),
];

/** Analytics (Phase 5) — aggregates, deliberately unpaged. */
export const analyticsHandlers: HttpHandler[] = [
  http.get(`${base}/api/analytics/dashboard`, ({ request }) =>
    ok(analyticsDashboardFixture, request),
  ),
];

export const defaultHandlers: HttpHandler[] = [
  ...hrHandlers,
  ...hrAdminHandlers,
  ...notificationHandlers,
  ...auditHandlers,
  ...leaveHandlers,
  ...expenseHandlers,
  ...documentHandlers,
  ...analyticsHandlers,
];
