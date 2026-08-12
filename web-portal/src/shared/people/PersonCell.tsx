import { EmployeeCell } from '@/shared/components/EmployeeCell';
import { shortId } from '@/shared/lib/format';

import type { PersonResolution } from './people-api';

/**
 * A person in a TABLE row, resolved from a stored identifier.
 *
 * It delegates to `EmployeeCell` rather than restyling a person for each queue:
 * the approvals inbox, the escalation queue and the HR directory all show the
 * same thing — avatar, name, matricule — and having them drift is how the same
 * person ends up looking like two different rows on two screens.
 *
 * The unresolved readings deliberately do NOT borrow `EmployeeCell`: an avatar
 * built from a UUID would render two meaningless initials and read as a person
 * whose name we simply failed to print.
 */
export interface PersonCellProps {
  resolution: PersonResolution;
  /** The stored identifier, shown when nothing better is known. */
  fallback?: string | null;
  /** Link the name — the HR employee route, when the caller may navigate there. */
  to?: (employeeId: string) => string;
  absentLabel?: string;
}

export function PersonCell({ resolution, fallback, to, absentLabel = '—' }: PersonCellProps) {
  if (resolution.state === 'resolved' && resolution.person) {
    const person = resolution.person;
    return (
      <EmployeeCell
        name={person.displayName}
        matricule={person.matricule}
        email={person.email}
        {...(to ? { to: to(person.employeeId) } : {})}
      />
    );
  }

  if (resolution.state === 'absent') {
    return <span className="text-ink-muted">{absentLabel}</span>;
  }

  if (resolution.state === 'loading') {
    return <span className="text-ink-muted">Loading…</span>;
  }

  const identifier = fallback ?? '';

  if (resolution.state === 'unavailable') {
    return (
      <span className="flex min-w-0 flex-col" title={identifier}>
        <span className="text-body-secondary text-ink-muted">Name unavailable</span>
        {identifier ? (
          <span className="truncate font-mono text-mono-sm text-ink-muted">
            {shortId(identifier)}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span className="flex min-w-0 flex-col" title={identifier}>
      <span className="truncate font-mono text-mono-sm text-ink">
        {identifier ? shortId(identifier) : '—'}
      </span>
      <span className="text-caption text-ink-muted">No employee record</span>
    </span>
  );
}
