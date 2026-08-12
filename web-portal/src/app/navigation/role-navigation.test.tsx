import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { appRoutes } from '@/app/router/routes';
import type { Role } from '@/shared/auth';
import { renderWithRouter } from '@/shared/testing/render';

/**
 * Role-shaped navigation against the VERIFIED capability matrix
 * (FRONTEND-SPECIFICATION §2): unauthorized items are absent from the DOM —
 * hidden, never disabled. Team stays MANAGER-only (HR/ADMIN get 403 on those
 * endpoints and must not see the group).
 */

function primaryNav() {
  return screen.getByRole('navigation', { name: 'Primary' });
}

function linksIn(nav: HTMLElement): string[] {
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent?.trim() ?? '');
}

const cases: Array<{ role: Role; visible: string[]; absent: string[] }> = [
  {
    role: 'EMPLOYEE',
    visible: ['Dashboard', 'Leave', 'Expenses', 'Documents', 'Notifications'],
    absent: ['Approvals', 'My team', 'Employees', 'Audit Center', 'Document categories'],
  },
  {
    role: 'MANAGER',
    visible: ['Dashboard', 'Approvals', 'My team'],
    absent: ['Employees', 'Departments', 'Audit Center', 'Analytics', 'Document categories'],
  },
  {
    role: 'HR',
    visible: [
      'Dashboard',
      'Employees',
      'Departments',
      'Positions',
      'Leave admin',
      'Expense admin',
      'Document admin',
      'Audit Center',
      'Analytics',
    ],
    absent: ['Approvals', 'My team', 'Document categories'],
  },
  {
    role: 'ADMIN',
    visible: ['Dashboard', 'Employees', 'Audit Center', 'Analytics', 'Document categories'],
    absent: ['Approvals', 'My team'],
  },
];

describe('role-shaped navigation', () => {
  for (const { role, visible, absent } of cases) {
    it(`${role}: shows its surfaces and omits the rest`, () => {
      const { unmount } = renderWithRouter(appRoutes, { role });
      const labels = linksIn(primaryNav());

      for (const label of visible) {
        expect(labels).toContain(label);
      }
      for (const label of absent) {
        expect(labels).not.toContain(label);
      }
      unmount();
    });
  }

  it('labels only authorized group regions (and adds no headings before the h1)', () => {
    renderWithRouter(appRoutes, { role: 'MANAGER' });
    const nav = primaryNav();
    expect(within(nav).getByRole('region', { name: 'Team' })).toBeInTheDocument();
    expect(within(nav).queryByRole('region', { name: 'Workforce' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('region', { name: 'System' })).not.toBeInTheDocument();
    // Group labels are not headings — the page h1 stays first in the outline.
    expect(within(nav).queryAllByRole('heading')).toEqual([]);
  });

  it('HR shell passes the axe smoke (group regions, admin surfaces)', async () => {
    const { container } = renderWithRouter(appRoutes, { role: 'HR' });
    const { axe } = await import('vitest-axe');
    expect(await axe(container)).toHaveNoViolations();
  });
});
