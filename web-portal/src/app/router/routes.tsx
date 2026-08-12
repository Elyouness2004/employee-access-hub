import type { RouteObject } from 'react-router-dom';

import { CallbackPage, LoginPage } from '@/features/auth';
import { DashboardPage } from '@/features/dashboard';
import { RouteGuard } from '@/shared/auth';

import { AppShell } from '../layouts/AppShell';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { AuthGate } from './AuthGate';
import { RouteErrorBoundary } from './RouteErrorBoundary';

/**
 * Route tree mirroring the approved sitemap (FRONTEND-SPECIFICATION §4).
 *
 * Public routes: /login and /auth/callback (P01). Everything else sits behind
 * the authentication gate; role-scoped branches are additionally wrapped in
 * RouteGuard with the roles transcribed from the capability matrix (nav-config
 * is the single source for both navigation and guards). Guards are UX — the
 * server authorizes every request.
 *
 * Every approved route now resolves to a real page — the phase placeholders are
 * gone, and no route outside the approved sitemap exists.
 *
 * **Route-level code splitting** (FRONTEND-ARCHITECTURE §4): every business
 * page is reached through React Router's `lazy`, so a chunk is fetched when its
 * route is first entered rather than at boot. The auth surface and the shell
 * stay eager — they are needed before any route resolves — and so do `/403` and
 * `/404`, which must render instantly when something has already gone wrong.
 * This is also what will keep the Recharts bundle attached to the analytics and
 * audit routes when they land in Phase 5.
 *
 * Exported as data for tests (createMemoryRouter); router.tsx builds the
 * browser router.
 */

/** `lazy` entry for a page exported by name from its feature's public surface. */
function lazyPage<T extends string>(load: () => Promise<Record<T, React.ComponentType>>, name: T) {
  return async () => ({ Component: (await load())[name] });
}

/** Self-service pages: every authenticated role reaches them. */
const selfServiceRoutes: RouteObject[] = [
  {
    path: 'leave',
    lazy: lazyPage(() => import('@/features/leave'), 'MyLeavePage'),
    handle: { crumb: 'My leave' },
  },
  {
    path: 'leave/balance',
    lazy: lazyPage(() => import('@/features/leave'), 'LeaveBalancePage'),
    handle: { crumb: 'My balance' },
  },
  {
    path: 'leave/:id',
    lazy: lazyPage(() => import('@/features/leave'), 'LeaveDetailPage'),
    handle: { crumb: 'Leave request' },
  },
  {
    path: 'expenses',
    lazy: lazyPage(() => import('@/features/expenses'), 'MyExpensesPage'),
    handle: { crumb: 'My expenses' },
  },
  {
    path: 'expenses/:id',
    lazy: lazyPage(() => import('@/features/expenses'), 'ExpenseDetailPage'),
    handle: { crumb: 'Expense claim' },
  },
  {
    path: 'account/profile',
    lazy: lazyPage(() => import('@/features/profile'), 'ProfilePage'),
    handle: { crumb: 'Profile' },
  },
  {
    path: 'account/sessions',
    lazy: lazyPage(() => import('@/features/sessions'), 'SessionsPage'),
    handle: { crumb: 'My sessions' },
  },
  {
    path: 'documents',
    lazy: lazyPage(() => import('@/features/documents'), 'DocumentsPage'),
    handle: { crumb: 'Documents' },
  },
  {
    path: 'notifications',
    lazy: lazyPage(() => import('@/features/notifications'), 'NotificationsPage'),
    handle: { crumb: 'Notifications' },
  },
];

/**
 * MANAGER-only branch. `/approvals` and `/team` are annotated `hasRole('MANAGER')`
 * server-side — an HR or Admin user without that role receives 403 — so the
 * guard names MANAGER alone, exactly as the sidebar does.
 */
const managerRoutes: RouteObject = {
  element: <RouteGuard anyOf={['MANAGER']} />,
  children: [
    {
      path: 'approvals',
      lazy: lazyPage(() => import('../pages/ApprovalsPage'), 'ApprovalsPage'),
      handle: { crumb: 'Approvals' },
    },
    {
      path: 'team',
      lazy: lazyPage(() => import('@/features/team'), 'TeamPage'),
      handle: { crumb: 'My team' },
    },
  ],
};

/**
 * HR + ADMIN workforce branch (Phase 4). Every one of these endpoints is
 * annotated `hasAnyRole('HR', 'ADMIN')` server-side, so the guard names exactly
 * those two — the same values the sidebar filters on.
 *
 * `hr/employees/:id` has no placeholder to replace: it is a detail route, never
 * a navigation item, and it lives in `app/pages` because it composes the
 * `employees` and `identity` features.
 */
const workforceRoutes: RouteObject = {
  element: <RouteGuard anyOf={['HR', 'ADMIN']} />,
  children: [
    {
      path: 'hr/employees',
      lazy: lazyPage(() => import('@/features/employees'), 'EmployeeDirectoryPage'),
      handle: { crumb: 'Employee directory' },
    },
    {
      path: 'hr/employees/:id',
      lazy: lazyPage(() => import('../pages/EmployeeDetailPage'), 'EmployeeDetailPage'),
      handle: { crumb: 'Employee' },
    },
    {
      path: 'hr/departments',
      lazy: lazyPage(() => import('@/features/organization'), 'DepartmentsPage'),
      handle: { crumb: 'Departments' },
    },
    {
      path: 'hr/positions',
      lazy: lazyPage(() => import('@/features/organization'), 'PositionsPage'),
      handle: { crumb: 'Positions' },
    },
    {
      path: 'hr/leave',
      // Composes `features/leave` with the `features/employees` picker, so the
      // page lives in app/ like the other cross-feature compositions.
      lazy: lazyPage(() => import('../pages/LeaveAdminPage'), 'LeaveAdminPage'),
      handle: { crumb: 'Leave admin' },
    },
    {
      path: 'hr/expenses',
      lazy: lazyPage(() => import('@/features/expenses'), 'ExpenseAdminPage'),
      handle: { crumb: 'Expense admin' },
    },
    {
      path: 'hr/documents',
      lazy: lazyPage(() => import('@/features/documents'), 'DocumentAdminPage'),
      handle: { crumb: 'Document admin' },
    },
    {
      path: 'hr/audit',
      lazy: lazyPage(() => import('@/features/audit'), 'AuditCenterPage'),
      handle: { crumb: 'Audit Center' },
    },
    {
      path: 'analytics',
      lazy: lazyPage(() => import('@/features/analytics'), 'AnalyticsPage'),
      handle: { crumb: 'Analytics' },
    },
  ],
};

/**
 * The single ADMIN-only branch. Document category *reads* are HR+ADMIN, but
 * every write on `DocumentCategoryController` is `hasRole('ADMIN')` — and this
 * page exists to write. Guarding it to ADMIN matches both the sidebar and the
 * server; an HR user reaching it would get a screen whose every action 403s.
 */
const systemRoutes: RouteObject = {
  element: <RouteGuard anyOf={['ADMIN']} />,
  children: [
    {
      path: 'admin/document-categories',
      lazy: lazyPage(() => import('@/features/documents'), 'DocumentCategoriesPage'),
      handle: { crumb: 'Document categories' },
    },
  ],
};

export const appRoutes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/auth/callback', element: <CallbackPage /> },
  {
    element: <AuthGate />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        handle: { crumb: 'Dashboard' },
        children: [
          {
            // Pathless boundary: a failing page keeps the shell (and nav) alive.
            errorElement: <RouteErrorBoundary />,
            children: [
              // The dashboard stays EAGER: it is the landing route, so lazy
              // here would only trade a synchronous render for a round trip
              // nobody benefits from — the chunk is needed immediately anyway.
              { index: true, element: <DashboardPage /> },
              ...selfServiceRoutes,
              managerRoutes,
              workforceRoutes,
              systemRoutes,
              { path: '403', element: <ForbiddenPage />, handle: { crumb: 'Access denied' } },
              { path: '*', element: <NotFoundPage />, handle: { crumb: 'Not found' } },
            ],
          },
        ],
      },
    ],
  },
];
