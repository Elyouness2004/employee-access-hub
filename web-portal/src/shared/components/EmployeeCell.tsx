import { Link } from 'react-router-dom';

import { Avatar } from '@/shared/components/ui';

/**
 * A person in a table row: name plus their matricule in mono.
 *
 * The matricule is there because names collide and a matricule does not — it is
 * the value someone pastes into a search box or a ticket, which is exactly why
 * it renders as machine data (DESIGN-SYSTEM §3).
 */
export interface EmployeeCellProps {
  name: string;
  matricule?: string | null;
  email?: string | null;
  /**
   * Makes the NAME the link, rather than wrapping the whole cell from outside.
   * A caller that wraps this component and reaches back in with a descendant
   * selector to underline the name couples itself to markup it does not own —
   * reorder the elements here and the affordance silently disappears.
   */
  to?: string;
}

export function EmployeeCell({ name, matricule, email, to }: EmployeeCellProps) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar name={name} size="sm" />
      <div className="min-w-0">
        {to ? (
          <Link
            to={to}
            className="block truncate text-body-secondary text-link underline underline-offset-2 hover:text-ink-muted"
          >
            {name}
          </Link>
        ) : (
          <p className="truncate text-body-secondary text-ink-strong">{name}</p>
        )}
        {matricule ? (
          <p className="truncate font-mono text-mono-sm text-ink-muted">{matricule}</p>
        ) : email ? (
          <p className="truncate text-caption text-ink-muted">{email}</p>
        ) : null}
      </div>
    </div>
  );
}
