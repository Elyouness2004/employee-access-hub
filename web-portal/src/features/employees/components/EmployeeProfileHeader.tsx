import { Building2, CircleDashed, IdCard, KeyRound, Mail } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  catalogueLabel,
  useDepartmentCatalogueQuery,
  usePositionCatalogueQuery,
} from '@/shared/catalogues';
import { StatusBadge } from '@/shared/components';
import { Avatar } from '@/shared/components/ui';
import { formatDate } from '@/shared/lib/format';
import type { EmployeeResponse } from '@/shared/types/hr';

import { employeeName } from '../api/employees-api';

/**
 * Who you are looking at, answered before anything else on the page.
 *
 * The six facts an HR or admin user scans for — name, matricule, position,
 * department, employment status, account status — are all here, in one block,
 * so the question "is this the right person, and can they sign in?" is answered
 * without opening a tab. Everything else stays in the tabs below.
 *
 * It never conflates the two states, and never conflates the two identifiers:
 * the matricule and `employeeId` belong to the HR record, `keycloakId` belongs
 * to the login account, and an employee may legitimately have the first without
 * the second. "No account linked" is a fact, not an error — a record exists
 * before provisioning runs, and after offboarding the link remains while the
 * account is disabled. The identifiers themselves are NOT here: they are
 * technical data and live in the Profile tab's identifiers section.
 *
 * Department and position come from the catalogues rather than the record,
 * which holds ids only — the same lookup the profile panel uses, through the
 * same shared cache, so the two cannot disagree.
 */
export interface EmployeeProfileHeaderProps {
  employee: EmployeeResponse;
  actions?: ReactNode;
}

export function EmployeeProfileHeader({ employee, actions }: EmployeeProfileHeaderProps) {
  const departments = useDepartmentCatalogueQuery();
  const positions = usePositionCatalogueQuery();

  const department = catalogueLabel(departments.data, employee.departmentId, (entry) => entry.name);
  const position = catalogueLabel(positions.data, employee.positionId, (entry) => entry.title);

  return (
    <section
      aria-labelledby="employee-summary-heading"
      className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar name={employeeName(employee)} size="lg" />
          <div className="min-w-0">
            <h2
              id="employee-summary-heading"
              className="truncate text-section-title text-ink-strong"
            >
              {employeeName(employee)}
            </h2>
            <p className="mt-0.5 truncate text-body-secondary text-ink-muted">
              {position ?? 'Position not set'}
              {department ? ` · ${department}` : ''}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={employee.status} />
              {employee.keycloakId ? (
                <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 text-caption font-medium text-ink">
                  <KeyRound aria-hidden="true" className="size-4" />
                  Account linked
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 text-caption font-medium text-ink-muted">
                  <CircleDashed aria-hidden="true" className="size-4" />
                  No account linked
                </span>
              )}
            </div>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      {/*
        The scannable strip. A definition list rather than a row of stat cards:
        these are attributes of one record, not measurements, and the design
        system rejects unjustified stat-card rows outright (§12).
      */}
      <dl className="grid gap-x-8 gap-y-3 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <HeaderFact icon={IdCard} label="Matricule">
          <span className="font-mono text-mono">{employee.matricule}</span>
        </HeaderFact>
        <HeaderFact icon={Mail} label="Work email">
          <span className="truncate">{employee.email}</span>
        </HeaderFact>
        <HeaderFact icon={Building2} label="Department">
          {department ?? (departments.isPending ? 'Loading…' : 'Not set')}
        </HeaderFact>
        <HeaderFact icon={IdCard} label="Hired">
          <span className="tabular-nums">{formatDate(employee.hireDate)}</span>
        </HeaderFact>
      </dl>
    </section>
  );
}

/**
 * One labelled fact. The icon lives INSIDE the `<dt>` rather than beside it:
 * a `<div>` in a `<dl>` may contain only `<dt>`/`<dd>` groups, so an icon
 * sitting next to that group breaks the list's semantics (axe
 * `definition-list`) — and a decorative glyph is part of the label anyway.
 */
function HeaderFact({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof IdCard;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-caption text-ink-muted">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-body-secondary text-ink-strong">{children}</dd>
    </div>
  );
}
