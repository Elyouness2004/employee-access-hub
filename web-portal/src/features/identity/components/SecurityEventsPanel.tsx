import { ShieldCheck } from 'lucide-react';

import { EmptyState, SimpleTable, type SimpleColumn } from '@/shared/components';
import { formatDateTime } from '@/shared/lib/format';
import { PersonReference, type PersonLookup, usePeopleLookup } from '@/shared/people';
import type { SecurityEventResponse } from '@/shared/types/hr';

import { useSecurityEventsQuery } from '../api/identity-api';

/**
 * The security-event trail for one employee (P17). Append-only and unpaged, like
 * the provisioning journal, and for the same reason.
 *
 * One property of the endpoint shapes the empty state:
 * `IdentityQueryService.securityEventsFor` looks events up **by `keycloakId`**,
 * so a record that was never provisioned can only ever have an empty trail. That
 * is a fact about the record, not an absence of activity, and the empty state
 * says which of the two it is.
 *
 * `type` is rendered verbatim. `actor` — whoever performed the action — is a
 * `preferred_username`, resolved to a person through the shared lookup, because
 * "who did this" is the question the trail exists to answer and a login answers
 * it only for the people who recognise it. `system` resolves to nothing and is
 * shown as itself: the platform really did do it, and naming a person there
 * would be a lie about accountability.
 */
export interface SecurityEventsPanelProps {
  employeeId: string;
  /** Null when the record has no linked account — the trail is keyed by it. */
  keycloakId: string | null;
  enabled?: boolean;
}

function columnsFor(people: PersonLookup): SimpleColumn<SecurityEventResponse>[] {
  return [
    {
      header: 'When',
      cell: (row) => <span className="tabular-nums">{formatDateTime(row.occurredAt)}</span>,
      mono: true,
      priority: true,
    },
    { header: 'Event', cell: (row) => row.type, mono: true, priority: true },
    {
      header: 'Performed by',
      cell: (row) =>
        row.actor ? (
          <PersonReference
            resolution={people.byUsername(row.actor)}
            fallback={row.actor}
            fullFallback
          />
        ) : (
          'Unknown'
        ),
      priority: true,
    },
    { header: 'Detail', cell: (row) => row.detail ?? '—' },
    {
      header: 'Account username',
      cell: (row) => row.username ?? '—',
      hideBelowLg: true,
    },
  ];
}

export function SecurityEventsPanel({
  employeeId,
  keycloakId,
  enabled = true,
}: SecurityEventsPanelProps) {
  const query = useSecurityEventsQuery(employeeId, { enabled });
  // The trail stores logins, not names.
  const people = usePeopleLookup({ usernames: query.data?.map((row) => row.actor) });

  return (
    <SimpleTable
      caption="Security events for this employee"
      columns={columnsFor(people)}
      rows={query.data}
      isLoading={query.isPending}
      error={query.error}
      onRetry={() => void query.refetch()}
      rowId={(row) => row.id}
      cardTitle={(row) => row.type}
      emptyState={
        <EmptyState
          icon={ShieldCheck}
          title="No security events recorded"
          description={
            keycloakId
              ? 'Nothing has been done to this account: no password reset, lock, unlock, role synchronization or session revocation.'
              : 'This trail is keyed to a login account, and this record has none yet. Provision one and its security events start appearing here.'
          }
        />
      }
    />
  );
}
