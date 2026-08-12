import { useState } from 'react';

import { isApiError, messageFor } from '@/shared/api';
import { useSessionControls } from '@/shared/auth';
import {
  Alert,
  ConfirmActionDialog,
  PageContainer,
  PageHeader,
  QueryStateBoundary,
  SessionCard,
  useConfirmation,
} from '@/shared/components';
import { Button, Skeleton, VisuallyHidden } from '@/shared/components/ui';
import { describeDevice } from '@/shared/lib/format';
import type { SessionResponse } from '@/shared/types/hr';

import {
  useLogoutOthersMutation,
  useMySessionsQuery,
  useTerminateSessionMutation,
} from '../api/sessions-api';

/**
 * P11 — My sessions. Cards at every width (a session is a small record with no
 * columns worth aligning), never a table.
 *
 * Two behaviours the backend dictates:
 *
 *  - **Ending the current session needs `confirmCurrent=true`.** The first
 *    attempt gets a 409 titled `Confirmation required`; the normalizer flags it
 *    (`conflict.confirmationRequired`), and only then does the UI ask and retry.
 *    That is a deliberate two-step, not an error to swallow.
 *  - **Every device field may be null.** Browser, OS, device name and IP are
 *    locally-held attributes Keycloak's admin representation does not carry, so
 *    "Unknown device" is the honest label — inventing a user-agent string would
 *    be fabricating security evidence.
 */
export function SessionsPage() {
  const query = useMySessionsQuery();
  const terminate = useTerminateSessionMutation();
  const logoutOthers = useLogoutOthersMutation();
  const controls = useSessionControls();

  const confirmation = useConfirmation();
  const [target, setTarget] = useState<SessionResponse | null>(null);
  /** Set once the server has asked for explicit confirmation of the current one. */
  const [confirmCurrent, setConfirmCurrent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const othersConfirmation = useConfirmation();

  const sessions = query.data ?? [];
  const others = sessions.filter((session) => !session.current);

  const askTerminate = (session: SessionResponse) => {
    setTarget(session);
    setConfirmCurrent(false);
    confirmation.ask();
  };

  const doTerminate = async () => {
    if (!target) return;
    try {
      await terminate.mutateAsync({
        sessionId: target.id,
        ...(confirmCurrent ? { confirmCurrent: true } : {}),
      });
      confirmation.close();
      if (target.current) {
        // Ending your own session server-side: the tokens in this tab are now
        // worthless, so sign out locally rather than leaving a page that looks
        // signed in and 401s on every action.
        controls?.signOut();
      } else {
        setNotice('That session was ended. The device will need to sign in again.');
        setTarget(null);
      }
    } catch (error) {
      if (isApiError(error) && error.kind === 'conflict' && error.confirmationRequired) {
        // The server is asking, not failing: re-ask with the consequence named.
        setConfirmCurrent(true);
        confirmation.setError(null);
        return;
      }
      confirmation.setError(messageFor(error));
    }
  };

  const doLogoutOthers = async () => {
    try {
      const result = await logoutOthers.mutateAsync();
      othersConfirmation.close();
      setNotice(
        result.terminated === 0
          ? 'There were no other sessions to end.'
          : `${result.terminated} other session${result.terminated === 1 ? '' : 's'} ended. Those devices will need to sign in again.`,
      );
    } catch (error) {
      othersConfirmation.setError(messageFor(error));
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="My sessions"
        description="Every device currently signed in with your organization account."
        actions={
          others.length > 0 ? (
            <Button variant="secondary" onClick={othersConfirmation.ask}>
              Sign out other sessions
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4">
        {notice ? (
          <Alert tone="info" live="polite">
            {notice}
          </Alert>
        ) : null}

        <Alert tone="info" title="What this list is">
          These come straight from the identity provider. Ending a session signs that device out
          immediately; its access token still works for up to 5 minutes, which is the
          platform&rsquo;s stated bound on residual access.
        </Alert>

        {query.isPending ? (
          <div aria-busy="true" className="flex flex-col gap-3">
            <VisuallyHidden>Loading your sessions</VisuallyHidden>
            {Array.from({ length: 2 }, (_, index) => (
              <div key={index} className="rounded-lg border border-border bg-surface p-5">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-3 h-4 w-full" />
              </div>
            ))}
          </div>
        ) : query.error ? (
          <QueryStateBoundary error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          // Never empty: the request itself proves at least one session exists.
          <ul className="flex flex-col gap-3">
            {sessions.map((session) => (
              <li key={session.id}>
                <SessionCard
                  session={session}
                  actions={
                    <Button
                      size="compact"
                      variant="secondary"
                      onClick={() => askTerminate(session)}
                    >
                      {session.current ? 'End this session' : 'End session'}
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmActionDialog
        open={confirmation.open}
        onOpenChange={confirmation.onOpenChange}
        title={
          target?.current
            ? confirmCurrent
              ? 'End the session you are using?'
              : 'End this session?'
            : 'End this session?'
        }
        description={
          target
            ? target.current
              ? 'This is the session you are signed in with right now.'
              : `${describeDevice(target)} will be signed out.`
            : ''
        }
        consequences={
          // Step one asks plainly; the escalated wording appears only after the
          // SERVER has asked for explicit confirmation, so the two steps read
          // as two different questions rather than the same one twice.
          confirmCurrent
            ? [
                'You will be signed out of this tab immediately.',
                'You will need to sign in again to carry on.',
              ]
            : target?.current
              ? ['This is the session this browser tab is using.']
              : ['That device must sign in again to use the platform.']
        }
        confirmLabel={confirmCurrent ? 'End my session and sign out' : 'End session'}
        cancelLabel="Keep it"
        destructive
        busy={terminate.isPending}
        error={confirmation.error}
        onConfirm={() => void doTerminate()}
      />

      <ConfirmActionDialog
        open={othersConfirmation.open}
        onOpenChange={othersConfirmation.onOpenChange}
        title="Sign out every other session?"
        description={`${others.length} other session${others.length === 1 ? '' : 's'} will be ended.`}
        consequences={[
          'This session — the one you are using — stays signed in.',
          'Every other device must sign in again.',
        ]}
        confirmLabel="Sign out other sessions"
        cancelLabel="Keep them"
        destructive
        busy={logoutOthers.isPending}
        error={othersConfirmation.error}
        onConfirm={() => void doLogoutOthers()}
      />
    </PageContainer>
  );
}
