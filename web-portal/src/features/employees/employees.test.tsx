import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { env } from '@/config/env';
import {
  departmentFixtures,
  employeeFixture,
  pageOf,
  unprovisionedEmployeeFixture,
} from '@/shared/testing/msw/fixtures';
import { problemResponse } from '@/shared/testing/msw/problem';
import { server } from '@/shared/testing/msw/server';
import { renderAtRoute, renderWithProviders } from '@/shared/testing/render';
import { setViewport } from '@/shared/testing/setup';

import { EmployeeDirectoryPage } from './pages/EmployeeDirectoryPage';

/**
 * P16 — Employee directory. The tests pin the three things this screen is most
 * likely to get wrong: that everything is server-driven, that the catalogue join
 * is honest about what it could not resolve, and that the provisioning column
 * the specification asks for is NOT faked from data the endpoint does not return.
 */

const EMPLOYEES = `${env.apiBaseUrl}/api/hr/employees`;
const DEPARTMENTS = `${env.apiBaseUrl}/api/hr/departments`;

describe('employee directory (P16)', () => {
  it('renders the server page with catalogue-joined labels', async () => {
    const { container } = renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });

    expect(await screen.findByText('Amina Berrada')).toBeVisible();
    expect(screen.getByText('EMP-0042')).toBeVisible();

    // departmentId/positionId are raw UUIDs on the row; HR can read the
    // catalogues, so the label is joined rather than invented. Scoped to the
    // table because the same names are also filter options.
    const table = screen.getByRole('table', { name: /employee directory/i });
    expect(await within(table).findByText('Engineering')).toBeVisible();
    expect(within(table).getByText('Senior Engineer')).toBeVisible();
    // The second row resolves to a DIFFERENT pair — one lookup per row, not one
    // label reused for the page.
    expect(within(table).getByText('People Operations')).toBeVisible();
    expect(within(table).getByText('HR Business Partner')).toBeVisible();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('offers sort affordances only on EmployeeController.SORTABLE columns', async () => {
    renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });
    await screen.findByText('Amina Berrada');

    const table = screen.getByRole('table', { name: /employee directory/i });
    expect(within(table).getByRole('button', { name: /employee/i })).toBeVisible();
    expect(within(table).getByRole('button', { name: /work email/i })).toBeVisible();
    expect(within(table).getByRole('button', { name: /hire date/i })).toBeVisible();
    expect(within(table).getByRole('button', { name: /status/i })).toBeVisible();
    // Department, Position and Account are not sortable server-side.
    expect(within(table).queryByRole('button', { name: /department/i })).toBeNull();
    expect(within(table).queryByRole('button', { name: /position/i })).toBeNull();
    expect(within(table).queryByRole('button', { name: /account/i })).toBeNull();
  });

  it('states whether an account is LINKED, and never claims a provisioning state per row', async () => {
    renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });
    await screen.findByText('Amina Berrada');

    const table = screen.getByRole('table', { name: /employee directory/i });
    // keycloakId present vs null — the only identity fact EmployeeResponse carries.
    expect(within(table).getByText('Linked')).toBeVisible();
    expect(within(table).getByText('Not linked')).toBeVisible();

    // No ROW claims a ProvisioningStatus literal: the DTO has none. (The filter
    // select offers them, because the endpoint accepts them as a filter.)
    expect(within(table).queryByText(/^provisioned$/i)).toBeNull();
    expect(within(table).queryByText(/^not provisioned$/i)).toBeNull();
    expect(within(table).queryByText(/^provisioning failed$/i)).toBeNull();

    // And the page says so rather than leaving the gap unexplained.
    expect(screen.getByText(/it is not returned per row/i)).toBeVisible();
  });

  it('has no bulk selection, because the platform has no bulk endpoint', async () => {
    renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });
    await screen.findByText('Amina Berrada');

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('links each row to its detail page', async () => {
    renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });

    const link = await screen.findByRole('link', { name: /amina berrada/i });
    expect(link).toHaveAttribute('href', `/hr/employees/${employeeFixture.id}`);
  });

  it('sends page, size and the endpoint default sort', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(EMPLOYEES, ({ request }) => {
        requests.push(new URL(request.url));
        return Response.json(pageOf([employeeFixture], { totalElements: 137 }));
      }),
    );

    renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });
    await screen.findByText('Amina Berrada');

    const first = requests[0];
    expect(first?.searchParams.get('page')).toBe('0');
    expect(first?.searchParams.get('size')).toBe('20');
    expect(first?.searchParams.get('sort')).toBe('matricule,asc');
    expect(screen.getByText(/showing 1–1 of 137 employees/i)).toBeVisible();
  });

  it('narrows server-side on every filter the controller accepts, and puts them in the URL', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(EMPLOYEES, ({ request }) => {
        requests.push(new URL(request.url));
        return Response.json(pageOf([employeeFixture]));
      }),
    );

    const { router } = renderAtRoute('/hr/employees', <EmployeeDirectoryPage />, {
      role: 'HR',
      route: '/hr/employees',
    });
    await screen.findByText('Amina Berrada');

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'ACTIVE');
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('status')).toBe('ACTIVE'));

    await userEvent.selectOptions(screen.getByLabelText('Provisioning'), 'FAILED');
    await waitFor(() =>
      expect(requests.at(-1)?.searchParams.get('provisioningStatus')).toBe('FAILED'),
    );

    await userEvent.selectOptions(
      screen.getByLabelText('Department'),
      employeeFixture.departmentId,
    );
    await waitFor(() =>
      expect(requests.at(-1)?.searchParams.get('departmentId')).toBe(employeeFixture.departmentId),
    );

    expect(router.state.location.search).toContain('status=ACTIVE');
    expect(router.state.location.search).toContain('provisioningStatus=FAILED');
  });

  it('sends the search term to the server rather than filtering the page it was given', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(EMPLOYEES, ({ request }) => {
        requests.push(new URL(request.url));
        return Response.json(pageOf([employeeFixture, unprovisionedEmployeeFixture]));
      }),
    );

    renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });
    await screen.findByText('Amina Berrada');

    await userEvent.type(screen.getByLabelText(/search the directory/i), 'berrada');
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('search')).toBe('berrada'));
    // Both rows are still on screen: the client did not slice the server's page.
    expect(screen.getByText('Hana Mansouri')).toBeVisible();
  });

  it('changes the sort through the server, on the whitelisted property name', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(EMPLOYEES, ({ request }) => {
        requests.push(new URL(request.url));
        return Response.json(pageOf([employeeFixture]));
      }),
    );

    renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });
    await screen.findByText('Amina Berrada');

    const table = screen.getByRole('table', { name: /employee directory/i });
    await userEvent.click(within(table).getByRole('button', { name: /hire date/i }));

    await waitFor(() => expect(requests.at(-1)?.searchParams.get('sort')).toBe('hireDate,asc'));
  });
});

describe('employee directory — catalogue joins', () => {
  it('says a reference is genuinely dangling when the catalogue loaded without it', async () => {
    // The catalogue ARRIVED and does not contain the row's departmentId.
    server.use(http.get(DEPARTMENTS, () => Response.json(pageOf([]))));

    renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });
    await screen.findByText('Amina Berrada');

    expect((await screen.findAllByText(/not in the catalogue/i)).length).toBeGreaterThan(0);
  });

  it('never reports a FAILED catalogue fetch as a missing reference', async () => {
    server.use(
      http.get(DEPARTMENTS, () =>
        problemResponse(503, { detail: 'hr-db is unreachable' }, 'corr-cat-503'),
      ),
    );

    renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });
    await screen.findByText('Amina Berrada');

    // "Nothing is known" and "the entry does not exist" are different facts.
    expect((await screen.findAllByText('Name unavailable')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/not in the catalogue/i)).toBeNull();

    // And the cause is stated once, with a way to retry and the correlation id.
    expect(screen.getByText(/department and position names could not be loaded/i)).toBeVisible();
    expect(screen.getByText(/corr-cat-503/)).toBeVisible();
    expect(screen.getByRole('button', { name: /retry/i })).toBeVisible();
  });

  it('admits when the catalogue is larger than one clamped page', async () => {
    server.use(
      http.get(DEPARTMENTS, () =>
        Response.json(pageOf(departmentFixtures, { totalElements: 640, size: 200 })),
      ),
    );

    renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });

    expect(await screen.findByText(/not every catalogue entry is listed/i)).toBeVisible();
  });
});

describe('employee directory — accessibility of the filter bar', () => {
  it('gives the manager filter a real label, not a wrapper aria-labelledby', async () => {
    renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });
    await screen.findByText('Amina Berrada');

    // A <label for> that actually names the control, like every sibling filter.
    expect(screen.getByLabelText('Reports to')).toBeVisible();
  });
});

describe('employee directory — states', () => {
  it('distinguishes an empty workforce from filters that matched nothing', async () => {
    server.use(http.get(EMPLOYEES, () => Response.json(pageOf([]))));

    const { unmount } = renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });
    expect(await screen.findByText(/no employees yet/i)).toBeVisible();
    unmount();

    renderWithProviders(<EmployeeDirectoryPage />, {
      role: 'HR',
      route: '/hr/employees?status=TERMINATED',
    });
    expect(await screen.findByText(/no employees match these filters/i)).toBeVisible();
  });

  it('renders a 403 inline with the server’s own wording, never a redirect', async () => {
    server.use(
      http.get(EMPLOYEES, () =>
        problemResponse(403, { detail: 'Access is denied' }, 'corr-emp-403'),
      ),
    );

    renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });

    expect(await screen.findByText('Access is denied')).toBeVisible();
    expect(screen.getByText(/corr-emp-403/)).toBeVisible();
    expect(screen.getByText(/you are signed in/i)).toBeVisible();
  });

  it('offers a retry with the correlation id when the directory fails', async () => {
    server.use(
      http.get(EMPLOYEES, () =>
        problemResponse(500, { detail: 'hr-service is unhappy' }, 'corr-emp-500'),
      ),
    );

    renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });

    expect(await screen.findByRole('alert')).toHaveTextContent(/hr-service is unhappy/i);
    expect(screen.getByText(/corr-emp-500/)).toBeVisible();
    expect(screen.getByRole('button', { name: /retry/i })).toBeVisible();
  });

  it('keeps 503 “wait” apart from a generic failure', async () => {
    server.use(
      http.get(EMPLOYEES, () =>
        problemResponse(503, {
          title: 'Identity provider unavailable',
          detail: 'keycloak is down',
        }),
      ),
    );

    renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });
    expect(await screen.findByText(/dependency being unreachable/i)).toBeVisible();
  });

  it('shows a layout-shaped skeleton while loading, never a spinner', () => {
    const { container } = renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('employee directory — below md', () => {
  it('becomes priority-field cards, never a sideways-scrolling table', async () => {
    setViewport(375);
    const { container } = renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });

    await screen.findByText('Amina Berrada');
    expect(screen.queryByRole('table')).toBeNull();

    const cards = screen.getAllByRole('listitem');
    const card = cards[0];
    expect(card).toBeDefined();
    // Priority fields only — a phone must not show MORE than a tablet.
    expect(within(card!).getByText('Department')).toBeVisible();
    expect(within(card!).getByText('Status')).toBeVisible();
    expect(within(card!).getByText('Account')).toBeVisible();
    expect(within(card!).queryByText('Work email')).toBeNull();
    expect(within(card!).queryByText('Hire date')).toBeNull();

    expect(await axe(container)).toHaveNoViolations();
  });
});
