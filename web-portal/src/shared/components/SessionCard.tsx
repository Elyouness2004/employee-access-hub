import { Monitor } from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge } from '@/shared/components/ui';
import { describeDevice, formatDateTime } from '@/shared/lib/format';
import type { SessionResponse } from '@/shared/types/hr';

import { DetailList } from './DetailList';
import { StatusBadge } from './StatusBadge';

/**
 * One Keycloak session, as a card at every breakpoint (DESIGN-SYSTEM §11.3).
 *
 * Promoted to `shared/` because two features now render the same DTO: a person
 * looking at their own devices (`sessions`, P11) and an administrator looking at
 * someone else's (`identity`, P17). They may not import each other, and a second
 * copy had already started to disagree with the first about how to describe a
 * device — which is exactly the divergence the promotion rule exists to stop
 * (`docs/frontend/FRONTEND-ARCHITECTURE.md`).
 *
 * What it refuses to invent: every device attribute is nullable, because
 * Keycloak's admin representation does not carry browser, OS or device name —
 * hr-service merges in what it stored locally, and for a session it never saw
 * that is nothing. Those read "Not recorded".
 *
 * `mfaUsed` reads false throughout: MFA is not implemented in the realm
 * (backend P3.5). Stating that is more useful than hiding the field.
 */
export interface SessionCardProps {
  session: SessionResponse;
  /**
   * Trailing control. Absent on the administrative view: hr-service exposes no
   * endpoint to end one specific session for another person, so there is no
   * action to offer there — only the account-wide ones on the identity tab.
   */
  actions?: ReactNode;
}

export function SessionCard({ session, actions }: SessionCardProps) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Monitor aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink-muted" />
          <div className="min-w-0">
            <p className="text-panel-title text-ink-strong">{describeDevice(session)}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {session.current ? <StatusBadge status="CURRENT_SESSION" /> : null}
              <Badge>{session.mfaUsed ? 'Signed in with MFA' : 'No MFA on this session'}</Badge>
            </div>
          </div>
        </div>
        {actions}
      </div>

      <DetailList
        className="mt-4"
        items={[
          { label: 'Signed in', value: formatDateTime(session.loginTime), mono: true },
          { label: 'Last activity', value: formatDateTime(session.lastActivity), mono: true },
          { label: 'IP address', value: session.ipAddress ?? 'Not recorded', mono: true },
          {
            label: 'Applications used',
            value: session.clients.length > 0 ? session.clients.join(', ') : 'None recorded',
            mono: true,
          },
          { label: 'Session id', value: session.id, mono: true, wide: true },
        ]}
      />
    </div>
  );
}
