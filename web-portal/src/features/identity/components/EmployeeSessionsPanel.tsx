import { MonitorSmartphone } from 'lucide-react';

import { Alert, EmptyState, QueryStateBoundary, SessionCard } from '@/shared/components';
import { Skeleton, VisuallyHidden } from '@/shared/components/ui';

import { useEmployeeSessionsQuery } from '../api/identity-api';

/**
 * The employee's live SSO sessions, as an administrator sees them (P17).
 *
 * Read-only on purpose. `AdminProvisioningController` exposes this list with a
 * GET and nothing else — its own summary says force logout goes through
 * revoke-sessions, disable or offboard. So there is no per-session terminate
 * button here: the endpoint does not exist, and a row action that silently
 * killed *every* session would not be the action its label promised.
 *
 * The card itself is `shared/components/SessionCard` — the same one a person
 * sees on their own devices page (P11). Two features rendering one DTO two
 * different ways is how "Firefox on Ubuntu" becomes "Workstation" depending on
 * who is looking; the promotion rule exists for exactly this, and the terminate
 * control is simply absent here because the endpoint for it is.
 */
export interface EmployeeSessionsPanelProps {
  employeeId: string;
  keycloakId: string | null;
  enabled?: boolean;
}

export function EmployeeSessionsPanel({
  employeeId,
  keycloakId,
  enabled = true,
}: EmployeeSessionsPanelProps) {
  const query = useEmployeeSessionsQuery(employeeId, { enabled });

  if (!keycloakId) {
    return (
      <EmptyState
        icon={MonitorSmartphone}
        title="No login account, so no sessions"
        description="Sessions belong to a Keycloak account. This record has none linked yet — provision one from the Identity tab."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="info" live={false} title="Read-only">
        hr-service offers no endpoint to end one specific session for another person. To cut this
        employee’s access, use Revoke sessions, Deactivate or Offboard on the Identity tab — each
        ends every session at once.
      </Alert>

      {query.error ? (
        <QueryStateBoundary error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <VisuallyHidden>Loading this employee’s sessions</VisuallyHidden>
          {Array.from({ length: 2 }, (_, index) => (
            <Skeleton key={index} className="h-40 w-full" />
          ))}
        </div>
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={MonitorSmartphone}
          title="No active sessions"
          description="This account is not signed in anywhere right now. Sessions also disappear here once they are revoked or expire."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {query.data.map((session) => (
            <li key={session.id}>
              {/*
                No per-session action: `AdminProvisioningController` exposes this
                list with a GET and nothing else — its own summary says force
                logout goes through revoke-sessions, disable or offboard. A row
                button that killed EVERY session would not be the action its
                label promised.
              */}
              <SessionCard session={session} />
            </li>
          ))}
        </ul>
      )}

      <p className="text-helper text-ink-muted">
        Multi-factor authentication is not enabled in this realm, so no session reports it. That is
        the platform’s current state, not missing data.
      </p>
    </div>
  );
}
