import { cn } from '@/shared/lib/cn';
import { shortId } from '@/shared/lib/format';

import { SYSTEM_ACTOR } from './people-api';
import type { PersonResolution } from './people-api';

/**
 * A person referred to by an identifier the record stores — rendered as a
 * person.
 *
 * The rule this component exists to enforce (DESIGN-SYSTEM §12, "technical
 * identifiers never dominate"): a business user reads a name first; the UUID
 * behind it stays reachable, in mono, as the secondary fact — never as the
 * headline. It is the person-shaped sibling of `CatalogueReference`, and it
 * keeps the same four readings apart, because a failed lookup rendered as
 * "unknown person" is a claim about the data that nobody checked.
 *
 * When the reference cannot be resolved the identifier IS shown — an audit trail
 * that swallowed the id of a deleted record would be unusable, and `system` is a
 * real actor with no employee record. What never happens is the reverse: a raw
 * UUID standing in for a person the platform could have named.
 */
export interface PersonReferenceProps {
  resolution: PersonResolution;
  /** The stored identifier, shown when nothing better is known. */
  fallback?: string | null;
  /** What to say when there is no reference at all. */
  absentLabel?: string;
  /** Add the work e-mail under the name — for detail views with room. */
  showEmail?: boolean;
  /** Add the matricule under the name — for HR surfaces where it is the handle. */
  showMatricule?: boolean;
  /** Render the full identifier rather than its first segment. */
  fullFallback?: boolean;
  className?: string;
}

export function PersonReference({
  resolution,
  fallback,
  absentLabel = '—',
  showEmail = false,
  showMatricule = false,
  fullFallback = false,
  className,
}: PersonReferenceProps) {
  if (resolution.state === 'absent') {
    return <span className={cn('text-ink-muted', className)}>{absentLabel}</span>;
  }

  if (resolution.state === 'resolved' && resolution.person) {
    const { displayName, email, matricule } = resolution.person;
    const secondary = showEmail ? email : showMatricule ? matricule : null;
    return (
      <span className={cn('inline-flex min-w-0 flex-col', className)}>
        <span className="truncate text-ink-strong">{displayName}</span>
        {secondary ? (
          <span
            className={cn(
              'truncate text-ink-muted',
              showMatricule ? 'font-mono text-mono-sm' : 'text-caption',
            )}
          >
            {secondary}
          </span>
        ) : null}
      </span>
    );
  }

  const identifier = fallback ?? '';

  // `Actor.system()` — the platform acting on its own (auto-onboarding, the
  // lifecycle listener). It has no employee record by design, so resolving it
  // fails; rendering that as "not a current employee" would read as a data
  // problem instead of the accountability fact it is.
  if (identifier.toLowerCase() === SYSTEM_ACTOR) {
    return (
      <span className={cn('inline-flex min-w-0 flex-col', className)}>
        <span className="text-ink-strong">System</span>
        <span className="text-caption text-ink-muted">Automated platform action</span>
      </span>
    );
  }

  const shown = fullFallback || identifier.length <= 8 ? identifier : shortId(identifier);

  if (resolution.state === 'loading') {
    return (
      <span className={cn('text-ink-muted', className)} title={identifier}>
        Loading…
      </span>
    );
  }

  if (resolution.state === 'unavailable') {
    // The lookup failed — nothing is known about this person either way, which
    // is not the same as "no such person". The identifier stays visible so the
    // row is still traceable.
    return (
      <span className={cn('inline-flex min-w-0 flex-col', className)} title={identifier}>
        <span className="text-ink-muted">Name unavailable</span>
        {identifier ? (
          <span className="truncate font-mono text-mono-sm text-ink-muted">{shown}</span>
        ) : null}
      </span>
    );
  }

  // Unknown: resolved successfully and this reference is not a person on record
  // — a deleted employee, a service account, `system`.
  return (
    <span className={cn('inline-flex min-w-0 flex-col', className)} title={identifier}>
      <span className="truncate font-mono text-mono-sm text-ink">{shown || '—'}</span>
      <span className="text-caption text-ink-muted">Not a current employee record</span>
    </span>
  );
}
