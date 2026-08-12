import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { env } from '@/config/env';
import {
  employeeFixture,
  failedProvisioningHistoryFixture,
  offboardingPartialFixture,
  provisioningHistoryFixture,
  provisioningStatusFixture,
  securityEventsFixture,
  sessionsFixture,
  terminatedEmployeeFixture,
  unprovisionedEmployeeFixture,
} from '@/shared/testing/msw/fixtures';
import { problemResponse } from '@/shared/testing/msw/problem';
import { server } from '@/shared/testing/msw/server';
import { renderWithProviders } from '@/shared/testing/render';
import type { EmployeeResponse, ProvisioningHistoryResponse } from '@/shared/types/hr';

import { EmployeeSessionsPanel } from './components/EmployeeSessionsPanel';
import { IdentityActionPanel } from './components/IdentityActionPanel';
import { OffboardingResultPanel } from './components/OffboardingResultPanel';
import { ProvisioningHistoryPanel } from './components/ProvisioningHistoryPanel';
import { SecurityEventsPanel } from './components/SecurityEventsPanel';

/**
 * P17 — the identity lifecycle. The defense-critical surface, so the tests are
 * about refusal as much as about action: which of the nine the backend would
 * accept, what each confirmation promises, and the difference between a
 * provider that said no (502) and one that was not there (503).
 */

const ADMIN = `${env.apiBaseUrl}/api/hr/admin/employees`;

function renderPanel(
  employee: EmployeeResponse = employeeFixture,
  history: ProvisioningHistoryResponse[] | undefined = provisioningHistoryFixture,
) {
  return renderWithProviders(
    <IdentityActionPanel employee={employee} history={history} isHistoryLoading={false} />,
    { role: 'HR' },
  );
}

describe('identity state', () => {
  it('reads the live state and keeps employment and account separate', async () => {
    const { container } = renderPanel();

    // The account is named by something a person can read; the subject itself is
    // present but secondary, inside the technical disclosure.
    expect(await screen.findByText(employeeFixture.email)).toBeVisible();
    expect(screen.getByText(employeeFixture.keycloakId!)).not.toBeVisible();

    // The two states are distinct labelled rows, because they answer different
    // questions and routinely disagree.
    expect(screen.getByText('Employment')).toBeVisible();
    expect(screen.getByText('Account')).toBeVisible();
    expect(screen.getByText('Active')).toBeVisible();
    expect(await screen.findByText('Provisioned')).toBeVisible();
    // The realm role is machine data an administrator copies into Keycloak — it
    // moved into the technical disclosure alongside the subject, and is still
    // the value the server returned.
    expect(screen.getByText(provisioningStatusFixture.realmRole!)).not.toBeVisible();

    // The journal's last row is shown as what it is.
    expect(screen.getByText(/SYNC · SYNCED/)).toBeVisible();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders an unlinked record as "no account exists", not as a missing value', async () => {
    renderPanel(unprovisionedEmployeeFixture, []);

    expect(await screen.findByText(/not linked — no login account exists/i)).toBeVisible();
    expect(screen.getByText(/never — no account has been created/i)).toBeVisible();
    // The employment side is unaffected: the person is Active, the account is absent.
    expect(screen.getByText('Active')).toBeVisible();
  });

  it('refreshes the state after an action instead of showing a superseded value', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    renderWithProviders(
      <IdentityActionPanel
        employee={employeeFixture}
        history={provisioningHistoryFixture}
        isHistoryLoading={false}
      />,
      { role: 'HR', queryClient: client },
    );
    expect(await screen.findByText('Provisioned')).toBeVisible();

    // The server now reports a locked account — an action must make the panel
    // show THAT, not the state it happened to load with.
    server.use(
      http.get(`${ADMIN}/:id/identity`, () =>
        HttpResponse.json({ ...provisioningStatusFixture, provisioningStatus: 'LOCKED' }),
      ),
      http.post(`${ADMIN}/:id/lock`, () =>
        HttpResponse.json({ ...provisioningStatusFixture, provisioningStatus: 'LOCKED' }),
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: /lock account/i }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /lock account/i }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Locked')).toBeVisible();
    await waitFor(() => expect(screen.queryByText('Provisioned')).toBeNull());
  });

  it('says the state is unavailable rather than inventing one when the read fails', async () => {
    server.use(
      http.get(`${ADMIN}/:id/identity`, () =>
        problemResponse(503, {
          title: 'Identity provider unavailable',
          detail: 'Keycloak did not answer',
        }),
      ),
    );
    renderPanel();

    expect(await screen.findByText(/the identity state could not be read/i)).toBeVisible();
    // No account state is asserted — an unreadable state is never rendered as a
    // healthy one.
    expect(screen.queryByText('Provisioned')).toBeNull();
  });
});

describe('password setup is Keycloak’s, and the UI says so', () => {
  it('names the address Keycloak mailed, and offers no password to pass on', async () => {
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /reset password/i }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    const done = await screen.findByText(/password reset e-mail sent/i);
    expect(done).toBeVisible();
    // The operator's follow-up question is "sent where?" — so the address is on
    // the success state, not just the employee's name.
    expect(
      within(done.closest('[role="status"]')!).getByText(employeeFixture.email),
    ).toBeVisible();
    expect(screen.getByText(/no temporary password exists to pass on/i)).toBeVisible();
    expect(screen.getByText(/previous password stopped working immediately/i)).toBeVisible();
    // Nothing that looks like a credential is anywhere on the page.
    expect(screen.queryByText(/temporary password is/i)).toBeNull();
  });

  it('treats an undelivered reset mail as a lockout, not a warning', async () => {
    server.use(
      http.post(`${ADMIN}/:id/reset-password`, () =>
        HttpResponse.json({ ...provisioningStatusFixture, activationEmailSent: false }),
      ),
    );
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText(/e-mail could not be sent/i)).toBeVisible();
    // The credential is already gone, so this is the one outcome the operator
    // must act on: it announces assertively rather than politely.
    expect(screen.getByRole('alert')).toHaveTextContent(/cannot sign in, and cannot fix it alone/i);
    // The old copy sent them to Keycloak's password-recovery link — which is
    // delivered by the very mail server that just failed.
    expect(screen.getByText(/same mail server that just failed/i)).toBeVisible();
  });

  it('keeps an undelivered MFA mail a warning — the password still works', async () => {
    server.use(
      http.post(`${ADMIN}/:id/require-mfa`, () =>
        HttpResponse.json({ ...provisioningStatusFixture, activationEmailSent: false }),
      ),
    );
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /require mfa/i }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /require mfa/i }));

    expect(await screen.findByText(/mfa is required/i)).toBeVisible();
    expect(screen.getByText(/their password still works/i)).toBeVisible();
    // Not a lockout: nothing here announces assertively.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offers MFA enrolment through Keycloak’s own required action', async () => {
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /require mfa/i }));
    const dialog = await screen.findByRole('alertdialog');

    expect(dialog).toHaveTextContent(/enrol an authenticator app/i);
    expect(dialog).toHaveTextContent(/handled entirely by Keycloak/i);
  });
});

describe('action availability follows the backend’s own rules', () => {
  it('offers only provisioning and offboarding for a record with no linked account', () => {
    renderPanel(unprovisionedEmployeeFixture, []);

    expect(screen.getByRole('button', { name: /provision account/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /offboard/i })).toBeVisible();
    // The six that call `requireProvisioned` would answer 409 — so they are not offered.
    expect(screen.queryByRole('button', { name: /reset password/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /lock account/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /unlock account/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /revoke sessions/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /synchronize roles/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /deactivate/i })).toBeNull();
    // And it says why, rather than leaving a gap.
    expect(screen.getByText(/no login account is linked to this record/i)).toBeVisible();
  });

  it('offers "Retry provisioning" instead of "Provision" after a failed attempt', () => {
    renderPanel(unprovisionedEmployeeFixture, failedProvisioningHistoryFixture);

    expect(screen.getByRole('button', { name: /retry provisioning/i })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^provision account$/i })).toBeNull();
  });

  it('never re-offers provisioning for a record that already has an account', () => {
    renderPanel();

    expect(screen.queryByRole('button', { name: /provision account/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /retry provisioning/i })).toBeNull();
  });

  it('blocks provisioning for a non-ACTIVE record, with the reason stated', () => {
    renderPanel({ ...unprovisionedEmployeeFixture, status: 'DISABLED' }, []);

    const button = screen.getByRole('button', { name: /provision account/i });
    expect(button).toBeDisabled();
    // A disabled control must carry a reason (DESIGN-SYSTEM §12).
    expect(screen.getByText(/provisioning requires an Active record/i)).toBeVisible();
  });

  it('withholds Deactivate and Offboard once the record is TERMINATED, with reasons', () => {
    renderPanel(terminatedEmployeeFixture, provisioningHistoryFixture);

    expect(screen.getByRole('button', { name: /deactivate/i })).toBeDisabled();
    expect(screen.getByText(/already Terminated/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /offboard employee|offboard/i })).toBeDisabled();
    expect(screen.getByText(/already been offboarded/i)).toBeVisible();
  });

  it('offers Reactivate for a deactivated record and never for a terminated one', async () => {
    const deactivated = { ...employeeFixture, status: 'DISABLED' as const };
    const { unmount } = renderPanel(deactivated, provisioningHistoryFixture);

    expect(await screen.findByRole('button', { name: /^reactivate$/i })).toBeEnabled();
    // Deactivate is not re-offered for a record that is already Disabled.
    expect(screen.queryByRole('button', { name: /^deactivate$/i })).toBeNull();
    unmount();

    renderPanel(terminatedEmployeeFixture, provisioningHistoryFixture);
    // Offboarding is terminal: the server answers 409, so the button is blocked
    // with the reason rather than hidden — the operator asked a fair question.
    expect(await screen.findByRole('button', { name: /^reactivate$/i })).toBeDisabled();
    expect(screen.getByText(/offboarding is terminal/i)).toBeVisible();
  });

  it('hides Unlock for an account that is not locked, and blocks it while employment says no', async () => {
    const { unmount } = renderPanel();
    // The live state says PROVISIONED — "unlocking" it would be a no-op the
    // operator would read as a failure.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /unlock account/i })).toBeNull(),
    );
    unmount();

    server.use(
      http.get(`${ADMIN}/:id/identity`, () =>
        HttpResponse.json({
          ...provisioningStatusFixture,
          employeeStatus: 'DISABLED',
          provisioningStatus: 'LOCKED',
        }),
      ),
    );
    renderPanel();

    // Wait for the live state to land — before it does the panel only knows the
    // employee row, which says ACTIVE and would leave the button enabled.
    expect(
      await screen.findByText(/sign-in stays closed while the record is Disabled/i),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: /unlock account/i })).toBeDisabled();
  });
});

/**
 * Deactivate and Offboard both disable the account and revoke the sessions, and
 * only one of them can be undone. If they look the same, the wrong one gets
 * pressed — so the difference is carried by the layout, not only by the
 * confirmation dialog.
 */
describe('the terminal action is separated from the reversible ones', () => {
  it('puts offboarding in its own danger zone and says why it is different', () => {
    renderPanel();

    const danger = screen.getByRole('region', { name: /danger zone/i });
    expect(within(danger).getByRole('button', { name: /^offboard$/i })).toBeVisible();
    // Twice over: the zone's own warning and the action row's.
    expect(within(danger).getAllByText(/no endpoint that reverses/i).length).toBe(2);

    // Deactivate is NOT in it: it is reversible, and it says so.
    const lifecycle = screen.getByRole('region', { name: /employment lifecycle/i });
    expect(within(lifecycle).getByRole('button', { name: /^deactivate$/i })).toBeVisible();
    expect(
      within(lifecycle).getByText(/reactivate restores both the record and the account/i),
    ).toBeVisible();
    expect(within(danger).queryByRole('button', { name: /^deactivate$/i })).toBeNull();
  });

  it('separates account security from the employment lifecycle', () => {
    renderPanel();

    const security = screen.getByRole('region', { name: /account security/i });
    for (const label of [
      /reset password/i,
      /^lock account$/i,
      /revoke sessions/i,
      /synchronize roles/i,
    ]) {
      expect(within(security).getByRole('button', { name: label })).toBeVisible();
    }
    // The distinction the section makes is a real one about what changes.
    expect(
      within(security).getByText(/none of these changes the employment record/i),
    ).toBeVisible();
    expect(within(security).queryByRole('button', { name: /^deactivate$/i })).toBeNull();
    expect(within(security).queryByRole('button', { name: /^offboard$/i })).toBeNull();
  });
});

describe('confirmations name the object and the consequences', () => {
  it('spells out what a password reset does — including that the password is never shown', async () => {
    renderPanel();

    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));
    const dialog = await screen.findByRole('alertdialog');

    expect(dialog).toHaveTextContent('Amina Berrada');
    expect(dialog).toHaveTextContent(employeeFixture.matricule);
    // The server generates no password, so the dialog must not imply there is
    // one to pass on — it points at Keycloak's own setup flow instead.
    expect(dialog).toHaveTextContent(/keycloak e-mails the employee a secure link/i);
    expect(dialog).toHaveTextContent(/you will not see the new password/i);
    // The ordering matters operationally: the credential dies before the mail is
    // attempted, which is why an undelivered mail is a lockout.
    expect(dialog).toHaveTextContent(/stops working immediately — this takes effect before the e-mail/i);
    expect(dialog).toHaveTextContent(/existing sessions are not revoked by this action/i);
  });

  it('sends the optional lock reason the backend records', async () => {
    let body: unknown;
    server.use(
      http.post(`${ADMIN}/:id/lock`, async ({ request }) => {
        body = await request.json();
        return Response.json(provisioningStatusFixture);
      }),
    );

    renderPanel();
    // Anchored: "Unlock account" also contains "lock account".
    await userEvent.click(screen.getByRole('button', { name: /^lock account$/i }));

    const dialog = await screen.findByRole('alertdialog');
    await userEvent.type(within(dialog).getByLabelText(/reason/i), 'Credential compromise');
    await userEvent.click(within(dialog).getByRole('button', { name: /^lock account$/i }));

    await waitFor(() => expect(body).toEqual({ reason: 'Credential compromise' }));
  });

  it('posts each action to its own endpoint', async () => {
    const called: string[] = [];
    server.use(
      http.post(`${ADMIN}/:id/:action`, ({ params }) => {
        called.push(String(params.action));
        return Response.json(provisioningStatusFixture);
      }),
    );

    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /revoke sessions/i }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /revoke sessions/i }));

    await waitFor(() => expect(called).toEqual(['revoke-sessions']));
  });

  it('reports the completed action rather than leaving the user guessing', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /revoke sessions/i }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /revoke sessions/i }));

    // The actions that send no mail keep the generic outcome; only the three
    // that do get bespoke copy.
    expect(await screen.findByText(/revoke sessions completed/i)).toBeVisible();
  });
});

describe('failures are read by kind — 502 is never 503', () => {
  it('tells the operator to review and retry on a 502', async () => {
    server.use(
      http.post(`${ADMIN}/:id/provision`, () =>
        problemResponse(
          502,
          {
            title: 'Provisioning failed',
            detail: 'provisioning failed for employee 77777777-7777-7777-7777-777777777777',
          },
          'corr-prov-502',
        ),
      ),
    );

    renderPanel(unprovisionedEmployeeFixture, []);
    await userEvent.click(screen.getByRole('button', { name: /provision account/i }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /provision account/i }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(/provisioning failed for employee/i);
    expect(alert).toHaveTextContent(/reached and rejected the operation/i);
    expect(alert).toHaveTextContent(/corr-prov-502/);
    // Never the 503 advice.
    expect(alert).not.toHaveTextContent(/could not be reached/i);
  });

  it('tells the operator to wait — and that nothing changed — on a 503', async () => {
    server.use(
      http.post(`${ADMIN}/:id/provision`, () =>
        problemResponse(503, {
          title: 'Identity provider unavailable',
          detail: 'keycloak is unreachable',
        }),
      ),
    );

    renderPanel(unprovisionedEmployeeFixture, []);
    await userEvent.click(screen.getByRole('button', { name: /provision account/i }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /provision account/i }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(/could not be reached, so nothing changed/i);
    expect(alert).not.toHaveTextContent(/review the record/i);
  });

  it('surfaces the 409 “Not provisioned” conflict verbatim if it ever arrives', async () => {
    server.use(
      http.post(`${ADMIN}/:id/reset-password`, () =>
        problemResponse(409, {
          title: 'Not provisioned',
          detail: 'employee 11111111-1111-1111-1111-111111111111 has no linked identity',
        }),
      ),
    );

    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /reset password/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/has no linked identity/i);
    // The dialog stays open so the answer is where the user is looking.
    expect(screen.getByRole('alertdialog')).toBeVisible();
  });
});

describe('offboarding', () => {
  it('promises only what the server will actually do for an unlinked record', async () => {
    renderPanel(unprovisionedEmployeeFixture, []);
    await userEvent.click(screen.getByRole('button', { name: /^offboard$/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/there is no login account to disable/i);
    expect(dialog).toHaveTextContent(/no downstream service is notified/i);
    // The linked-record promises must NOT appear.
    expect(dialog).not.toHaveTextContent(/every session and refresh token is revoked/i);
    expect(dialog).not.toHaveTextContent(/the leave, expense and document services are notified/i);
  });

  it('asks for the matricule before it will proceed', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /^offboard$/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/there is no endpoint that reverses it/i);

    const confirm = within(dialog).getByRole('button', { name: /offboard employee/i });
    expect(confirm).toBeDisabled();

    await userEvent.type(
      within(dialog).getByLabelText(new RegExp(`type ${employeeFixture.matricule}`, 'i')),
      employeeFixture.matricule,
    );
    expect(confirm).toBeEnabled();
  });

  it('renders a complete fan-out as complete', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /^offboard$/i }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.type(
      within(dialog).getByLabelText(new RegExp(`type ${employeeFixture.matricule}`, 'i')),
      employeeFixture.matricule,
    );
    await userEvent.click(within(dialog).getByRole('button', { name: /offboard employee/i }));

    expect(await screen.findByText(/amina berrada was offboarded$/i)).toBeVisible();
    expect(screen.getByText(/leave-service notified/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: /retry offboarding/i })).toBeNull();
  });

  it('renders a partial fan-out as PARTIAL, and offers the only retry the backend has', async () => {
    server.use(http.post(`${ADMIN}/:id/offboard`, () => Response.json(offboardingPartialFixture)));

    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: /^offboard$/i }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.type(
      within(dialog).getByLabelText(new RegExp(`type ${employeeFixture.matricule}`, 'i')),
      employeeFixture.matricule,
    );
    await userEvent.click(within(dialog).getByRole('button', { name: /offboard employee/i }));

    expect(await screen.findByText(/was offboarded, with failures/i)).toBeVisible();
    expect(screen.getByText(/expense-service was not notified/i)).toBeVisible();
    expect(screen.getByText(/no per-service retry endpoint/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /retry offboarding/i })).toBeVisible();
  });
});

describe('offboarding result panel — every notified/failed combination', () => {
  const base = {
    employeeId: employeeFixture.id,
    keycloakId: employeeFixture.keycloakId,
    identityDisabled: true,
    notified: [] as string[],
    failed: [] as string[],
  };

  it('announces itself politely, because the user did not watch it happen', () => {
    const { container } = renderWithProviders(
      <OffboardingResultPanel
        outcome={{ ...base, notified: ['leave-service'] }}
        employeeName="Amina Berrada"
        onRetry={() => undefined}
        onDismiss={() => undefined}
      />,
    );
    expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument();
  });

  it('explains an undisabled identity differently when no account was ever linked', () => {
    renderWithProviders(
      <OffboardingResultPanel
        outcome={{ ...base, keycloakId: null, identityDisabled: false }}
        employeeName="Hana Mansouri"
        onRetry={() => undefined}
        onDismiss={() => undefined}
      />,
    );
    expect(screen.getByText(/no account was ever linked/i)).toBeVisible();
    expect(screen.getByText(/nothing to fan out to/i)).toBeVisible();
  });

  it('does NOT call it a success when the account was not disabled, even with a clean fan-out', () => {
    renderWithProviders(
      <OffboardingResultPanel
        outcome={{
          // Keycloak refused or was unreachable; the fan-out still ran cleanly.
          ...base,
          identityDisabled: false,
          notified: ['leave-service', 'expense-service', 'documents-service'],
          failed: [],
        }}
        employeeName="Amina Berrada"
        onRetry={() => undefined}
        onDismiss={() => undefined}
      />,
    );

    // The heading itself has to carry it: this is the platform's central
    // security guarantee, and reporting it as delivered would be a lie.
    expect(screen.getByRole('heading', { name: /their access may not be revoked/i })).toBeVisible();
    expect(screen.getByText(/treat this person as still having access/i)).toBeVisible();
    expect(screen.getByText(/the account may still be enabled/i)).toBeVisible();
    // And the retry the row note tells them to use is actually offered.
    expect(screen.getByRole('button', { name: /retry offboarding/i })).toBeVisible();
  });

  it('reports a clean offboarding as clean, with no retry', () => {
    renderWithProviders(
      <OffboardingResultPanel
        outcome={{ ...base, notified: ['leave-service'] }}
        employeeName="Amina Berrada"
        onRetry={() => undefined}
        onDismiss={() => undefined}
      />,
    );
    expect(screen.getByRole('heading', { name: /was offboarded$/i })).toBeVisible();
    expect(screen.queryByRole('button', { name: /retry offboarding/i })).toBeNull();
  });

  it('states each outcome in words, not only by colour', () => {
    renderWithProviders(
      <OffboardingResultPanel
        outcome={{ ...base, notified: ['leave-service'], failed: ['expense-service'] }}
        employeeName="Amina Berrada"
        onRetry={() => undefined}
        onDismiss={() => undefined}
      />,
    );
    expect(screen.getAllByText('Done').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0);
  });
});

describe('provisioning history', () => {
  it('renders the append-only journal with no edit, delete or paging affordance', async () => {
    const { container } = renderWithProviders(
      <ProvisioningHistoryPanel employeeId={employeeFixture.id} />,
      { role: 'HR' },
    );

    expect(await screen.findByText('ONBOARD')).toBeVisible();
    expect(screen.getByText('role=EMPLOYEE')).toBeVisible();
    expect(screen.queryByRole('navigation', { name: /pagination/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /delete|edit/i })).toBeNull();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows the record status literal rather than badging a different enum', async () => {
    renderWithProviders(<ProvisioningHistoryPanel employeeId={employeeFixture.id} />, {
      role: 'HR',
    });
    // SYNCED belongs to ProvisioningRecordStatus, which the §2.4 badge map does
    // not cover — it must appear verbatim, not as an invented label.
    expect(await screen.findByText('SYNCED')).toBeVisible();
  });

  it('states an empty journal as a fact, not a failure', async () => {
    server.use(http.get(`${ADMIN}/:id/provisioning`, () => Response.json([])));

    renderWithProviders(<ProvisioningHistoryPanel employeeId={employeeFixture.id} />, {
      role: 'HR',
    });
    expect(await screen.findByText(/no provisioning events yet/i)).toBeVisible();
  });

  it('renders a 403 inline with the server’s wording', async () => {
    server.use(
      http.get(`${ADMIN}/:id/provisioning`, () =>
        problemResponse(403, { detail: 'Requires role HR' }, 'corr-hist-403'),
      ),
    );

    renderWithProviders(<ProvisioningHistoryPanel employeeId={employeeFixture.id} />, {
      role: 'HR',
    });
    expect(await screen.findByText('Requires role HR')).toBeVisible();
    expect(screen.getByText(/corr-hist-403/)).toBeVisible();
  });
});

describe('security events', () => {
  it('shows who performed each action, including the system actor', async () => {
    renderWithProviders(
      <SecurityEventsPanel
        employeeId={employeeFixture.id}
        keycloakId={employeeFixture.keycloakId}
      />,
      { role: 'HR' },
    );

    expect(await screen.findByText('PASSWORD_RESET')).toBeVisible();
    // `hr.admin` has no employee record in this realm, so the login stands —
    // the trail still answers "who", it just cannot answer it with a name.
    expect(await screen.findByText('hr.admin')).toBeVisible();
    // `system` is the platform acting on its own, not a person we failed to find.
    expect(screen.getByText('System')).toBeVisible();
    expect(screen.getByText(/automated platform action/i)).toBeVisible();
    expect(screen.getByText(securityEventsFixture[0]!.detail!)).toBeVisible();
  });

  it('explains an empty trail differently when there is no account to key it to', async () => {
    server.use(http.get(`${ADMIN}/:id/security-events`, () => Response.json([])));

    const { unmount } = renderWithProviders(
      <SecurityEventsPanel
        employeeId={employeeFixture.id}
        keycloakId={employeeFixture.keycloakId}
      />,
      { role: 'HR' },
    );
    expect(await screen.findByText(/nothing has been done to this account/i)).toBeVisible();
    unmount();

    renderWithProviders(
      <SecurityEventsPanel employeeId={unprovisionedEmployeeFixture.id} keycloakId={null} />,
      { role: 'HR' },
    );
    expect(await screen.findByText(/this record has none yet/i)).toBeVisible();
  });
});

describe('employee sessions (admin view)', () => {
  it('lists the account’s sessions read-only, and says where force-logout lives', async () => {
    const { container } = renderWithProviders(
      <EmployeeSessionsPanel
        employeeId={employeeFixture.id}
        keycloakId={employeeFixture.keycloakId}
      />,
      { role: 'HR' },
    );

    expect(await screen.findByText(sessionsFixture[0]!.ipAddress!)).toBeVisible();
    expect(screen.getByText(/no endpoint to end one specific session/i)).toBeVisible();
    // There is no endpoint to end one session for another person, so there is
    // no control that claims to.
    expect(screen.queryByRole('button', { name: /end (this )?session/i })).toBeNull();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('describes a device exactly as the person’s own sessions page does', async () => {
    renderWithProviders(
      <EmployeeSessionsPanel
        employeeId={employeeFixture.id}
        keycloakId={employeeFixture.keycloakId}
      />,
      { role: 'HR' },
    );

    // The SHARED SessionCard: one wording for both surfaces. Fixture 0 has a
    // browser and an OS; fixture 1 has neither, and is never given an invented
    // name.
    expect(await screen.findByText('Firefox on Ubuntu')).toBeVisible();
    expect(screen.getByText('Unknown device')).toBeVisible();
    // MFA is stated, not hidden — the realm does not implement it (P3.5).
    expect(screen.getAllByText('No MFA on this session').length).toBe(2);
  });

  it('states that MFA is simply not enabled in this realm', async () => {
    renderWithProviders(
      <EmployeeSessionsPanel
        employeeId={employeeFixture.id}
        keycloakId={employeeFixture.keycloakId}
      />,
      { role: 'HR' },
    );
    expect(
      await screen.findByText(/multi-factor authentication is not enabled in this realm/i),
    ).toBeVisible();
  });

  it('does not pretend an unprovisioned record has sessions', () => {
    renderWithProviders(
      <EmployeeSessionsPanel employeeId={unprovisionedEmployeeFixture.id} keycloakId={null} />,
      { role: 'HR' },
    );
    expect(screen.getByText(/no login account, so no sessions/i)).toBeVisible();
  });
});
