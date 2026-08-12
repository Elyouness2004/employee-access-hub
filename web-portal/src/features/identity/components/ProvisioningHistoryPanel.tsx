import { History } from 'lucide-react';

import { EmptyState, SimpleTable, type SimpleColumn } from '@/shared/components';
import { cn } from '@/shared/lib/cn';
import { formatDateTime } from '@/shared/lib/format';
import type { ProvisioningHistoryResponse } from '@/shared/types/hr';

import { useProvisioningHistoryQuery } from '../api/identity-api';

/**
 * The provisioning journal for one employee (P17).
 *
 * Append-only, and shown as such: there is no edit, no delete and no filter,
 * because the endpoint offers none and a trail with a delete button is not a
 * trail. It is deliberately unpaged (api-conventions §1 — "bounded by one
 * employee"), so no client-side paging is layered over it.
 *
 * `action`, `status` and `detail` are the backend's own words — the summary of
 * a failure is the exception an operator needs to read, and rewording it would
 * lose the only diagnostic there is.
 */
export interface ProvisioningHistoryPanelProps {
  employeeId: string;
  enabled?: boolean;
}

const COLUMNS: SimpleColumn<ProvisioningHistoryResponse>[] = [
  {
    header: 'When',
    cell: (row) => <span className="tabular-nums">{formatDateTime(row.occurredAt)}</span>,
    mono: true,
    priority: true,
  },
  { header: 'Action', cell: (row) => row.action, priority: true },
  {
    /**
     * The literal, not a badge. `ProvisioningRecordStatus` has nine members
     * (SYNCED, UNLOCKED, PASSWORD_RESET, ROLES_SYNCED, SESSIONS_REVOKED…) and is
     * a different enum from `ProvisioningStatus`, which the §2.4 badge map
     * covers. Badging the four that overlap and leaving the rest as raw text
     * would make one column speak two languages — and "FAILED" beside the action
     * "SYNC" is a failed synchronization, not a failed provisioning, which the
     * badge label would have claimed. The word carries the meaning; the colour
     * only reinforces it.
     */
    header: 'Outcome',
    cell: (row) => (
      <span className={cn(row.status === 'FAILED' && 'text-status-danger-text')}>{row.status}</span>
    ),
    mono: true,
    priority: true,
  },
  {
    header: 'Detail',
    cell: (row) => row.detail ?? '—',
  },
  {
    /**
     * The subject as stored. It stays a raw identifier deliberately: this column
     * answers "was an account linked when this row was written", and on a
     * failure row the answer is genuinely none. The person the whole journal
     * belongs to is named in the page header above it, so there is nobody to
     * resolve here that is not already on screen.
     */
    header: 'Account linked at the time',
    cell: (row) => row.keycloakId ?? 'None',
    mono: true,
    hideBelowLg: true,
  },
];

export function ProvisioningHistoryPanel({
  employeeId,
  enabled = true,
}: ProvisioningHistoryPanelProps) {
  const query = useProvisioningHistoryQuery(employeeId, { enabled });

  return (
    <SimpleTable
      caption="Provisioning history for this employee"
      columns={COLUMNS}
      rows={query.data}
      isLoading={query.isPending}
      error={query.error}
      onRetry={() => void query.refetch()}
      rowId={(row) => row.id}
      cardTitle={(row) => row.action}
      emptyState={
        <EmptyState
          icon={History}
          title="No provisioning events yet"
          description="Nothing has been attempted against this record’s identity. The first entry appears when it is provisioned, synchronized or offboarded."
        />
      }
    />
  );
}
