import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { env } from '@/config/env';
import {
  departmentFixtures,
  employeeFixture,
  pageOf,
  positionFixtures,
  unprovisionedEmployeeFixture,
} from '@/shared/testing/msw/fixtures';
import { problemResponse } from '@/shared/testing/msw/problem';
import { server } from '@/shared/testing/msw/server';
import { renderWithProviders } from '@/shared/testing/render';

import { EmployeeDirectoryPage } from './pages/EmployeeDirectoryPage';

/**
 * Employee create / edit / delete (P16), and the manager picker.
 *
 * The form is the front door to the identity lifecycle, so the tests care as
 * much about what it SAYS will happen as about what it posts: creating an ACTIVE
 * record requests a Keycloak account after the save, and the save succeeding is
 * not the same as the account existing.
 */

const EMPLOYEES = `${env.apiBaseUrl}/api/hr/employees`;
const DEPARTMENTS = `${env.apiBaseUrl}/api/hr/departments`;

async function openCreateForm() {
  renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });
  await screen.findByText('Amina Berrada');
  await userEvent.click(screen.getByRole('button', { name: /new employee/i }));
  return screen.findByRole('dialog');
}

async function fillValidEmployee(dialog: HTMLElement) {
  await userEvent.type(within(dialog).getByLabelText(/matricule/i), 'EMP-0500');
  await userEvent.type(within(dialog).getByLabelText(/first name/i), 'Yasmine');
  await userEvent.type(within(dialog).getByLabelText(/last name/i), 'Cherkaoui');
  await userEvent.type(within(dialog).getByLabelText(/work email/i), 'yasmine@example.com');
  await userEvent.type(within(dialog).getByLabelText(/hire date/i), '2026-02-01');
  await userEvent.selectOptions(
    within(dialog).getByLabelText(/^department/i),
    departmentFixtures[0]!.id,
  );
  await userEvent.selectOptions(
    within(dialog).getByLabelText(/^position/i),
    positionFixtures[0]!.id,
  );
}

describe('employee create', () => {
  it('states every constraint before the user can break it, and is accessible', async () => {
    const dialog = await openCreateForm();

    expect(within(dialog).getByLabelText(/matricule/i)).toBeVisible();
    expect(dialog).toHaveTextContent(/up to 32 characters. Must be unique/i);
    expect(dialog).toHaveTextContent(/today or earlier/i);
    expect(dialog).toHaveTextContent(/also becomes the Keycloak username/i);

    expect(await axe(dialog)).toHaveNoViolations();
  });

  it('warns that an ACTIVE record requests a login account, and where the outcome lands', async () => {
    const dialog = await openCreateForm();

    // ACTIVE is the default, and no account is linked on a new record.
    expect(dialog).toHaveTextContent(/saving this will request a login account/i);
    expect(dialog).toHaveTextContent(/runs after the save and can fail on its own/i);

    await userEvent.selectOptions(within(dialog).getByLabelText(/record status/i), 'DISABLED');
    await waitFor(() =>
      expect(dialog).not.toHaveTextContent(/saving this will request a login account/i),
    );
  });

  it('validates client-side before troubling the server', async () => {
    let posted = 0;
    server.use(
      http.post(EMPLOYEES, () => {
        posted += 1;
        return Response.json(employeeFixture);
      }),
    );

    const dialog = await openCreateForm();
    await userEvent.click(within(dialog).getByRole('button', { name: /create employee/i }));

    expect(await within(dialog).findByText(/enter the payroll matricule/i)).toBeVisible();
    expect(within(dialog).getByText(/enter a work email address/i)).toBeVisible();
    expect(
      within(dialog).getByText(/select the department this employee belongs to/i),
    ).toBeVisible();
    expect(posted).toBe(0);
  });

  it('rejects a future hire date, mirroring @PastOrPresent', async () => {
    const dialog = await openCreateForm();
    await fillValidEmployee(dialog);

    const hireDate = within(dialog).getByLabelText(/hire date/i);
    await userEvent.clear(hireDate);
    await userEvent.type(hireDate, '2099-01-01');
    await userEvent.click(within(dialog).getByRole('button', { name: /create employee/i }));

    expect(await within(dialog).findByText(/hire date cannot be in the future/i)).toBeVisible();
  });

  it('posts the EmployeeRequest shape, with a null manager when none was chosen', async () => {
    let body: unknown;
    server.use(
      http.post(EMPLOYEES, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...employeeFixture, keycloakId: null }, { status: 201 });
      }),
    );

    const dialog = await openCreateForm();
    await fillValidEmployee(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: /create employee/i }));

    await waitFor(() =>
      expect(body).toEqual({
        matricule: 'EMP-0500',
        firstName: 'Yasmine',
        lastName: 'Cherkaoui',
        email: 'yasmine@example.com',
        hireDate: '2026-02-01',
        status: 'ACTIVE',
        departmentId: departmentFixtures[0]!.id,
        positionId: positionFixtures[0]!.id,
        managerId: null,
      }),
    );
  });

  it('tells the user provisioning was requested — not that the account exists', async () => {
    const dialog = await openCreateForm();
    await fillValidEmployee(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: /create employee/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(await screen.findByText(/requested a keycloak account after saving/i)).toBeVisible();
    expect(screen.getByRole('link', { name: /check the identity tab/i })).toHaveAttribute(
      'href',
      `/hr/employees/${employeeFixture.id}?tab=identity`,
    );
  });

  it('lands a 409 duplicate on the field that collided, and keeps every other value', async () => {
    server.use(
      http.post(EMPLOYEES, () =>
        problemResponse(
          409,
          { title: 'Conflict', detail: 'matricule already exists: EMP-0500' },
          'corr-emp-409',
        ),
      ),
    );

    const dialog = await openCreateForm();
    await fillValidEmployee(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: /create employee/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'matricule already exists: EMP-0500',
    );
    expect(within(dialog).getByLabelText(/matricule/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/corr-emp-409/)).toBeVisible();
    // Nothing is retyped after a rejection.
    expect(within(dialog).getByLabelText(/first name/i)).toHaveValue('Yasmine');
  });

  it('renders a 422 invalid reference as the server’s own sentence', async () => {
    server.use(
      http.post(EMPLOYEES, () =>
        problemResponse(422, {
          title: 'Invalid reference',
          detail: 'department 33333333-3333-3333-3333-333333333333 does not exist',
        }),
      ),
    );

    const dialog = await openCreateForm();
    await fillValidEmployee(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: /create employee/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/does not exist/i);
  });

  it('maps a 400 `errors` entry onto its field', async () => {
    server.use(
      http.post(EMPLOYEES, () =>
        problemResponse(400, {
          title: 'Validation failed',
          errors: { email: 'must be a well-formed email address' },
        }),
      ),
    );

    const dialog = await openCreateForm();
    await fillValidEmployee(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: /create employee/i }));

    expect(await within(dialog).findByText('must be a well-formed email address')).toBeVisible();
    expect(within(dialog).getByLabelText(/work email/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('says so when a catalogue is empty instead of offering an unsubmittable form', async () => {
    server.use(http.get(DEPARTMENTS, () => Response.json(pageOf([]))));

    const dialog = await openCreateForm();

    expect(await within(dialog).findByText(/a catalogue is empty/i)).toBeVisible();
    expect(within(dialog).getByRole('link', { name: 'Departments' })).toHaveAttribute(
      'href',
      '/hr/departments',
    );
  });
});

describe('employee edit', () => {
  it('loads the record, warns about the identity sync, and PUTs to its id', async () => {
    let target = '';
    server.use(
      http.put(`${EMPLOYEES}/:id`, ({ params }) => {
        target = String(params.id);
        return Response.json(employeeFixture);
      }),
    );

    renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });
    await screen.findByText('Amina Berrada');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Amina Berrada' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/matricule/i)).toHaveValue('EMP-0042');
    // This record HAS a linked account, so the sync warning appears and the
    // provisioning warning does not.
    expect(dialog).toHaveTextContent(/this record has a linked login account/i);
    expect(dialog).not.toHaveTextContent(/saving this will request a login account/i);

    await userEvent.click(within(dialog).getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(target).toBe(employeeFixture.id));
  });

  it('warns about provisioning — not sync — when the record has no account yet', async () => {
    renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });
    await screen.findByText('Hana Mansouri');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Hana Mansouri' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/saving this will request a login account/i);
    expect(dialog).not.toHaveTextContent(/this record has a linked login account/i);
  });
});

describe('employee delete', () => {
  it('names the record and separates deletion from ending access', async () => {
    renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });
    await screen.findByText('Amina Berrada');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Amina Berrada' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/delete amina berrada\?/i);
    expect(dialog).toHaveTextContent('EMP-0042');
    // The distinction that matters: deleting the HR record is NOT offboarding.
    expect(dialog).toHaveTextContent(/does not disable or delete their keycloak account/i);
    expect(dialog).toHaveTextContent(/offboard them from the identity tab instead/i);
  });

  it('explains the 409 “still manages direct reports” where the decision was made', async () => {
    server.use(
      http.delete(`${EMPLOYEES}/:id`, () =>
        problemResponse(409, {
          title: 'Conflict',
          detail: 'employee still manages direct reports: 11111111-1111-1111-1111-111111111111',
        }),
      ),
    );

    renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });
    await screen.findByText('Amina Berrada');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Amina Berrada' }));

    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /delete record/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /still manages direct reports/i,
    );
    // Every error surface carries the correlation id (DESIGN-SYSTEM §9.4).
    expect(within(dialog).getByText(/corr-test-0001/)).toBeVisible();
    expect(screen.getByRole('alertdialog')).toBeVisible();
  });
});

describe('manager picker', () => {
  it('searches the workforce on the server and selects a manager', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(EMPLOYEES, ({ request }) => {
        requests.push(new URL(request.url));
        return Response.json(pageOf([employeeFixture, unprovisionedEmployeeFixture]));
      }),
    );

    const dialog = await openCreateForm();
    await userEvent.click(within(dialog).getByLabelText(/reports to/i));

    const picker = await screen.findByRole('dialog', { name: /choose a manager/i });
    await userEvent.type(within(picker).getByLabelText(/search for a manager/i), 'berrada');

    await waitFor(() => expect(requests.at(-1)?.searchParams.get('search')).toBe('berrada'));
    // The picker asks for a short page, not the directory's page.
    expect(requests.at(-1)?.searchParams.get('size')).toBe('10');

    await userEvent.click(within(picker).getByRole('button', { name: /amina berrada/i }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /choose a manager/i })).toBeNull(),
    );
    expect(within(dialog).getByLabelText(/reports to/i)).toHaveTextContent(/amina berrada/i);
  });

  it('refuses to let a record be its own manager, and says why', async () => {
    renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });
    await screen.findByText('Amina Berrada');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Amina Berrada' }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByLabelText(/reports to/i));

    const picker = await screen.findByRole('dialog', { name: /choose a manager/i });
    const self = await within(picker).findByRole('button', { name: /amina berrada/i });
    expect(self).toBeDisabled();
    expect(picker).toHaveTextContent(/cannot report to themselves/i);
  });

  it('clears a manager back to none', async () => {
    renderWithProviders(<EmployeeDirectoryPage />, { role: 'HR' });
    await screen.findByText('Amina Berrada');
    await userEvent.click(screen.getByRole('button', { name: 'Edit Amina Berrada' }));

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /remove the manager/i }));

    expect(within(dialog).getByLabelText(/reports to/i)).toHaveTextContent(/no manager/i);
  });
});
