import { CalendarDays, LayoutDashboard, ScrollText, Users } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { filterNavGroups, type NavGroup } from './navigation';

const groups: NavGroup[] = [
  {
    id: 'workspace',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/leave', label: 'Leave', icon: CalendarDays },
    ],
  },
  {
    id: 'team',
    label: 'Team',
    roles: ['MANAGER'],
    items: [{ to: '/team', label: 'My team', icon: Users }],
  },
  {
    id: 'governance',
    label: 'Governance',
    roles: ['HR', 'ADMIN'],
    items: [
      { to: '/hr/audit', label: 'Audit Center', icon: ScrollText },
      { to: '/admin/only', label: 'Admin only', icon: ScrollText, roles: ['ADMIN'] },
    ],
  },
];

describe('filterNavGroups', () => {
  it('keeps unrestricted groups for every role', () => {
    const result = filterNavGroups(groups, ['EMPLOYEE']);
    expect(result.map((g) => g.id)).toEqual(['workspace']);
  });

  it('shows MANAGER-only groups to managers, not to HR/ADMIN (verified backend rule)', () => {
    expect(filterNavGroups(groups, ['MANAGER', 'EMPLOYEE']).map((g) => g.id)).toEqual([
      'workspace',
      'team',
    ]);
    expect(filterNavGroups(groups, ['HR', 'EMPLOYEE']).map((g) => g.id)).toEqual([
      'workspace',
      'governance',
    ]);
  });

  it('filters items inside an authorized group by item roles', () => {
    const hr = filterNavGroups(groups, ['HR', 'EMPLOYEE']);
    expect(hr.find((g) => g.id === 'governance')?.items.map((i) => i.label)).toEqual([
      'Audit Center',
    ]);

    const admin = filterNavGroups(groups, ['ADMIN', 'EMPLOYEE']);
    expect(admin.find((g) => g.id === 'governance')?.items.map((i) => i.label)).toEqual([
      'Audit Center',
      'Admin only',
    ]);
  });

  it('drops a group whose items all filtered away (hidden, never disabled)', () => {
    const onlyAdminItem: NavGroup[] = [
      {
        id: 'g',
        items: [{ to: '/x', label: 'X', icon: ScrollText, roles: ['ADMIN'] }],
      },
    ];
    expect(filterNavGroups(onlyAdminItem, ['EMPLOYEE'])).toEqual([]);
  });
});
