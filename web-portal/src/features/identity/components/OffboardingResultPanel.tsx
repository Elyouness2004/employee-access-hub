import { CircleCheck, CircleSlash, TriangleAlert } from 'lucide-react';

import { Button } from '@/shared/components/ui';
import { cn } from '@/shared/lib/cn';
import type { OffboardingResponse } from '@/shared/types/hr';

/**
 * What actually happened when an employee was offboarded (P17).
 *
 * `OffboardingService` commits the record as TERMINATED whether or not the
 * downstream fan-out succeeds — every notification is best-effort, and the
 * outcome comes back as two lists the backend owns. So there are three readings,
 * and the panel keeps them apart rather than collapsing them into "done":
 *
 *  - **complete** — the account was disabled and every service was notified;
 *  - **partial** — the account was disabled but a service did not answer. The
 *    person's access is gone; a downstream record is not closed out. Retrying
 *    re-runs the whole fan-out, which is the only mechanism the backend offers.
 *  - **identity not disabled** — no account was linked, or Keycloak refused. The
 *    first is normal for an unprovisioned record; the second is not, and both
 *    read the same from here, so the panel says which by looking at whether an
 *    account id came back.
 *
 * `notified` and `failed` are rendered verbatim: they are service names the
 * backend chose, and rewording them would break the match with the logs.
 *
 * The whole panel is a polite live region because the user did not watch this
 * happen — it is a multi-part outcome that arrives after a dialog closes
 * (FRONTEND-SPECIFICATION §8).
 */
export interface OffboardingResultPanelProps {
  outcome: OffboardingResponse;
  employeeName: string;
  onRetry: () => void;
  onDismiss: () => void;
}

const TONE_STYLES = {
  success: {
    container: 'border-status-success-border bg-status-success-bg',
    heading: 'text-status-success-text',
    icon: 'text-status-success-text',
  },
  warning: {
    container: 'border-status-warning-border bg-status-warning-bg',
    heading: 'text-status-warning-text',
    icon: 'text-status-warning-text',
  },
  danger: {
    container: 'border-status-danger-border bg-status-danger-bg',
    heading: 'text-status-danger-text',
    icon: 'text-status-danger-text',
  },
} as const;

export function OffboardingResultPanel({
  outcome,
  employeeName,
  onRetry,
  onDismiss,
}: OffboardingResultPanelProps) {
  /**
   * `identityDisabled: false` on a record that HAS an account means Keycloak
   * refused or was unreachable — `OffboardingService` catches that, writes a
   * FAILED journal row, and then still runs the fan-out, which can come back
   * with an empty `failed` list. Judging the outcome on `failed` alone would
   * therefore report the platform's central security guarantee — access revoked,
   * residual access bounded by the token lifetime — as delivered when it was
   * not, and would hide the Retry that the row note tells the operator to use.
   *
   * That case is worse than a missed downstream notification, so it gets its own
   * heading and the danger tone: the person may still be able to sign in.
   */
  const accessNotRevoked = outcome.keycloakId !== null && !outcome.identityDisabled;
  const fanoutIncomplete = outcome.failed.length > 0;
  const partial = accessNotRevoked || fanoutIncomplete;
  const tone = accessNotRevoked ? 'danger' : fanoutIncomplete ? 'warning' : 'success';
  const styles = TONE_STYLES[tone];

  const heading = accessNotRevoked
    ? `${employeeName} is Terminated, but their access may not be revoked`
    : fanoutIncomplete
      ? `${employeeName} was offboarded, with failures`
      : `${employeeName} was offboarded`;

  return (
    <section
      aria-live="polite"
      aria-labelledby="offboarding-result-heading"
      className={cn('rounded-lg border p-5', styles.container)}
    >
      <div className="flex items-start gap-3">
        {partial ? (
          <TriangleAlert aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', styles.icon)} />
        ) : (
          <CircleCheck aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', styles.icon)} />
        )}
        <div className="min-w-0 flex-1">
          <h2 id="offboarding-result-heading" className={cn('text-panel-title', styles.heading)}>
            {heading}
          </h2>
          <p className="mt-1 text-body text-ink">
            {accessNotRevoked
              ? 'The employment record is Terminated, but Keycloak did not confirm that the account was disabled. Treat this person as still having access until a retry succeeds.'
              : 'The employment record is Terminated. Below is what each part of the fan-out reported.'}
          </p>

          <ul className="mt-4 flex flex-col gap-2">
            <ResultRow
              ok={outcome.identityDisabled}
              label="Login account disabled and sessions revoked"
              failureNote={
                outcome.keycloakId
                  ? 'Keycloak did not confirm the change — the account may still be enabled. Retry, then check the provisioning history.'
                  : 'No account was ever linked to this record, so there was nothing to disable. This is expected for an employee who was never provisioned.'
              }
            />
            {outcome.notified.map((service) => (
              <ResultRow key={service} ok label={`${service} notified`} />
            ))}
            {outcome.failed.map((service) => (
              <ResultRow
                key={service}
                ok={false}
                label={`${service} was not notified`}
                failureNote="Its records for this person are not closed out. Retry the offboarding, or reconcile that service directly."
              />
            ))}
            {outcome.notified.length === 0 && outcome.failed.length === 0 ? (
              <li className="text-body-secondary text-ink-muted">
                {outcome.keycloakId
                  ? 'No downstream service was reported as contacted.'
                  : 'No downstream service was contacted. With no linked account there is nothing to fan out to.'}
              </li>
            ) : null}
          </ul>

          {outcome.keycloakId ? (
            /* Labelled for what it is and kept subordinate: the heading above
               already names the person this happened to. */
            <p className="mt-4 text-caption text-ink-muted">
              Keycloak account: <span className="font-mono text-mono-sm">{outcome.keycloakId}</span>
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {partial ? (
              <Button size="compact" variant="secondary" onClick={onRetry}>
                Retry offboarding
              </Button>
            ) : null}
            <Button size="compact" variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
          {partial ? (
            <p className="mt-2 text-helper text-ink-muted">
              Retrying re-runs the whole action — the record is already Terminated, and every
              service that already answered is simply notified again. There is no per-service retry
              endpoint.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ResultRow({
  ok,
  label,
  failureNote,
}: {
  ok: boolean;
  label: string;
  failureNote?: string;
}) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <CircleCheck
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-status-success-text"
        />
      ) : (
        <CircleSlash
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-status-danger-text"
        />
      )}
      <div className="min-w-0">
        {/* The state is in the words as well as the icon — the row reads the
            same in greyscale (DESIGN-SYSTEM §10). */}
        <p className="text-body-secondary text-ink">
          <span className="font-medium">{ok ? 'Done' : 'Failed'}</span> — {label}
        </p>
        {!ok && failureNote ? (
          <p className="mt-0.5 text-caption text-ink-muted">{failureNote}</p>
        ) : null}
      </div>
    </li>
  );
}
