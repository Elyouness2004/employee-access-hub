import type { ReactNode } from 'react';

import { isApiError } from '@/shared/api';
import type {
  EmployeeResponse,
  ProvisioningHistoryResponse,
  ProvisioningStatusResponse,
} from '@/shared/types/hr';

import type { IdentityActionId } from './api/identity-api';

/**
 * The identity actions as data: what each one is called, what it actually does
 * to the account, and exactly when the backend will accept it.
 *
 * Keeping availability here rather than inside the panel is what makes it
 * testable against the controller's real rules, and what stops the two from
 * drifting: `SecurityAdminService.requireProvisioned` answers **409 "Not
 * provisioned"** for six of these, and `ProvisioningService.provision` answers
 * **502** for a record that is not ACTIVE. An action the server would refuse for
 * a reason we already know is not offered — and where it is offered but blocked,
 * the reason is stated (a disabled control without one is a defect).
 */

export type IdentityActionGroup = 'provisioning' | 'security' | 'lifecycle';

export interface IdentityActionDefinition {
  id: IdentityActionId | 'offboard';
  group: IdentityActionGroup;
  label: string;
  /** One sentence: what the server does, in the operator's terms. */
  summary: string;
  /** Confirmation title; the object is named by the caller. */
  confirmTitle: string;
  /** Bullet consequences — every one verified against the service. */
  consequences: string[];
  /**
   * Consequences when the record has NO linked Keycloak account. Only
   * offboarding needs them: it is the one action offered for an unlinked record
   * whose behaviour genuinely differs there, and a confirmation that promises
   * work the server will skip is a confirmation that misinforms.
   */
  consequencesWhenUnlinked?: string[];
  confirmLabel: string;
  destructive?: boolean;
  /**
   * How to get back from it, in one clause. Present on every action that changes
   * access and CAN be undone — which is what stops Deactivate reading like
   * Offboard. Absent on terminal actions, which say so through `terminal`.
   */
  reversal?: string;
  /**
   * Terminal: the server has no endpoint that reverses it. These render in
   * their own danger zone rather than beside the reversible actions, because
   * two identical-looking destructive buttons is how the wrong one gets pressed.
   */
  terminal?: boolean;
}

/**
 * The nine actions. `provision` and `reprovision` are the same operation on the
 * server (`AdminProvisioningController` calls `provisioning.provision` for both);
 * they are separate entries because the situations read differently to a person —
 * a first attempt and a retry after a failure — and both endpoints exist.
 */
export const IDENTITY_ACTIONS: IdentityActionDefinition[] = [
  {
    id: 'provision',
    group: 'provisioning',
    label: 'Provision account',
    summary:
      'Creates the Keycloak account from this record, assigns the derived realm role, and e-mails the employee a password-setup link.',
    confirmTitle: 'Provision a login account?',
    consequences: [
      'A Keycloak account is created with the work email as its username.',
      'The realm role is derived from the record — it is not chosen here.',
      'No password is created. A new account starts with none, and Keycloak e-mails the employee a link to set their own.',
      'If an account with that work email already exists in Keycloak it is linked to this record instead of being created again — its existing password keeps working, and no e-mail is sent.',
      'If Keycloak rejects the request the record is left unlinked and the failure is written to the history below.',
    ],
    confirmLabel: 'Provision account',
  },
  {
    id: 'reprovision',
    group: 'provisioning',
    label: 'Retry provisioning',
    summary:
      'Runs provisioning again after a failed attempt. Same operation, same outcome recorded in the history.',
    confirmTitle: 'Retry provisioning?',
    consequences: [
      'The previous attempt failed — this starts again from where it got to.',
      'An account left behind by the failed attempt is adopted rather than duplicated.',
      'The employee is e-mailed a password-setup link. No password is created here.',
      'A second failure is recorded in the history the same way.',
    ],
    confirmLabel: 'Retry provisioning',
  },
  {
    id: 'reset-password',
    group: 'security',
    label: 'Reset password',
    summary:
      'Invalidates the current password and has Keycloak e-mail the employee a link to set a new one. No password is generated for or shown to you.',
    confirmTitle: 'Reset this account’s password?',
    consequences: [
      'The current password stops working immediately — this takes effect before the e-mail is sent.',
      'Keycloak e-mails the employee a secure link to their registered work address, where they choose a new password themselves.',
      'You will not see the new password. None is generated here, so there is nothing to read out or pass on.',
      'Until they complete the link, they cannot sign in.',
      'Existing sessions are not revoked by this action — use Revoke sessions for that.',
    ],
    confirmLabel: 'Reset password',
    // Sensitive rather than terminal: it takes away the ability to sign in until
    // the employee acts. No `reversal` — the old credential is genuinely gone and
    // nothing restores it; re-running only sends a fresh link, which is not the
    // same claim.
    destructive: true,
  },
  {
    id: 'require-mfa',
    group: 'security',
    label: 'Require MFA enrolment',
    summary:
      'Requires an authenticator app at next sign-in, using Keycloak’s own TOTP enrolment. Recommended for HR and administrator accounts.',
    confirmTitle: 'Require multi-factor authentication?',
    consequences: [
      'Keycloak asks the employee to enrol an authenticator app the next time they sign in. They cannot skip it.',
      'They are e-mailed a link so they can enrol before then.',
      'Existing sessions are not affected — this applies from their next sign-in.',
      'Enrolment and recovery codes are handled entirely by Keycloak; nothing about the factor is stored here.',
    ],
    confirmLabel: 'Require MFA',
  },
  {
    id: 'lock',
    group: 'security',
    label: 'Lock account',
    summary:
      'Disables the account and kills its sessions without changing the employment record. For a suspected compromise.',
    confirmTitle: 'Lock this account?',
    consequences: [
      'The account is disabled — sign-in stops working at once.',
      'Every session and refresh token is revoked. Residual access is bounded by the 5-minute access-token lifetime.',
      'The employment record keeps its current status; this is a security hold, not a termination.',
      'Unlock restores access, but only while the record is Active.',
    ],
    confirmLabel: 'Lock account',
    destructive: true,
    reversal: 'Reversible — Unlock restores access while the record is Active.',
  },
  {
    id: 'unlock',
    group: 'security',
    label: 'Unlock account',
    summary:
      'Clears a lock. The account is re-enabled only if the employment record is Active — otherwise the lock clears but sign-in stays closed.',
    confirmTitle: 'Unlock this account?',
    consequences: [
      // `SecurityAdminService.unlock` clears the LOCKED provisioning state and
      // re-enables the account INSIDE `if (status == ACTIVE)`. For any other
      // status it writes the history row and changes nothing else.
      'While the record is Active: the lock is cleared and the account is re-enabled at once.',
      'While the record is Disabled or Terminated: the account stays locked and sign-in stays closed. Only a history entry is written. Change the status first.',
    ],
    confirmLabel: 'Unlock account',
  },
  {
    id: 'revoke-sessions',
    group: 'security',
    label: 'Revoke sessions',
    summary:
      'Ends every SSO session and refresh token for this account. The account itself stays enabled.',
    confirmTitle: 'Revoke every session?',
    consequences: [
      'The person is signed out of every device and every application behind the gateway.',
      'Refresh tokens are revoked, so nothing can be silently renewed.',
      'They can sign in again immediately — this does not disable the account.',
    ],
    confirmLabel: 'Revoke sessions',
    destructive: true,
    reversal: 'Nothing to reverse — the account stays enabled and they can sign in again at once.',
  },
  {
    id: 'sync-roles',
    group: 'security',
    label: 'Synchronize roles',
    summary:
      'Recomputes the realm role this record implies and pushes it to the account. Use after a manager or position change looks wrong.',
    confirmTitle: 'Synchronize the realm role?',
    consequences: [
      'The role is recomputed from the record — it cannot be chosen here.',
      'The new role reaches the person’s token at their next token renewal, within 5 minutes.',
    ],
    confirmLabel: 'Synchronize roles',
  },
  {
    id: 'disable',
    group: 'lifecycle',
    label: 'Deactivate',
    summary:
      'Sets the record to Disabled, disables the account and revokes its sessions. Reversible with Reactivate.',
    confirmTitle: 'Deactivate this employee?',
    consequences: [
      'The employment record becomes Disabled.',
      'The Keycloak account is disabled and every session is revoked.',
      'Their leave, expense and document records are untouched — this is not an offboarding.',
      'Reversible: Reactivate restores both the record and the account.',
    ],
    confirmLabel: 'Deactivate',
    destructive: true,
    reversal: 'Reversible — Reactivate restores both the record and the account.',
  },
  {
    id: 'reactivate',
    group: 'lifecycle',
    label: 'Reactivate',
    summary:
      'Reverses a deactivation: the record returns to Active, the account is re-enabled and the realm role is recomputed.',
    confirmTitle: 'Reactivate this employee?',
    consequences: [
      'The employment record returns to Active.',
      'The Keycloak account is re-enabled and any failed-sign-in lockout is cleared. Their existing password still works.',
      'The realm role is recomputed from the record, so a reporting line that changed while they were away is applied.',
      'Offboarding is not reversed by this — a Terminated record cannot be reactivated.',
    ],
    confirmLabel: 'Reactivate',
  },
  {
    id: 'offboard',
    group: 'lifecycle',
    label: 'Offboard',
    summary:
      'The terminal action: Terminated, account disabled, sessions revoked, and the leave, expense and document services notified.',
    confirmTitle: 'Offboard this employee?',
    consequences: [
      'The employment record becomes Terminated. There is no endpoint that reverses it.',
      'The Keycloak account is disabled and every session and refresh token is revoked. Residual access is bounded by the 5-minute access-token lifetime.',
      'The leave, expense and document services are notified so their records are closed out. Each is best-effort — any that fail are listed afterwards.',
      'The whole action is recorded in the audit trail against your name.',
    ],
    // `OffboardingService.offboard` skips the identity work entirely when
    // `keycloakId` is null and substitutes an EMPTY fan-out — so none of the
    // account or downstream promises above would be true.
    consequencesWhenUnlinked: [
      'The employment record becomes Terminated. There is no endpoint that reverses it.',
      'There is no login account to disable — this record was never provisioned, so nothing about access changes.',
      'No downstream service is notified: the fan-out is keyed to a login account, and there is none.',
      'The action is recorded in the audit trail against your name.',
    ],
    confirmLabel: 'Offboard employee',
    destructive: true,
    terminal: true,
  },
];

/**
 * The consequences to show for this action against THIS record. Static for
 * everything except offboarding, whose behaviour genuinely changes when no
 * account is linked.
 */
export function consequencesOf(
  action: IdentityActionDefinition,
  employee: EmployeeResponse,
): string[] {
  if (action.consequencesWhenUnlinked && !employee.keycloakId) {
    return action.consequencesWhenUnlinked;
  }
  return action.consequences;
}

export interface ActionAvailability {
  /** Whether the action is offered at all. */
  offered: boolean;
  /** Offered but blocked — always with a reason the user can act on. */
  blockedReason?: string;
}

export interface IdentityContext {
  employee: EmployeeResponse;
  /** The journal, oldest first, or undefined while it loads. */
  history: ProvisioningHistoryResponse[] | undefined;
  /**
   * Live identity state from `GET .../identity`, or undefined while it loads.
   * Where it is present it wins over the employee row for ACCOUNT questions:
   * the row knows employment status and whether an account is linked, but only
   * this says whether that account is currently locked or disabled.
   */
  identity?: ProvisioningStatusResponse;
}

/** Whether the account is under an admin lock right now. */
export function isLocked({ identity }: IdentityContext): boolean {
  return identity?.provisioningStatus === 'LOCKED';
}

/** The most recent journal row failed — the record is sitting on a failure. */
export function hasFailedLastAttempt(history: ProvisioningHistoryResponse[] | undefined): boolean {
  const last = history?.at(-1);
  return last?.status === 'FAILED';
}

/**
 * Whether an action is offered for this record, and why not when it is blocked.
 *
 * Every rule below is a server rule, cited:
 *  - `SecurityAdminService.requireProvisioned` → 409 for the six account actions
 *    on an unlinked record;
 *  - `ProvisioningService.provision` → 502 unless the record is ACTIVE;
 *  - `ProvisioningService.provision` → no-op for an already-linked, healthy
 *    account, so re-offering it would be a button that does nothing;
 *  - `SecurityAdminService.disable` sets the status to DISABLED unconditionally,
 *    which would silently un-terminate a TERMINATED record — so it is withheld
 *    there;
 *  - `OffboardingService.offboard` accepts an unlinked record (the fan-out is
 *    simply empty), so offboarding is offered without an account.
 */
export function availabilityOf(
  action: IdentityActionDefinition,
  context: IdentityContext,
): ActionAvailability {
  const { employee, history, identity } = context;
  const linked = Boolean(identity?.linked ?? employee.keycloakId);
  const status = identity?.employeeStatus ?? employee.status;
  const terminated = status === 'TERMINATED';
  const failedLast = hasFailedLastAttempt(history);
  const locked = isLocked(context);

  switch (action.id) {
    case 'provision':
      if (linked || failedLast) return { offered: false };
      return status === 'ACTIVE'
        ? { offered: true }
        : {
            offered: true,
            blockedReason: `Provisioning requires an Active record — this one is ${status === 'DISABLED' ? 'Disabled' : 'Terminated'}. Set the status to Active first.`,
          };
    case 'reprovision':
      if (linked || !failedLast) return { offered: false };
      return status === 'ACTIVE'
        ? { offered: true }
        : {
            offered: true,
            blockedReason: `Provisioning requires an Active record — this one is ${status === 'DISABLED' ? 'Disabled' : 'Terminated'}. Set the status to Active first.`,
          };
    case 'reset-password':
    case 'require-mfa':
    case 'revoke-sessions':
    case 'sync-roles':
      return { offered: linked };
    // Lock and unlock are opposites; offering both at once invites an operator
    // to "unlock" an account that was never locked and read the resulting no-op
    // as a failure. Until the state is known, both are offered — the server is
    // the authority either way, and hiding an action on a guess is worse.
    case 'lock':
      if (!linked) return { offered: false };
      return locked
        ? { offered: true, blockedReason: 'This account is already locked.' }
        : { offered: true };
    case 'unlock':
      if (!linked) return { offered: false };
      if (identity && !locked) return { offered: false };
      return terminated || status === 'DISABLED'
        ? {
            offered: true,
            blockedReason: `Unlocking clears the lock but sign-in stays closed while the record is ${status === 'DISABLED' ? 'Disabled' : 'Terminated'}. Reactivate the employee first.`,
          }
        : { offered: true };
    case 'disable':
      if (!linked) return { offered: false };
      if (status === 'DISABLED') return { offered: false };
      return terminated
        ? {
            offered: true,
            blockedReason:
              'This record is already Terminated. Deactivating would move it back to Disabled, which is not a step in the lifecycle.',
          }
        : { offered: true };
    case 'reactivate':
      if (!linked) return { offered: false };
      if (status === 'ACTIVE') return { offered: false };
      return terminated
        ? {
            offered: true,
            blockedReason:
              'Offboarding is terminal — the server refuses to reactivate a Terminated record.',
          }
        : { offered: true };
    case 'offboard':
      return terminated
        ? {
            offered: true,
            blockedReason: 'This employee has already been offboarded — the record is Terminated.',
          }
        : { offered: true };
    default:
      return { offered: false };
  }
}

export interface IdentityFailure {
  message: string;
  /** What to do about it — 502 and 503 get genuinely different advice. */
  guidance: ReactNode;
  correlationId?: string;
}

/**
 * The failure of an identity action, read by kind.
 *
 * `502 Provisioning failed` and `503 Identity provider unavailable` are never
 * merged: the first means Keycloak was reached and said no (review and retry),
 * the second means it was not reached at all (wait). Telling an operator to
 * "review the data" when the provider is simply down sends them looking for a
 * problem that is not there.
 */
export function identityFailureOf(error: unknown): IdentityFailure {
  if (!isApiError(error)) {
    return {
      message: 'Something went wrong.',
      guidance: 'Nothing was confirmed as changed. Try again.',
    };
  }
  const correlationId = error.kind === 'network' ? undefined : error.correlationId;
  const base = correlationId ? { correlationId } : {};

  switch (error.kind) {
    case 'provisioningFailed':
      return {
        ...base,
        message: error.detail,
        guidance:
          'Keycloak was reached and rejected the operation. Review the record — a duplicate email or a non-Active status is the usual cause — then retry.',
      };
    case 'unavailable':
      return {
        ...base,
        message: error.detail,
        guidance:
          'The identity provider could not be reached, so nothing changed. Wait and try again — there is nothing to fix here.',
      };
    case 'conflict':
      return {
        ...base,
        message: error.detail,
        guidance:
          'The record is not in a state this action accepts. Refresh the page to see where it actually is.',
      };
    case 'forbidden':
      return {
        ...base,
        message: error.detail,
        guidance: 'You are signed in — the server refused this action for your roles.',
      };
    case 'notFound':
      return {
        ...base,
        message: error.detail ?? 'That employee record no longer exists.',
        guidance: 'Somebody may have deleted it. Return to the directory.',
      };
    case 'network':
      return {
        message: 'The server could not be reached.',
        guidance: 'Nothing was sent. Check your connection and try again.',
      };
    case 'unauthorized':
      return {
        ...base,
        message: 'Your session is no longer valid.',
        guidance: 'Sign in again — nothing was changed.',
      };
    default:
      // validation, businessRule, payloadTooLarge, unsupportedMediaType, server:
      // none is expected from these endpoints, so the server's own words are
      // shown rather than a guess at what it meant.
      return {
        ...base,
        message: error.detail ?? 'The server rejected that request.',
        guidance: 'Nothing was confirmed as changed.',
      };
  }
}
