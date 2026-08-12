import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { env } from '@/config/env';
import { pageOf, teamMemberFixture } from '@/shared/testing/msw/fixtures';
import { problemResponse } from '@/shared/testing/msw/problem';
import { server } from '@/shared/testing/msw/server';
import { setViewport } from '@/shared/testing/setup';
import { renderAtRoute, renderWithProviders } from '@/shared/testing/render';

import { TeamPage } from './pages/TeamPage';

/**
 * P15 — My team. The server-paged table proven end to end: real envelope,
 * whitelisted sorts only, URL-synced filters, and the three "no rows" answers
 * kept apart.
 */

const TEAM = `${env.apiBaseUrl}/api/hr/me/team`;

describe('team roster', () => {
  it('renders the paged roster with resolved labels and a sortable, captioned table', async () => {
    const { container } = renderWithProviders(<TeamPage />, { role: 'MANAGER' });

    expect(await screen.findByText('Hana Mansouri')).toBeVisible();
    expect(screen.getByText(teamMemberFixture.matricule)).toBeVisible();

    const table = screen.getByRole('table', { name: /direct reports/i });
    // Sort affordances exist only for columns the server whitelists.
    expect(within(table).getByRole('button', { name: /name/i })).toBeVisible();
    expect(within(table).getByRole('button', { name: /hire date/i })).toBeVisible();
    // Department is not in MeController.SORTABLE — it must not look sortable.
    expect(within(table).queryByRole('button', { name: /department/i })).toBeNull();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('does not invent labels the endpoint returned as null', async () => {
    renderWithProviders(<TeamPage />, { role: 'MANAGER' });
    await screen.findByText('Hana Mansouri');
    // departmentName and positionTitle are null on this fixture.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('sends page, size and the whitelisted sort to the server, not to the client', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(TEAM, ({ request }) => {
        requests.push(new URL(request.url));
        return Response.json(pageOf([teamMemberFixture], { totalElements: 42 }));
      }),
    );

    renderWithProviders(<TeamPage />, { role: 'MANAGER' });
    await screen.findByText('Hana Mansouri');

    const first = requests[0];
    expect(first?.searchParams.get('page')).toBe('0');
    expect(first?.searchParams.get('size')).toBe('20');
    expect(first?.searchParams.get('sort')).toBe('matricule,asc');

    // 42 elements over pages of 20 — the count comes from the envelope, and the
    // page is genuinely a page.
    expect(screen.getByText(/showing 1–1 of 42 team members/i)).toBeVisible();
  });

  it('asks the server again when a filter changes, and puts the filter in the URL', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(TEAM, ({ request }) => {
        requests.push(new URL(request.url));
        return Response.json(pageOf([teamMemberFixture]));
      }),
    );

    const { router } = renderAtRoute('/team', <TeamPage />, { role: 'MANAGER', route: '/team' });
    await screen.findByText('Hana Mansouri');

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'ACTIVE');

    await screen.findByRole('button', { name: /clear filters/i });
    expect(router.state.location.search).toContain('status=ACTIVE');
    expect(requests.at(-1)?.searchParams.get('status')).toBe('ACTIVE');
  });
});

describe('team roster — states', () => {
  it('distinguishes "nobody reports to you" from "nothing matches"', async () => {
    server.use(http.get(TEAM, () => Response.json(pageOf([]))));

    const { unmount } = renderWithProviders(<TeamPage />, { role: 'MANAGER' });
    expect(await screen.findByText(/nobody reports to you yet/i)).toBeVisible();
    unmount();

    renderWithProviders(<TeamPage />, { role: 'MANAGER', route: '/team?search=zzz' });
    expect(await screen.findByText(/no team members match these filters/i)).toBeVisible();
  });

  it('renders a 403 inline with the server’s own wording', async () => {
    server.use(
      http.get(TEAM, () => problemResponse(403, { detail: 'Access Denied' }, 'corr-team-403')),
    );

    renderWithProviders(<TeamPage />, { role: 'MANAGER' });

    expect(await screen.findByText('Access Denied')).toBeVisible();
    expect(screen.getByText('corr-team-403', { exact: false })).toBeVisible();
  });

  it('offers a retry when the roster fails to load', async () => {
    server.use(http.get(TEAM, () => problemResponse(500, { detail: 'hr-service is unhappy' })));

    renderWithProviders(<TeamPage />, { role: 'MANAGER' });

    expect(await screen.findByRole('alert')).toHaveTextContent(/hr-service is unhappy/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeVisible();
  });

  it('shows a layout-shaped skeleton, never a spinner, while loading', () => {
    const { container } = renderWithProviders(<TeamPage />, { role: 'MANAGER' });
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('team roster — below md', () => {
  it('becomes priority-field cards, never a sideways-scrolling table', async () => {
    setViewport(375);
    const { container } = renderWithProviders(<TeamPage />, { role: 'MANAGER' });

    await screen.findByText('Hana Mansouri');

    // One tree, not two: the table is not merely hidden by CSS.
    expect(screen.queryByRole('table')).toBeNull();

    // Priority fields only — a phone must not show MORE than a tablet. The
    // card's own <dl> is the thing under test; "Status" also names a filter.
    const card = screen.getByRole('listitem');
    expect(within(card).getByText('Status')).toBeVisible();
    expect(within(card).getByText('Department')).toBeVisible();
    expect(within(card).queryByText('Work email')).toBeNull();
    expect(within(card).queryByText('Hire date')).toBeNull();

    expect(await axe(container)).toHaveNoViolations();
  });
});
