import {
  Bell,
  BookUser,
  Briefcase,
  Building2,
  CalendarCog,
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  FileText,
  FolderCog,
  FolderTree,
  LayoutDashboard,
  Receipt,
  ScrollText,
  ShieldX,
  Users,
  Wallet,
} from 'lucide-react';

import type { NavGroup } from '@/shared/lib/navigation';

/**
 * THE navigation source of truth — one typed configuration feeds the desktop
 * sidebar and the mobile drawer (FRONTEND-SPECIFICATION §3, sitemap §4).
 *
 * Role metadata is transcribed from the verified capability matrix:
 *  - Team is MANAGER-only (inbox/pending/team are annotated hasRole('MANAGER');
 *    HR/ADMIN receive 403 there and must NOT see the group).
 *  - Workforce and Governance are HR + ADMIN.
 *  - System (document categories) is the single ADMIN-only surface.
 * Composites are pre-expanded by Keycloak, so flat role checks suffice.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'workspace',
    label: 'My workspace',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/leave', label: 'Leave', icon: CalendarDays },
      { to: '/expenses', label: 'Expenses', icon: Receipt },
      { to: '/documents', label: 'Documents', icon: FileText },
      { to: '/notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    id: 'team',
    label: 'Team',
    roles: ['MANAGER'],
    items: [
      { to: '/approvals', label: 'Approvals', icon: ClipboardCheck },
      { to: '/team', label: 'My team', icon: Users },
    ],
  },
  {
    id: 'workforce',
    label: 'Workforce',
    roles: ['HR', 'ADMIN'],
    items: [
      { to: '/hr/employees', label: 'Employees', icon: BookUser },
      { to: '/hr/departments', label: 'Departments', icon: Building2 },
      { to: '/hr/positions', label: 'Positions', icon: Briefcase },
      { to: '/hr/leave', label: 'Leave admin', icon: CalendarCog },
      { to: '/hr/expenses', label: 'Expense admin', icon: Wallet },
      { to: '/hr/documents', label: 'Document admin', icon: FolderCog },
    ],
  },
  {
    id: 'governance',
    label: 'Governance',
    roles: ['HR', 'ADMIN'],
    items: [
      { to: '/hr/audit', label: 'Audit Center', icon: ScrollText },
      { to: '/analytics', label: 'Analytics', icon: ChartColumn },
    ],
  },
  {
    id: 'system',
    label: 'System',
    roles: ['ADMIN'],
    items: [{ to: '/admin/document-categories', label: 'Document categories', icon: FolderTree }],
  },
];

/** Icon for the /403 page. */
export const FORBIDDEN_ICON = ShieldX;
