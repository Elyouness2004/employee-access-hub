import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { env } from '@/config/env';
import {
  employeeFixture,
  pageOf,
  unprovisionedEmployeeFixture,
} from '@/shared/testing/msw/fixtures';
import { problemResponse } from '@/shared/testing/msw/problem';
import { server } from '@/shared/testing/msw/server';
import { renderAtRoute } from '@/shared/testing/render';
import { setViewport } from '@/shared/testing/setup';

import { EmployeeDetailPage } from './EmployeeDetailPage';

/**
 * P17 — the employee detail page. It composes the `employees` and `identity`
 * features, so the tests check the composition itself: that the record header
 * and the identity tab agree, that the two identifiers stay distinct, and that
 * the open tab is a deep link.
 */

const EMPLOYEES = `${env.apiBaseUrl}/api/hr/employees`;
const DEPARTMENTS = `${env.apiBaseUrl}/api/hr/departments`;

function renderDetail(id = employeeFixture.id, search = '') {
  return renderAtRoute('/hr/employees/:id', <EmployeeDetailPage />, {
    role: 'HR',
    route: `/hr/employees/${id}${search}`,
  });
}

describe('employee detail (P17)', () => {
  it('renders the record header with the status and the account link', async () => {
    const { container } = renderDetail();

    expect(await screen.findByRole('heading', { level: 1, name: 'Amina Berrada' })).toBeVisible();
    expect(screen.getAllByText('EMP-0042').length).toBeGreaterThan(0);
    expect(screen.getByText('Account linked')).toBeVisible();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('says "No account linked" for a record provisioning has not reached', async () => {
    renderDetail(unprovisionedEmployeeFixture.id);

    expect(await screen.findByText('No account linked')).toBeVisible();
  });

  /**
   * The two ids stay on the page and stay distinguishable — they are what
   * support and investigation paste — but they sit in their own secondary
   * section, below the record, each with a copy action and a sentence saying
   * what it is. Neither is ever this person's headline.
   */
  it('keeps the employee id and the Keycloak id visibly distinct, and secondary', async () => {
    renderDetail();
    await screen.findByRole('heading', { level: 1, name: 'Amina Berrada' });

    const identifiers = screen.getByRole('region', { name: /technical identifiers/i });
    expect(within(identifiers).getByText('Employee id')).toBeVisible();
    expect(within(identifiers).getByText(employeeFixture.id)).toBeVisible();
    expect(within(identifiers).getByText('Keycloak id')).toBeVisible();
    expect(within(identifiers).getByText(employeeFixture.keycloakId!)).toBeVisible();

    // Each is copyable, and named so the two buttons are distinguishable.
    expect(within(identifiers).getByRole('button', { name: /copy employee id/i })).toBeVisible();
    expect(within(identifiers).getByRole('button', { name: /copy keycloak id/i })).toBeVisible();

    // The heading of the page is the person, never an identifier.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Amina Berrada');
  });

  /** The facts an HR user scans for are answered before any tab is opened. */
  it('answers the scannable questions in the header', async () => {
    renderDetail();
    await screen.findByRole('heading', { level: 1, name: 'Amina Berrada' });

    const header = screen.getByRole('region', { name: 'Amina Berrada' });
    expect(within(header).getByText('EMP-0042')).toBeVisible();
    expect(within(header).getByText(employeeFixture.email)).toBeVisible();
    expect(within(header).getByText('Account linked')).toBeVisible();
    // Position and department are the header's subtitle; the catalogues resolve
    // them asynchronously, so this is the assertion that waits.
    expect(await within(header).findByText(/Senior Engineer · Engineering/)).toBeVisible();
    // No raw identifier in the header — that is the identifiers section's job.
    expect(within(header).queryByText(employeeFixture.keycloakId!)).toBeNull();
  });

  it('joins the catalogue labels on the profile tab and links the manager', async () => {
    renderDetail();
    await screen.findByRole('heading', { level: 1, name: 'Amina Berrada' });

    // The header names them too, so the profile panel's own copies are scoped.
    const record = await screen.findByRole('region', { name: /employment record/i });
    expect(within(record).getByText('Engineering')).toBeVisible();
    expect(within(record).getByText('Senior Engineer')).toBeVisible();
    expect(await screen.findByRole('link', { name: /youssef alami/i })).toHaveAttribute(
      'href',
      `/hr/employees/${employeeFixture.managerId}`,
    );
  });

  it('says a catalogue reference is genuinely dangling when the catalogue loaded without it', async () => {
    server.use(http.get(DEPARTMENTS, () => Response.json(pageOf([]))));

    renderDetail();
    await screen.findByRole('heading', { level: 1, name: 'Amina Berrada' });

    expect(await screen.findByText(/not in the catalogue/i)).toBeVisible();
  });

  it('never reports a FAILED catalogue fetch as a missing reference', async () => {
    server.use(
      http.get(DEPARTMENTS, () =>
        problemResponse(503, { detail: 'hr-db is unreachable' }, 'corr-p17-503'),
      ),
    );

    renderDetail();
    await screen.findByRole('heading', { level: 1, name: 'Amina Berrada' });

    // "Nothing is known" is not "the department does not exist".
    expect(await screen.findByText('Name unavailable')).toBeVisible();
    expect(screen.queryByText(/not in the catalogue/i)).toBeNull();
    // The cause is stated once, with the correlation id and a retry.
    expect(screen.getByText(/department and position names could not be loaded/i)).toBeVisible();
    expect(screen.getByText(/corr-p17-503/)).toBeVisible();
  });

  it('says "Nobody" for a record at the top of the reporting line', async () => {
    renderDetail(unprovisionedEmployeeFixture.id);
    await screen.findByRole('heading', { level: 1, name: 'Hana Mansouri' });

    expect(screen.getByText(/top of the reporting line/i)).toBeVisible();
  });
});

describe('employee detail — tabs', () => {
  it('offers the five sections and switches between them', async () => {
    renderDetail();
    await screen.findByRole('heading', { level: 1, name: 'Amina Berrada' });

    const tabs = screen.getByRole('tablist', { name: /employee detail sections/i });
    for (const label of [
      'Profile',
      'Identity',
      'Provisioning history',
      'Security events',
      'Sessions',
    ]) {
      expect(within(tabs).getByRole('tab', { name: label })).toBeVisible();
    }

    await userEvent.click(within(tabs).getByRole('tab', { name: 'Security events' }));
    expect(await screen.findByText('PASSWORD_RESET')).toBeVisible();
  });

  it('opens the tab named in the URL, so the directory can deep-link to Identity', async () => {
    renderDetail(employeeFixture.id, '?tab=identity');

    expect(await screen.findByText(/identity state/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /reset password/i })).toBeVisible();
  });

  it('puts the chosen tab into the URL', async () => {
    const { router } = renderDetail();
    await screen.findByRole('heading', { level: 1, name: 'Amina Berrada' });

    await userEvent.click(screen.getByRole('tab', { name: 'Sessions' }));
    await waitFor(() => expect(router.state.location.search).toContain('tab=sessions'));
  });

  it('falls back to the profile tab for an unknown tab name in the URL', async () => {
    renderDetail(employeeFixture.id, '?tab=nonsense');

    expect(await screen.findByText('Employment record')).toBeVisible();
  });
});

describe('employee detail — below md', () => {
  it('becomes an accordion, not a five-tab strip the page has to scroll to reach', async () => {
    setViewport(375);
    const { container } = renderDetail();
    await screen.findByRole('heading', { level: 1, name: 'Amina Berrada' });

    // FRONTEND-SPECIFICATION §7: "employee detail tabs become an accordion".
    expect(screen.queryByRole('tablist')).toBeNull();
    const sections = container.querySelectorAll('details');
    expect(sections).toHaveLength(5);

    // Exactly one open, and it is the one the URL names.
    expect(container.querySelectorAll('details[open]')).toHaveLength(1);
    expect(screen.getByText('Employment record')).toBeVisible();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('switches sections and keeps the URL as the source of truth', async () => {
    setViewport(375);
    const { router } = renderDetail();
    await screen.findByRole('heading', { level: 1, name: 'Amina Berrada' });

    await userEvent.click(screen.getByText('Security events'));

    await waitFor(() => expect(router.state.location.search).toContain('tab=security'));
    // Below md the trail is cards, whose title and "Event" field are the same
    // machine literal — so more than one node carries it.
    expect((await screen.findAllByText('PASSWORD_RESET')).length).toBeGreaterThan(0);
    // Still single-open: the previous section closed.
    expect(screen.queryByText('Employment record')).toBeNull();
  });

  it('opens the section a deep link names', async () => {
    setViewport(375);
    renderDetail(employeeFixture.id, '?tab=identity');

    expect(await screen.findByText(/identity state/i)).toBeVisible();
  });
});

describe('employee detail — states', () => {
  it('renders a 404 as "no such employee", with a way back', async () => {
    server.use(
      http.get(`${EMPLOYEES}/:id`, () =>
        problemResponse(404, { title: 'Resource not found', detail: 'employee not found' }),
      ),
    );

    renderDetail();

    expect(await screen.findByText(/no such employee/i)).toBeVisible();
    expect(screen.getByRole('link', { name: /back to the directory/i })).toHaveAttribute(
      'href',
      '/hr/employees',
    );
  });

  it('renders a 403 inline with the server’s wording, never a redirect', async () => {
    server.use(
      http.get(`${EMPLOYEES}/:id`, () =>
        problemResponse(403, { detail: 'Access is denied' }, 'corr-detail-403'),
      ),
    );

    renderDetail();

    expect(await screen.findByText('Access is denied')).toBeVisible();
    expect(screen.getByText(/corr-detail-403/)).toBeVisible();
  });

  it('shows a layout-shaped skeleton while the record loads', () => {
    const { container } = renderDetail();
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('employee detail — editing', () => {
  it('opens the record form pre-loaded from the detail page', async () => {
    renderDetail();
    await screen.findByRole('heading', { level: 1, name: 'Amina Berrada' });

    await userEvent.click(screen.getByRole('button', { name: /edit record/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/matricule/i)).toHaveValue('EMP-0042');
    expect(within(dialog).getByLabelText(/work email/i)).toHaveValue(employeeFixture.email);
  });
});
