import { Alert } from '@/shared/components';
import { Button } from '@/shared/components/ui';

import type { IdentityActionId } from '../api/identity-api';

/**
 * The outcome of an identity action that has just succeeded.
 *
 * Why this is action-aware rather than one shared "done" banner: the two actions
 * that send an e-mail fail in *different* ways, and a single wording cannot be
 * true for both.
 *
 *  - **Reset password** invalidates the credential first
 *    (`SecurityAdminService.resetPassword` overwrites it, then sets
 *    UPDATE_PASSWORD, then mails the action token). If that mail does not go
 *    out, the employee is locked out *now* and cannot rescue themselves —
 *    Keycloak's own "forgot password" link is delivered by the same mail server
 *    that just failed. That is a danger-level condition needing an operator.
 *  - **Require MFA** only adds a required action. The employee's password still
 *    works and Keycloak prompts them at next sign-in, so undelivered mail is a
 *    warning, not a lockout.
 *
 * `activationEmailSent` is the server's own delivery verdict (Keycloak accepted
 * the `execute-actions-email` call), so it is reported as given and never
 * inferred from the 200 — an accepted action with undelivered mail is exactly
 * the case this component exists to tell apart.
 */

export interface IdentityOutcomeAlertProps {
  /** The action that completed. `offboard` reports through its own result panel. */
  actionId: IdentityActionId;
  /** The action's label, for the actions that carry no bespoke copy. */
  label: string;
  employeeName: string;
  /** The address Keycloak mailed — the employee's work e-mail. */
  email: string;
  /**
   * The server's delivery verdict, or `null` for the actions that send no mail
   * (the endpoint omits the field there — it is never guessed).
   */
  activationEmailSent: boolean | null;
  onDismiss: () => void;
}

export function IdentityOutcomeAlert({
  actionId,
  label,
  employeeName,
  email,
  activationEmailSent,
  onDismiss,
}: IdentityOutcomeAlertProps) {
  const dismiss = (
    <Button size="compact" variant="secondary" onClick={onDismiss}>
      Dismiss
    </Button>
  );
  const address = <span className="font-mono text-mono-sm text-ink-strong">{email}</span>;

  if (actionId === 'reset-password') {
    return activationEmailSent === false ? (
      <Alert
        tone="danger"
        live="assertive"
        title="Password reset applied — but the e-mail could not be sent"
        actions={dismiss}
      >
        <p>
          The previous password has already stopped working, and the link {employeeName} needs in
          order to choose a new one never left the server.
        </p>
        <p className="mt-2">
          <strong className="text-ink-strong">They cannot sign in, and cannot fix it alone</strong> —
          Keycloak&rsquo;s own password-recovery link is delivered by the same mail server that just
          failed. Have the mail relay checked, then run Reset password again to re-send the link.
        </p>
      </Alert>
    ) : (
      <Alert tone="success" title="Password reset e-mail sent" actions={dismiss}>
        <p>Keycloak sent {employeeName} a secure link to {address}.</p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
          <li>Their previous password stopped working immediately.</li>
          <li>
            They choose the new password themselves, on Keycloak&rsquo;s own page. It is never shown
            here — no temporary password exists to pass on.
          </li>
          <li>Until they complete it, they cannot sign in.</li>
          <li>Existing sessions were not revoked — use Revoke sessions for that.</li>
        </ul>
      </Alert>
    );
  }

  if (actionId === 'require-mfa') {
    return activationEmailSent === false ? (
      <Alert tone="warning" title="MFA is required — but the e-mail could not be sent" actions={dismiss}>
        <p>
          The requirement is on {employeeName}&rsquo;s account and Keycloak will ask them to enrol an
          authenticator app at their next sign-in, so nothing is lost. Only the advance notice to{' '}
          {address} failed. Their password still works.
        </p>
      </Alert>
    ) : (
      <Alert tone="success" title="MFA enrolment required" actions={dismiss}>
        <p>
          {employeeName} was e-mailed enrolment instructions at {address}, and Keycloak will require
          an authenticator app at their next sign-in either way. The factor itself is held entirely
          by Keycloak.
        </p>
      </Alert>
    );
  }

  if (actionId === 'provision' || actionId === 'reprovision') {
    return activationEmailSent === false ? (
      <Alert
        tone="warning"
        title="Account created — but the password-setup e-mail could not be sent"
        actions={dismiss}
      >
        <p>
          The Keycloak account exists and its realm role is assigned, but {employeeName} has no way
          to set a password yet. The account was created without one, so there is nothing to pass on
          — have the mail relay checked, then use Reset password to send the link.
        </p>
      </Alert>
    ) : (
      <Alert tone="success" title="Account provisioned" actions={dismiss}>
        <p>
          {employeeName}&rsquo;s Keycloak account was created and a password-setup link was sent to{' '}
          {address}. They choose their own password — none was generated here.
        </p>
      </Alert>
    );
  }

  // Everything else changes the account without sending mail: lock, unlock,
  // deactivate, reactivate, revoke sessions, role sync. The server confirmed it;
  // the histories on the neighbouring tabs carry the detail.
  return (
    <Alert tone="success" title={`${label} completed`} actions={dismiss}>
      <p>
        The server confirmed this for {employeeName}. It is recorded in the provisioning and security
        histories on the neighbouring tabs.
      </p>
    </Alert>
  );
}
