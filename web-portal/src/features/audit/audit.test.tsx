import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { env } from '@/config/env';
import {
  auditDetailFixture,
  auditEntryFixture,
  auditStatisticsFixture,
  failedAuditEntryFixture,
  pageOf,
} from '@/shared/testing/msw/fixtures';
import { problemResponse } from '@/shared/testing/msw/problem';
import { server } from '@/shared/testing/msw/server';
import { renderAtRoute, renderWithProviders } from '@/shared/testing/render';

import { AuditCenterPage } from './pages/AuditCenterPage';

/**
 * P23 — Audit Center.
 *
 * The contract facts under test: every filter is server-side, sort affordances
 * exist only on the four whitelisted columns, the derived `result` is rendered
 * rather than recomputed, the resource timeline comes from `/{id}`, the CSV
 * export goes through the server (and says it is itself audited), and there is
 * no way — anywhere — to edit or delete an entry.
 */

const AUDIT = `${env.apiBaseUrl}/api/hr/audit`;

const createObjectURL = vi.fn(() => 'blob:mock');
const revokeObjectURL = vi.fn();

beforeEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  Object.defineProperty(URL, 'createObjectURL', { writable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { writable: true, value: revokeObjectURL });
});

/**
 * The action cell that opens an event.
 *
 * Scoped to the table because the card layout renders its own "Details of
 * <code>" row action for the same event — two ways to open one thing, which is
 * correct behaviour and ambiguous to a name query. The cell now reads as words
 * with the machine code beneath it, so the code is still what identifies it.
 */
async function findEventTrigger(action = 'EMPLOYEE_OFFBOARDED') {
  const table = await screen.findByRole('table', { name: /audit events/i });
  const candidates = await within(table).findAllByRole('button', { name: new RegExp(action) });
  // The row also carries a "Details of <code>" action that opens the same
  // dialog; this is the cell itself, which now reads as words above the code.
  const trigger = candidates.find((button) => !/^Details/.test(button.textContent ?? ''));
  if (!trigger) throw new Error(`no action cell for ${action}`);
  return trigger;
}

describe('audit events table', () => {
  it('renders machine data in mono with sort affordances only on the whitelist', async () => {
    const { container } = renderWithProviders(<AuditCenterPage />, { role: 'HR' });

    expect(await findEventTrigger()).toBeVisible();

    const table = screen.getByRole('table', { name: /audit events/i });
    // AuditController.SORTABLE = occurredAt, actor, action, resource.
    expect(within(table).getByRole('button', { name: /when/i })).toBeVisible();
    // The column reads as a person now; the sort it offers is still the
    // whitelisted `actor` column, because that is the only one the server honours.
    expect(within(table).getByRole('button', { name: /recorded by/i })).toBeVisible();
    expect(within(table).getByRole('button', { name: /^action/i })).toBeVisible();
    expect(within(table).getByRole('button', { name: /target/i })).toBeVisible();
    // `result`, `service` and `details` are not sortable server-side.
    expect(within(table).queryByRole('button', { name: /^result/i })).toBeNull();
    expect(within(table).queryByRole('button', { name: /^service/i })).toBeNull();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders the server-derived result verbatim, success and failure apart', async () => {
    renderWithProviders(<AuditCenterPage />, { role: 'HR' });
    await findEventTrigger();

    expect(screen.getAllByText('Success').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Failure').length).toBeGreaterThan(0);
    expect(await findEventTrigger(failedAuditEntryFixture.action)).toBeVisible();
  });

  it('sends page, size and the default sort the controller declares', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(AUDIT, ({ request }) => {
        requests.push(new URL(request.url));
        return HttpResponse.json(pageOf([auditEntryFixture], { size: 50, totalElements: 312 }));
      }),
    );

    renderWithProviders(<AuditCenterPage />, { role: 'HR' });
    await findEventTrigger();

    expect(requests[0]?.searchParams.get('page')).toBe('0');
    expect(requests[0]?.searchParams.get('size')).toBe('50');
    expect(requests[0]?.searchParams.get('sort')).toBe('occurredAt,desc');
    expect(screen.getByText(/showing 1–1 of 312 audit events/i)).toBeVisible();
  });

  it('sends every filter to the server and puts them in the URL', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(AUDIT, ({ request }) => {
        requests.push(new URL(request.url));
        return HttpResponse.json(pageOf([auditEntryFixture]));
      }),
    );

    const { router } = renderAtRoute('/hr/audit', <AuditCenterPage />, {
      role: 'HR',
      route: '/hr/audit',
    });
    await findEventTrigger();

    await userEvent.type(screen.getByLabelText('Actor'), 'msw.hr');
    await userEvent.selectOptions(screen.getByLabelText('Result'), 'FAILURE');

    await waitFor(() => {
      const last = requests.at(-1)?.searchParams;
      expect(last?.get('user')).toBe('msw.hr');
      expect(last?.get('result')).toBe('FAILURE');
    });
    expect(router.state.location.search).toContain('user=msw.hr');
    expect(router.state.location.search).toContain('result=FAILURE');
  });

  it('widens a date filter to cover the whole day in both directions', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(AUDIT, ({ request }) => {
        requests.push(new URL(request.url));
        return HttpResponse.json(pageOf([auditEntryFixture]));
      }),
    );

    renderWithProviders(<AuditCenterPage />, {
      role: 'HR',
      route: '/hr/audit?from=2026-07-01&to=2026-07-31',
    });
    await findEventTrigger();

    const params = requests[0]?.searchParams;
    expect(params?.get('from')).toBe('2026-07-01T00:00:00Z');
    // A `to` of midnight would silently drop everything that happened that day.
    expect(params?.get('to')).toBe('2026-07-31T23:59:59Z');
  });

  it('says which dimensions the trail does not record, instead of hiding the gap', async () => {
    renderWithProviders(<AuditCenterPage />, { role: 'HR' });
    await findEventTrigger();

    expect(
      screen.getByText(/no correlation-id, ip address, role or session filter/i),
    ).toBeVisible();
    expect(screen.queryByLabelText(/correlation/i)).toBeNull();
    expect(screen.queryByLabelText(/ip address/i)).toBeNull();
  });

  it('does not treat the open tab as a filter', async () => {
    // `tab` in the URL must not make `isFiltered` true: an empty table would
    // then claim a filter is hiding events that do not exist.
    server.use(http.get(AUDIT, () => HttpResponse.json(pageOf([]))));

    renderWithProviders(<AuditCenterPage />, { role: 'HR', route: '/hr/audit?tab=events' });

    expect(await screen.findByText(/the trail is empty/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: /clear filters/i })).toBeNull();
  });

  it('debounces a text filter into one request rather than one per keystroke', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(AUDIT, ({ request }) => {
        requests.push(new URL(request.url));
        return HttpResponse.json(pageOf([auditEntryFixture]));
      }),
    );

    renderWithProviders(<AuditCenterPage />, { role: 'HR' });
    await findEventTrigger();
    const before = requests.length;

    await userEvent.type(screen.getByLabelText('Action'), 'EMPLOYEE_OFFBOARDED');

    await waitFor(() =>
      expect(requests.at(-1)?.searchParams.get('action')).toBe('EMPLOYEE_OFFBOARDED'),
    );
    // 20 characters typed; the trail is scanned once, not twenty times.
    expect(requests.length - before).toBeLessThanOrEqual(3);
  });

  it('offers no way to change the record', async () => {
    renderWithProviders(<AuditCenterPage />, { role: 'HR' });
    await findEventTrigger();

    expect(screen.queryByRole('button', { name: /^delete/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^edit/i })).toBeNull();
  });

  it('distinguishes an empty trail from filters that match nothing', async () => {
    server.use(http.get(AUDIT, () => HttpResponse.json(pageOf([]))));

    const { unmount } = renderWithProviders(<AuditCenterPage />, { role: 'HR' });
    expect(await screen.findByText(/the trail is empty/i)).toBeVisible();
    unmount();

    renderWithProviders(<AuditCenterPage />, { role: 'HR', route: '/hr/audit?user=nobody' });
    expect(await screen.findByText(/no events match these filters/i)).toBeVisible();
  });

  it('renders a 403 inline with the server’s wording', async () => {
    server.use(
      http.get(AUDIT, () => problemResponse(403, { detail: 'Access Denied' }, 'corr-audit-403')),
    );

    renderWithProviders(<AuditCenterPage />, { role: 'HR' });

    expect(await screen.findByText('Access Denied')).toBeVisible();
    expect(screen.getByText('corr-audit-403', { exact: false })).toBeVisible();
  });
});

describe('audit event details', () => {
  /**
   * The hierarchy is the contract: what happened, who did it, to whom, and when
   * — in words — before any identifier. The identifiers are all still here, one
   * disclosure below, because an audit tool that hides them is unusable.
   */
  it('leads with what happened and who, not with the identifiers', async () => {
    renderWithProviders(<AuditCenterPage />, { role: 'HR' });
    await userEvent.click(await findEventTrigger());

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Employee offboarded' })).toBeVisible();
    // The actor is a login in the record; the resolver names the person — in
    // the detail list and again on the timeline row for the same event.
    expect((await within(dialog).findAllByText('Ilham Aboulkacem')).length).toBeGreaterThan(0);
    // The target is `employee:<uuid>`; the same resolver names that person too.
    expect(within(dialog).getByText('Amina Berrada')).toBeVisible();
    expect(within(dialog).getByText('HR')).toBeVisible();

    // The raw values are present but NOT in the primary reading.
    expect(within(dialog).getByText(auditEntryFixture.id)).not.toBeVisible();
    expect(within(dialog).getByText(auditEntryFixture.resource)).not.toBeVisible();

    // The timeline is an ordered list — the sequence IS the information.
    const timeline = within(dialog).getByRole('list');
    expect(timeline.tagName).toBe('OL');
    // The row leads with the label — `EMPLOYEE_CREATED` has none, so the code
    // stands in — and repeats the code as machine data beneath it.
    expect(within(timeline).getAllByText('EMPLOYEE_CREATED').length).toBe(2);
    expect(within(dialog).getByText(/the event you opened/i)).toBeVisible();
  });

  it('opens the technical details on demand, with every stored value intact', async () => {
    renderWithProviders(<AuditCenterPage />, { role: 'HR' });
    await userEvent.click(await findEventTrigger());

    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByText('Technical details'));

    expect(within(dialog).getByText(auditEntryFixture.id)).toBeVisible();
    expect(within(dialog).getByText(auditEntryFixture.resource)).toBeVisible();
    expect(within(dialog).getAllByText(auditEntryFixture.details!).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(auditEntryFixture.action).length).toBeGreaterThan(0);
    // The trail records no correlation id; the panel says so rather than
    // leaving an investigator hunting for a field that was never captured.
    expect(within(dialog).getByText(/does not record a correlation id/i)).toBeVisible();
  });

  /**
   * A failure reads as a reason, derived from the exception TYPE only — the
   * server's own message is never paraphrased, and an unrecognised type falls
   * back to it verbatim.
   */
  it('explains a failure by its exception type, keeping the raw detail', async () => {
    server.use(
      http.get(AUDIT, () =>
        HttpResponse.json(
          pageOf([
            {
              ...failedAuditEntryFixture,
              action: 'ONBOARD_FAILED',
              details: 'IdentityUnavailableException: keycloak admin API returned 503',
            },
          ]),
        ),
      ),
      http.get(`${AUDIT}/:id`, () =>
        HttpResponse.json({
          event: {
            ...failedAuditEntryFixture,
            action: 'ONBOARD_FAILED',
            details: 'IdentityUnavailableException: keycloak admin API returned 503',
          },
          timeline: [],
        }),
      ),
    );

    renderWithProviders(<AuditCenterPage />, { role: 'HR' });
    await userEvent.click(await findEventTrigger('ONBOARD_FAILED'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Onboarding failed' })).toBeVisible();
    expect(
      within(dialog).getByText(/identity provider could not be reached, so nothing was changed/i),
    ).toBeVisible();

    await userEvent.click(within(dialog).getByText('Technical details'));
    expect(within(dialog).getByText('IdentityUnavailableException')).toBeVisible();
    expect(within(dialog).getByText('503')).toBeVisible();
    expect(
      within(dialog).getByText('IdentityUnavailableException: keycloak admin API returned 503'),
    ).toBeVisible();
  });

  it('says so when the resource has no other events', async () => {
    server.use(
      http.get(`${AUDIT}/:id`, () => HttpResponse.json({ event: auditEntryFixture, timeline: [] })),
    );

    renderWithProviders(<AuditCenterPage />, { role: 'HR' });
    await userEvent.click(await findEventTrigger());

    expect(await screen.findByText(/the only event recorded against this resource/i)).toBeVisible();
  });

  it('reports a failed timeline fetch without losing the row already on screen', async () => {
    server.use(
      http.get(`${AUDIT}/:id`, () => problemResponse(500, { detail: 'audit lookup failed' })),
    );

    renderWithProviders(<AuditCenterPage />, { role: 'HR' });
    await userEvent.click(await findEventTrigger());

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/audit lookup failed/i)).toBeVisible();
    // The clicked row still names the event — the fetch failed, not the click.
    expect(within(dialog).getAllByText('EMPLOYEE_OFFBOARDED').length).toBeGreaterThan(0);
  });

  it('keeps the detail fixture’s timeline shape (event plus its resource history)', () => {
    expect(auditDetailFixture.timeline.map((entry) => entry.action)).toEqual([
      'EMPLOYEE_CREATED',
      'EMPLOYEE_OFFBOARDED',
    ]);
  });
});

describe('audit CSV export', () => {
  it('downloads the server-generated CSV and reports that the export was itself audited', async () => {
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderWithProviders(<AuditCenterPage />, { role: 'HR' });
    await findEventTrigger();

    await userEvent.click(screen.getByRole('button', { name: /export csv/i }));

    await waitFor(() => expect(anchorClick).toHaveBeenCalled());
    const anchor = anchorClick.mock.instances[0] as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe('audit-export.csv');
    expect(await screen.findByText(/recorded in the trail as AUDIT_EXPORTED/i)).toBeVisible();
    anchorClick.mockRestore();
  });

  it('exports the FILTERED set, not the page on screen', async () => {
    let exported: URL | null = null;
    server.use(
      http.get(`${AUDIT}/export`, ({ request }) => {
        exported = new URL(request.url);
        return new HttpResponse('id,timestamp\r\n', {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="audit-export.csv"',
          },
        });
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderWithProviders(<AuditCenterPage />, {
      role: 'HR',
      route: '/hr/audit?result=FAILURE&user=msw.hr',
    });
    await findEventTrigger();

    await userEvent.click(screen.getByRole('button', { name: /export csv/i }));

    await waitFor(() => expect(exported).not.toBeNull());
    const params = (exported as unknown as URL).searchParams;
    expect(params.get('result')).toBe('FAILURE');
    expect(params.get('user')).toBe('msw.hr');
    vi.restoreAllMocks();
  });

  it('reports an export failure with the server’s sentence and correlation id', async () => {
    server.use(
      http.get(`${AUDIT}/export`, () =>
        problemResponse(403, { detail: 'Access Denied' }, 'corr-export-403'),
      ),
    );

    renderWithProviders(<AuditCenterPage />, { role: 'HR' });
    await findEventTrigger();

    await userEvent.click(screen.getByRole('button', { name: /export csv/i }));

    expect(await screen.findByText(/access denied/i)).toBeVisible();
    expect(screen.getByText(/corr-export-403/)).toBeVisible();
  });
});

describe('audit statistics', () => {
  it('renders the charts with an accessible table alternative for each', async () => {
    renderWithProviders(<AuditCenterPage />, { role: 'HR' });
    await findEventTrigger();

    await userEvent.click(screen.getByRole('tab', { name: /statistics/i }));

    // Totals summed from the series the server bucketed.
    expect(await screen.findByText('45')).toBeVisible(); // 14 + 9 + 22 actions
    expect(screen.getByText('Actions recorded')).toBeVisible();

    // Every chart ships a real table with the same numbers.
    const table = await screen.findByRole('table', { name: /^actions per day/i });
    expect(within(table).getByRole('rowheader', { name: '31 Jul' })).toBeVisible();
    expect(within(table).getByRole('cell', { name: '22' })).toBeVisible();
  });

  it('does not zero-fill the days the trail recorded nothing on', async () => {
    renderWithProviders(<AuditCenterPage />, { role: 'HR' });
    await findEventTrigger();
    await userEvent.click(screen.getByRole('tab', { name: /statistics/i }));

    const table = await screen.findByRole('table', { name: /^actions per day/i });
    // The fixture skips 30 July; the table must skip it too.
    expect(within(table).getAllByRole('rowheader')).toHaveLength(
      auditStatisticsFixture.actionsPerDay.length,
    );
    expect(within(table).queryByRole('rowheader', { name: '30 Jul' })).toBeNull();
  });

  it('names what the security-event series actually counts', async () => {
    renderWithProviders(<AuditCenterPage />, { role: 'HR' });
    await findEventTrigger();
    await userEvent.click(screen.getByRole('tab', { name: /statistics/i }));

    // Stated in the visible caption AND in the chart's hidden table caption.
    expect(
      (await screen.findAllByText(/keycloak's native login stream is not ingested/i)).length,
    ).toBeGreaterThan(0);
  });

  it('calls an empty window empty rather than missing', async () => {
    server.use(
      http.get(`${AUDIT}/statistics`, () =>
        HttpResponse.json({
          ...auditStatisticsFixture,
          actionsPerDay: [],
          failedActionsPerDay: [],
          provisioningPerDay: [],
          offboardingPerDay: [],
          loginAttempts: [],
        }),
      ),
    );

    renderWithProviders(<AuditCenterPage />, { role: 'HR' });
    await findEventTrigger();
    await userEvent.click(screen.getByRole('tab', { name: /statistics/i }));

    expect(await screen.findByText(/no activity in this window/i)).toBeVisible();
  });

  it('reports a failed statistics fetch on its own, leaving the events table alone', async () => {
    server.use(
      http.get(`${AUDIT}/statistics`, () =>
        problemResponse(503, { title: 'Service unavailable', detail: 'the database is down' }),
      ),
    );

    renderWithProviders(<AuditCenterPage />, { role: 'HR' });
    await findEventTrigger();
    await userEvent.click(screen.getByRole('tab', { name: /statistics/i }));

    expect(await screen.findByText(/the database is down/i)).toBeVisible();
    expect(screen.getByText(/try again shortly/i)).toBeVisible();
  });
});
