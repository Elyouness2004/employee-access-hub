import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { env } from '@/config/env';
import { departmentFixtures, pageOf, positionFixtures } from '@/shared/testing/msw/fixtures';
import { problemResponse } from '@/shared/testing/msw/problem';
import { server } from '@/shared/testing/msw/server';
import { renderAtRoute, renderWithProviders } from '@/shared/testing/render';
import { setViewport } from '@/shared/testing/setup';

import { DepartmentsPage } from './pages/DepartmentsPage';
import { PositionsPage } from './pages/PositionsPage';

/**
 * P18 / P19 — the catalogue admin screens, which are one component rendered
 * twice. The tests exercise both, because the thing that differs between them
 * (the label field, and therefore where a 400 lands) is exactly the thing a
 * shared component could get wrong.
 */

const DEPARTMENTS = `${env.apiBaseUrl}/api/hr/departments`;
const POSITIONS = `${env.apiBaseUrl}/api/hr/positions`;

async function openCreateDialog(name: RegExp) {
  await userEvent.click(screen.getByRole('button', { name }));
  return screen.findByRole('dialog');
}

describe('departments (P18)', () => {
  it('renders the server page with sort affordances only on whitelisted columns', async () => {
    const { container } = renderWithProviders(<DepartmentsPage />, { role: 'HR' });

    expect(await screen.findByText('Engineering')).toBeVisible();
    const table = screen.getByRole('table', { name: /departments catalogue/i });

    // DepartmentController.SORTABLE = name, createdAt, updatedAt.
    expect(within(table).getByRole('button', { name: /name/i })).toBeVisible();
    expect(within(table).getByRole('button', { name: /last updated/i })).toBeVisible();
    // Description is not sortable server-side, so it must not look sortable.
    expect(within(table).queryByRole('button', { name: /description/i })).toBeNull();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders a null description as an em dash rather than inventing text', async () => {
    renderWithProviders(<DepartmentsPage />, { role: 'HR' });
    // departmentFixtures[1].description is null.
    expect(await screen.findByText('People Operations')).toBeVisible();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('sends page, size, the default sort and the search term to the server', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(DEPARTMENTS, ({ request }) => {
        requests.push(new URL(request.url));
        return Response.json(pageOf(departmentFixtures, { totalElements: 31 }));
      }),
    );

    renderWithProviders(<DepartmentsPage />, { role: 'HR' });
    await screen.findByText('Engineering');

    const first = requests[0];
    expect(first?.searchParams.get('page')).toBe('0');
    expect(first?.searchParams.get('size')).toBe('20');
    expect(first?.searchParams.get('sort')).toBe('name,asc');
    expect(screen.getByText(/showing 1–2 of 31 departments/i)).toBeVisible();

    await userEvent.type(screen.getByLabelText(/search departments/i), 'ops');
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('search')).toBe('ops'));
  });

  it('round-trips the search through the URL so a filtered view is a deep link', async () => {
    const { router } = renderAtRoute('/hr/departments', <DepartmentsPage />, {
      role: 'HR',
      route: '/hr/departments',
    });
    await screen.findByText('Engineering');

    await userEvent.type(screen.getByLabelText(/search departments/i), 'eng');
    await waitFor(() => expect(router.state.location.search).toContain('search=eng'));
  });
});

describe('departments — create and edit', () => {
  it('validates client-side before the server is asked', async () => {
    let posted = 0;
    server.use(
      http.post(DEPARTMENTS, () => {
        posted += 1;
        return Response.json(departmentFixtures[0]);
      }),
    );

    renderWithProviders(<DepartmentsPage />, { role: 'HR' });
    await screen.findByText('Engineering');
    const dialog = await openCreateDialog(/new department/i);

    await userEvent.click(within(dialog).getByRole('button', { name: /create department/i }));

    expect(await within(dialog).findByText(/enter a department name/i)).toBeVisible();
    expect(posted).toBe(0);
  });

  it('sends the department body as `name`, not as the form’s field name', async () => {
    let body: unknown;
    server.use(
      http.post(DEPARTMENTS, async ({ request }) => {
        body = await request.json();
        return Response.json(departmentFixtures[0]);
      }),
    );

    renderWithProviders(<DepartmentsPage />, { role: 'HR' });
    await screen.findByText('Engineering');
    const dialog = await openCreateDialog(/new department/i);

    await userEvent.type(within(dialog).getByLabelText(/^name/i), 'Finance');
    await userEvent.click(within(dialog).getByRole('button', { name: /create department/i }));

    await waitFor(() => expect(body).toEqual({ name: 'Finance', description: null }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('lands a 400 `errors` entry on the field the user is looking at', async () => {
    server.use(
      http.post(DEPARTMENTS, () =>
        problemResponse(400, {
          title: 'Validation failed',
          detail: 'One or more request fields are invalid',
          // The server names the DTO field; the form field is called `label`.
          errors: { name: 'must not be blank' },
        }),
      ),
    );

    renderWithProviders(<DepartmentsPage />, { role: 'HR' });
    await screen.findByText('Engineering');
    const dialog = await openCreateDialog(/new department/i);

    await userEvent.type(within(dialog).getByLabelText(/^name/i), 'x');
    await userEvent.click(within(dialog).getByRole('button', { name: /create department/i }));

    expect(await within(dialog).findByText('must not be blank')).toBeVisible();
    expect(within(dialog).getByLabelText(/^name/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a 409 duplicate verbatim and keeps the typed input', async () => {
    server.use(
      http.post(DEPARTMENTS, () =>
        problemResponse(
          409,
          { title: 'Conflict', detail: 'department name already exists: Engineering' },
          'corr-dept-409',
        ),
      ),
    );

    renderWithProviders(<DepartmentsPage />, { role: 'HR' });
    await screen.findByText('Engineering');
    const dialog = await openCreateDialog(/new department/i);

    await userEvent.type(within(dialog).getByLabelText(/^name/i), 'Engineering');
    await userEvent.type(within(dialog).getByLabelText(/description/i), 'Keep me');
    await userEvent.click(within(dialog).getByRole('button', { name: /create department/i }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('department name already exists: Engineering');
    expect(alert).toHaveTextContent('corr-dept-409');
    // Input survives the rejection — nothing is retyped.
    expect(within(dialog).getByLabelText(/description/i)).toHaveValue('Keep me');
  });

  it('loads the row being edited and PUTs to its id', async () => {
    let target = '';
    server.use(
      http.put(`${DEPARTMENTS}/:id`, ({ params }) => {
        target = String(params.id);
        return Response.json(departmentFixtures[0]);
      }),
    );

    renderWithProviders(<DepartmentsPage />, { role: 'HR' });
    await screen.findByText('Engineering');

    await userEvent.click(screen.getByRole('button', { name: 'Edit Engineering' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/^name/i)).toHaveValue('Engineering');

    await userEvent.click(within(dialog).getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(target).toBe(departmentFixtures[0]?.id));
  });
});

describe('departments — delete', () => {
  it('names the object and its consequences before deleting anything', async () => {
    renderWithProviders(<DepartmentsPage />, { role: 'HR' });
    await screen.findByText('Engineering');

    await userEvent.click(screen.getByRole('button', { name: 'Delete Engineering' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/delete engineering\?/i);
    expect(dialog).toHaveTextContent(/refuses while any employee is still assigned/i);
    expect(dialog).toHaveTextContent(/cannot be undone/i);
  });

  it('explains a 409 in the dialog instead of failing silently', async () => {
    server.use(
      http.delete(`${DEPARTMENTS}/:id`, () =>
        problemResponse(409, {
          title: 'Conflict',
          detail: 'department still has employees assigned: 33333333-3333-3333-3333-333333333333',
        }),
      ),
    );

    renderWithProviders(<DepartmentsPage />, { role: 'HR' });
    await screen.findByText('Engineering');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Engineering' }));

    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /delete department/i }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      /still has employees assigned/i,
    );
    expect(within(dialog).getByText(/corr-test-0001/)).toBeVisible();
    // The dialog stays open so the answer sits where the decision was made.
    expect(screen.getByRole('alertdialog')).toBeVisible();
  });

  it('closes the dialog after a successful delete', async () => {
    server.use(http.delete(`${DEPARTMENTS}/:id`, () => new HttpResponse(null, { status: 204 })));

    renderWithProviders(<DepartmentsPage />, { role: 'HR' });
    await screen.findByText('Engineering');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Engineering' }));

    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /delete department/i }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });
});

describe('departments — states', () => {
  it('distinguishes an empty catalogue from a search that matched nothing', async () => {
    server.use(http.get(DEPARTMENTS, () => Response.json(pageOf([]))));

    const { unmount } = renderWithProviders(<DepartmentsPage />, { role: 'HR' });
    expect(await screen.findByText(/no departments yet/i)).toBeVisible();
    unmount();

    renderWithProviders(<DepartmentsPage />, { role: 'HR', route: '/hr/departments?search=zzz' });
    expect(await screen.findByText(/no departments match this search/i)).toBeVisible();
  });

  it('renders a 403 inline with the server’s own wording and the correlation id', async () => {
    server.use(
      http.get(DEPARTMENTS, () =>
        problemResponse(403, { detail: 'Requires role HR' }, 'corr-dept-403'),
      ),
    );

    renderWithProviders(<DepartmentsPage />, { role: 'HR' });

    expect(await screen.findByText('Requires role HR')).toBeVisible();
    expect(screen.getByText(/corr-dept-403/)).toBeVisible();
    // A 403 is never a redirect and never a sign-out.
    expect(screen.getByText(/you are signed in/i)).toBeVisible();
  });

  it('separates 503 “wait” from a generic failure', async () => {
    server.use(
      http.get(DEPARTMENTS, () =>
        problemResponse(503, { title: 'Identity provider unavailable', detail: 'hr-db is down' }),
      ),
    );

    renderWithProviders(<DepartmentsPage />, { role: 'HR' });
    expect(await screen.findByText(/dependency being unreachable/i)).toBeVisible();
  });

  it('shows a layout-shaped skeleton while loading, never a spinner', () => {
    const { container } = renderWithProviders(<DepartmentsPage />, { role: 'HR' });
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('becomes cards below md rather than a sideways-scrolling table', async () => {
    setViewport(375);
    const { container } = renderWithProviders(<DepartmentsPage />, { role: 'HR' });

    await screen.findByText('Engineering');
    expect(screen.queryByRole('table')).toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('positions (P19)', () => {
  it('is the same screen keyed to `title`, and sorts on the column the server whitelists', async () => {
    renderWithProviders(<PositionsPage />, { role: 'HR' });

    expect(await screen.findByText('Senior Engineer')).toBeVisible();
    const table = screen.getByRole('table', { name: /positions catalogue/i });
    // PositionController.SORTABLE = title, createdAt, updatedAt — no `name`.
    expect(within(table).getByRole('button', { name: /title/i })).toBeVisible();
    expect(within(table).queryByRole('button', { name: /^name/i })).toBeNull();
  });

  it('sends `title` in the create body, not `name`', async () => {
    let body: unknown;
    server.use(
      http.post(POSITIONS, async ({ request }) => {
        body = await request.json();
        return Response.json(positionFixtures[0]);
      }),
    );

    renderWithProviders(<PositionsPage />, { role: 'HR' });
    await screen.findByText('Senior Engineer');
    const dialog = await openCreateDialog(/new position/i);

    await userEvent.type(within(dialog).getByLabelText(/^title/i), 'Staff Engineer');
    await userEvent.click(within(dialog).getByRole('button', { name: /create position/i }));

    await waitFor(() => expect(body).toEqual({ title: 'Staff Engineer', description: null }));
  });

  it('lands a 400 keyed to `title` on the Title field', async () => {
    server.use(
      http.post(POSITIONS, () =>
        problemResponse(400, {
          title: 'Validation failed',
          errors: { title: 'size must be between 0 and 100' },
        }),
      ),
    );

    renderWithProviders(<PositionsPage />, { role: 'HR' });
    await screen.findByText('Senior Engineer');
    const dialog = await openCreateDialog(/new position/i);

    await userEvent.type(within(dialog).getByLabelText(/^title/i), 'x');
    await userEvent.click(within(dialog).getByRole('button', { name: /create position/i }));

    expect(await within(dialog).findByText('size must be between 0 and 100')).toBeVisible();
    expect(within(dialog).getByLabelText(/^title/i)).toHaveAttribute('aria-invalid', 'true');
  });
});
