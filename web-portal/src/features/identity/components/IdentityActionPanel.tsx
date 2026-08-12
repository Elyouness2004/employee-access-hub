import { RotateCcw, ShieldAlert } from 'lucide-react';
import { useState } from 'react';

import {
  Alert,
  ConfirmActionDialog,
  CopyableId,
  DetailList,
  FormField,
  StatusBadge,
  TechnicalDetails,
  useConfirmation,
} from '@/shared/components';
import { Button, Input, Skeleton } from '@/shared/components/ui';
import { formatDateTime } from '@/shared/lib/format';
import type {
  EmployeeResponse,
  OffboardingResponse,
  ProvisioningHistoryResponse,
} from '@/shared/types/hr';

import {
  useIdentityActionMutation,
  useIdentityStateQuery,
  useOffboardMutation,
  type IdentityActionId,
} from '../api/identity-api';
import {
  availabilityOf,
  consequencesOf,
  identityFailureOf,
  IDENTITY_ACTIONS,
  type IdentityActionDefinition,
  type IdentityFailure,
} from '../actions';
import { IdentityOutcomeAlert } from './IdentityOutcomeAlert';
import { OffboardingResultPanel } from './OffboardingResultPanel';

/**
 * The Identity tab of P17 — the flagship surface.
 *
 * It presents **two states, never merged**:
 *
 *  - *Employment* — the HR record: Active, Disabled, Terminated.
 *  - *Account* — what Keycloak holds: linked or not, and then enabled, locked or
 *    disabled.
 *
 * They disagree routinely, and the disagreement is the point: a locked account
 * belongs to an Active employee, a Terminated employee still has a disabled
 * account on record, and an Active employee may have no account at all. An
 * operator deciding whether to unlock somebody has to see which of the two is
 * actually blocking them, so the panel reads the live state from
 * `GET /api/hr/admin/employees/{id}/identity` rather than inferring it.
 *
 * Actions are offered only where the server would accept them (see
 * `actions.ts`), each behind a confirmation that names the object and
 * enumerates what will actually happen. None of them is optimistic: they change
 * real accounts in Keycloak, and a hopeful UI here does damage.
 *
 * No credential ever appears here, because the server creates none: provisioning
 * and password reset both hand off to Keycloak's own action-token e-mail, and
 * the only thing to report back is whether that e-mail was delivered.
 */
export interface IdentityActionPanelProps {
  employee: EmployeeResponse;
  history: ProvisioningHistoryResponse[] | undefined;
  isHistoryLoading: boolean;
  /**
   * Fired after any action the server accepted. Several of them change the HR
   * record itself — `disable` writes `EmployeeStatus.DISABLED`, provisioning
   * links the account, offboarding writes TERMINATED — but that record belongs
   * to the `employees` feature, which this one may not import
   * (FRONTEND-ARCHITECTURE §14). Rather than reach into another feature's cache
   * with a hard-coded key, the composing page is told and invalidates its own.
   */
  onIdentityChanged?: () => void;
}

/** Only an *offered and unblocked* action ever gets here — the button is disabled otherwise. */
interface PendingAction {
  definition: IdentityActionDefinition;
}

/**
 * What the last successful action was, and — for the ones that ask Keycloak to
 * e-mail the employee — whether that e-mail actually went out. Undelivered mail
 * is the operator's cue to reach the person another way, so it is reported
 * rather than folded into a flat "done".
 */
interface LastCompleted {
  id: IdentityActionId;
  label: string;
  activationEmailSent: boolean | null;
}

export function IdentityActionPanel({
  employee,
  history,
  isHistoryLoading,
  onIdentityChanged,
}: IdentityActionPanelProps) {
  const runAction = useIdentityActionMutation();
  const offboard = useOffboardMutation();
  const identityState = useIdentityStateQuery(employee.id);
  const confirmation = useConfirmation();

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [failure, setFailure] = useState<IdentityFailure | null>(null);
  const [lockReason, setLockReason] = useState('');
  const [typedConfirmation, setTypedConfirmation] = useState('');
  const [outcome, setOutcome] = useState<OffboardingResponse | null>(null);
  const [lastCompleted, setLastCompleted] = useState<LastCompleted | null>(null);

  const name = `${employee.firstName} ${employee.lastName}`;
  const identity = identityState.data;
  const context = { employee, history, identity };
  const linked = Boolean(identity?.linked ?? employee.keycloakId);
  const lastEvent = history?.at(-1);

  const ask = (definition: IdentityActionDefinition) => {
    setPending({ definition });
    setFailure(null);
    setLockReason('');
    setTypedConfirmation('');
    confirmation.ask();
  };

  const close = () => {
    confirmation.close();
    setPending(null);
    setFailure(null);
  };

  const confirm = async () => {
    if (!pending) return;
    setFailure(null);
    try {
      if (pending.definition.id === 'offboard') {
        const result = await offboard.mutateAsync(employee.id);
        setOutcome(result);
        setLastCompleted(null);
      } else {
        const status = await runAction.mutateAsync({
          employeeId: employee.id,
          action: pending.definition.id as IdentityActionId,
          ...(pending.definition.id === 'lock' && lockReason.trim()
            ? { reason: lockReason.trim() }
            : {}),
        });
        setLastCompleted({
          id: pending.definition.id as IdentityActionId,
          label: pending.definition.label,
          activationEmailSent: status.activationEmailSent,
        });
      }
      onIdentityChanged?.();
      close();
    } catch (error) {
      setFailure(identityFailureOf(error));
    }
  };

  const busy = runAction.isPending || offboard.isPending;
  const isOffboard = pending?.definition.id === 'offboard';
  const isLock = pending?.definition.id === 'lock';
  // Type-to-confirm is reserved for offboarding (DESIGN-SYSTEM §9.4): it is the
  // only action with no reverse endpoint.
  const typeToConfirmSatisfied =
    !isOffboard || typedConfirmation.trim().toUpperCase() === employee.matricule.toUpperCase();

  /**
   * Three ordinary sections plus a danger zone. Offboarding is pulled out of
   * the lifecycle group rather than sitting under the same heading as
   * Deactivate: they read as the same kind of thing — both disable the account,
   * both revoke the sessions — and only one of them can be undone. Two
   * identical destructive buttons side by side is how the wrong one gets
   * pressed, so the terminal action gets its own framing and its own warning.
   */
  const groups = [
    {
      id: 'provisioning' as const,
      title: 'Provisioning',
      description:
        'Creating the Keycloak account behind this record, and retrying it when it failed.',
    },
    {
      id: 'security' as const,
      title: 'Account security',
      description: 'Acts on the login account only. None of these changes the employment record.',
    },
    {
      id: 'lifecycle' as const,
      title: 'Employment lifecycle',
      description: 'Changes the employment record and the account together. Reversible.',
    },
  ];

  const terminalActions = IDENTITY_ACTIONS.filter(
    (action) => action.terminal && availabilityOf(action, context).offered,
  );

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="identity-state-heading"
        className="rounded-lg border border-border bg-surface p-5"
      >
        <h2 id="identity-state-heading" className="mb-4 text-panel-title text-ink-strong">
          Identity state
        </h2>
        {identityState.isError ? (
          <Alert tone="danger" title="The identity state could not be read">
            {identityFailureOf(identityState.error).message}
          </Alert>
        ) : null}
        <DetailList
          items={[
            {
              label: 'Employment',
              value: <StatusBadge status={identity?.employeeStatus ?? employee.status} />,
            },
            {
              label: 'Account',
              value: identityState.isLoading ? (
                <Skeleton className="h-5 w-32" />
              ) : identity ? (
                identity.linked ? (
                  <StatusBadge status={identity.provisioningStatus} />
                ) : (
                  <span className="text-ink-muted">Not linked — no login account exists</span>
                )
              ) : (
                <span className="text-ink-muted">Unavailable</span>
              ),
            },
            {
              label: 'Sign-in name',
              // True for every account in this realm, not just the ones this
              // service creates: `ProvisioningService` uses the work e-mail as
              // the username, and the realm sets `loginWithEmailAllowed: true`
              // with `duplicateEmailsAllowed: false`, so the e-mail signs in
              // even for an account that was adopted with a short login.
              // Readable, unlike the subject — which is in the technical
              // section below.
              value: linked ? employee.email : 'None — no account has been created',
            },
            {
              label: 'Account provisioned at',
              value: identityState.isLoading ? (
                <Skeleton className="h-5 w-40" />
              ) : identity?.provisionedAt ? (
                formatDateTime(identity.provisionedAt)
              ) : (
                'Never — no account has been created'
              ),
              mono: Boolean(identity?.provisionedAt),
            },
            {
              label: 'Last synchronized with Keycloak',
              value: identityState.isLoading ? (
                <Skeleton className="h-5 w-40" />
              ) : identity?.lastSyncAt ? (
                formatDateTime(identity.lastSyncAt)
              ) : (
                'Never synchronized since provisioning'
              ),
              mono: Boolean(identity?.lastSyncAt),
            },
            {
              label: 'Last recorded identity event',
              value: isHistoryLoading ? (
                <Skeleton className="h-5 w-48" />
              ) : lastEvent ? (
                <span>
                  {lastEvent.action} · {lastEvent.status} ·{' '}
                  <span className="font-mono text-mono-sm">
                    {formatDateTime(lastEvent.occurredAt)}
                  </span>
                </span>
              ) : (
                <span className="text-ink-muted">Nothing recorded yet</span>
              ),
              wide: true,
            },
          ]}
        />

        <p className="mt-4 text-helper text-ink-muted">
          Employment and account are separate states. An Active employee can hold a locked account,
          and a Terminated one keeps a disabled account on record — the account row is what decides
          whether they can sign in right now.
        </p>

        {/*
          The subject and the realm role are what an administrator pastes into
          Keycloak or a support ticket — kept in full, one disclosure below the
          state they came here to read (DESIGN-SYSTEM §12).
        */}
        <TechnicalDetails className="mt-4">
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-caption text-ink-muted">Keycloak subject (login account)</dt>
              <dd className="mt-0.5 text-ink-strong">
                {(identity?.keycloakId ?? employee.keycloakId) ? (
                  <CopyableId
                    value={(identity?.keycloakId ?? employee.keycloakId)!}
                    label="Keycloak id"
                  />
                ) : (
                  <span className="text-body text-ink-muted">
                    Not linked — no login account has been provisioned
                  </span>
                )}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-caption text-ink-muted">Realm role</dt>
              <dd className="mt-0.5 font-mono text-mono text-ink-strong">
                {identity?.realmRole ?? 'Unavailable'}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-caption text-ink-muted">Employee id (HR record)</dt>
              <dd className="mt-0.5 text-ink-strong">
                <CopyableId value={employee.id} label="Employee id" />
              </dd>
            </div>
          </dl>
        </TechnicalDetails>
      </section>

      {lastCompleted ? (
        <IdentityOutcomeAlert
          actionId={lastCompleted.id}
          label={lastCompleted.label}
          employeeName={name}
          email={employee.email}
          activationEmailSent={lastCompleted.activationEmailSent}
          onDismiss={() => setLastCompleted(null)}
        />
      ) : null}

      {outcome ? (
        <OffboardingResultPanel
          outcome={outcome}
          employeeName={name}
          onRetry={() => {
            const definition = IDENTITY_ACTIONS.find((action) => action.id === 'offboard');
            if (definition) ask(definition);
          }}
          onDismiss={() => setOutcome(null)}
        />
      ) : null}

      {!linked ? (
        <Alert tone="info" title="No login account is linked to this record">
          Password reset, lock, unlock, role synchronization and session revocation all act on a
          Keycloak account, so they are not offered until one exists. Provisioning is.
        </Alert>
      ) : null}

      {groups.map((group) => {
        const actions = IDENTITY_ACTIONS.filter(
          (action) =>
            action.group === group.id &&
            !action.terminal &&
            availabilityOf(action, context).offered,
        );
        if (actions.length === 0) return null;
        return (
          <section
            key={group.id}
            aria-labelledby={`identity-group-${group.id}`}
            className="rounded-lg border border-border bg-surface"
          >
            <div className="border-b border-border px-5 py-3">
              <h2 id={`identity-group-${group.id}`} className="text-panel-title text-ink-strong">
                {group.title}
              </h2>
              <p className="mt-0.5 text-body-secondary text-ink-muted">{group.description}</p>
            </div>
            <ul>
              {actions.map((action) => (
                <ActionRow
                  key={action.id}
                  action={action}
                  availability={availabilityOf(action, context)}
                  onAsk={() => ask(action)}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {terminalActions.length > 0 ? (
        /*
          The danger zone. A distinct border and a stated consequence, because
          the difference between this and the section above it is the difference
          between a change and an ending — and the UI has to carry that before
          the confirmation dialog does.
        */
        <section
          aria-labelledby="identity-group-danger"
          className="rounded-lg border border-status-danger-border bg-surface"
        >
          <div className="border-b border-status-danger-border bg-status-danger-bg px-5 py-3">
            <h2 id="identity-group-danger" className="text-panel-title text-status-danger-text">
              Danger zone
            </h2>
            <p className="mt-0.5 text-body-secondary text-status-danger-text">
              Terminal actions. The server has no endpoint that reverses these — Reactivate does not
              undo them.
            </p>
          </div>
          <ul>
            {terminalActions.map((action) => (
              <ActionRow
                key={action.id}
                action={action}
                availability={availabilityOf(action, context)}
                onAsk={() => ask(action)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <ConfirmActionDialog
        open={confirmation.open}
        onOpenChange={(next) => (next ? undefined : close())}
        title={pending?.definition.confirmTitle ?? 'Confirm'}
        description={
          <>
            {/*
              The object named the way the operator knows it: the person, their
              matricule, and the sign-in name the action will act on. The
              Keycloak subject identifies the same account and identifies nothing
              to a reader about to disable it — it stays on the panel behind the
              technical disclosure.
            */}
            <strong className="text-ink-strong">{name}</strong> ({employee.matricule})
            {employee.keycloakId ? ` · signs in as ${employee.email}` : ''}
          </>
        }
        consequences={pending ? consequencesOf(pending.definition, employee) : []}
        extra={
          isLock ? (
            <FormField
              label="Reason (optional)"
              helper="Recorded in the provisioning history and the security-event trail. Leave blank for the default note."
            >
              {(props) => (
                <Input
                  {...props}
                  value={lockReason}
                  onChange={(event) => setLockReason(event.target.value)}
                  placeholder="Suspected credential compromise"
                />
              )}
            </FormField>
          ) : isOffboard ? (
            <FormField
              label={`Type ${employee.matricule} to confirm`}
              helper="Offboarding has no reverse endpoint, so it asks you to name the record exactly."
            >
              {(props) => (
                <Input
                  mono
                  {...props}
                  value={typedConfirmation}
                  onChange={(event) => setTypedConfirmation(event.target.value)}
                />
              )}
            </FormField>
          ) : null
        }
        confirmLabel={pending?.definition.confirmLabel ?? 'Confirm'}
        destructive={pending?.definition.destructive ?? false}
        confirmDisabled={!typeToConfirmSatisfied}
        busy={busy}
        error={
          failure ? (
            <span className="flex flex-col gap-1">
              <span>{failure.message}</span>
              <span className="text-ink-muted">{failure.guidance}</span>
              {failure.correlationId ? (
                <span className="font-mono text-mono-sm text-ink-muted">
                  Correlation id: {failure.correlationId}
                </span>
              ) : null}
            </span>
          ) : null
        }
        onConfirm={() => void confirm()}
      />
    </div>
  );
}

/**
 * One offered action: what it is called, what the server will actually do, how
 * to get back from it, and — when the record's state blocks it — why.
 *
 * Defined once so the ordinary sections and the danger zone cannot drift into
 * describing the same action two different ways.
 */
function ActionRow({
  action,
  availability,
  onAsk,
}: {
  action: IdentityActionDefinition;
  availability: { offered: boolean; blockedReason?: string };
  onAsk: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 border-b border-border p-5 last:border-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-label text-ink-strong">{action.label}</p>
        <p className="mt-1 text-body-secondary text-ink-muted">{action.summary}</p>
        {action.reversal ? (
          <p className="mt-1.5 flex items-start gap-1.5 text-body-secondary text-ink-muted">
            <RotateCcw aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {action.reversal}
          </p>
        ) : null}
        {action.terminal ? (
          <p className="mt-1.5 flex items-start gap-1.5 text-body-secondary text-status-danger-text">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            Permanent. There is no endpoint that reverses it.
          </p>
        ) : null}
        {availability.blockedReason ? (
          <p className="mt-2 flex items-start gap-1.5 text-body-secondary text-status-warning-text">
            <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {availability.blockedReason}
          </p>
        ) : null}
      </div>
      <Button
        size="compact"
        // Only the terminal action gets the destructive variant. Deactivate and
        // Lock are serious and reversible; painting them the same red as
        // offboarding would leave nothing to distinguish the one that cannot be
        // taken back.
        variant={action.terminal ? 'destructive' : 'secondary'}
        disabled={Boolean(availability.blockedReason)}
        onClick={onAsk}
        className="shrink-0"
      >
        {action.label}
      </Button>
    </li>
  );
}
