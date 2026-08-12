import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { env } from '@/config/env';
import { peopleFixtures } from '@/shared/testing/msw/fixtures';
import { problemResponse } from '@/shared/testing/msw/problem';
import { server } from '@/shared/testing/msw/server';
import { renderWithProviders } from '@/shared/testing/render';

import { PersonReference } from './PersonReference';
import { usePeopleLookup, type PeopleReferences } from './people-api';

/**
 * The shared identity resolver — the one place a stored UUID becomes a person.
 *
 * The tests are mostly about the four readings staying apart. Collapsing them
 * is the bug this module exists to prevent: a lookup that FAILED rendered as
 * "no such person" is a claim about the data that nobody checked, and a UUID
 * rendered as a person's headline is the defect the whole change is about.
 */

const PEOPLE = `${env.apiBaseUrl}/api/hr/people`;
const amina = peopleFixtures[0]!;
const ilham = peopleFixtures[3]!;

function Probe({
  references,
  keycloakId,
  username,
}: {
  references: PeopleReferences;
  keycloakId?: string | null;
  username?: string | null;
}) {
  const people = usePeopleLookup(references);
  return (
    <PersonReference
      resolution={
        keycloakId !== undefined ? people.byKeycloakId(keycloakId) : people.byUsername(username)
      }
      fallback={keycloakId ?? username}
      fullFallback
      showEmail
    />
  );
}

describe('resolving a stored identifier', () => {
  it('names the person behind a Keycloak subject, with their work e-mail', async () => {
    renderWithProviders(
      <Probe references={{ keycloakIds: [amina.keycloakId] }} keycloakId={amina.keycloakId} />,
    );

    expect(await screen.findByText(amina.displayName)).toBeVisible();
    expect(screen.getByText(amina.email)).toBeVisible();
    // The identifier is gone from the reading — that is the point.
    expect(screen.queryByText(amina.keycloakId!)).toBeNull();
  });

  it('resolves a login in either convention — short form or full e-mail', async () => {
    const { unmount } = renderWithProviders(
      <Probe references={{ usernames: ['msw.hr'] }} username="msw.hr" />,
    );
    expect(await screen.findByText(ilham.displayName)).toBeVisible();
    unmount();

    renderWithProviders(<Probe references={{ usernames: [ilham.email] }} username={ilham.email} />);
    expect(await screen.findByText(ilham.displayName)).toBeVisible();
  });

  it('sends every reference kind on one request and asks for nothing twice', async () => {
    const urls: URL[] = [];
    server.use(
      http.get(PEOPLE, ({ request }) => {
        urls.push(new URL(request.url));
        return HttpResponse.json(peopleFixtures);
      }),
    );

    renderWithProviders(
      <Probe
        references={{
          // The same subject three times, plus a null and a blank — a real page
          // of rows looks exactly like this.
          keycloakIds: [amina.keycloakId, amina.keycloakId, null, '', amina.keycloakId],
          employeeIds: [amina.employeeId],
          usernames: ['msw.hr'],
        }}
        keycloakId={amina.keycloakId}
      />,
    );

    await screen.findByText(amina.displayName);
    expect(urls).toHaveLength(1);
    expect(urls[0]!.searchParams.getAll('keycloakId')).toEqual([amina.keycloakId]);
    expect(urls[0]!.searchParams.getAll('employeeId')).toEqual([amina.employeeId]);
    expect(urls[0]!.searchParams.getAll('username')).toEqual(['msw.hr']);
  });

  it('asks for nothing at all when there is nothing to resolve', async () => {
    let called = 0;
    server.use(
      http.get(PEOPLE, () => {
        called += 1;
        return HttpResponse.json([]);
      }),
    );

    renderWithProviders(
      <Probe references={{ keycloakIds: [null, undefined] }} keycloakId={null} />,
    );

    // An absent reference is a dash, not a lookup and not an error.
    expect(await screen.findByText('—')).toBeVisible();
    await waitFor(() => expect(called).toBe(0));
  });
});

describe('the readings stay apart', () => {
  it('says the name is unavailable — not that the person is unknown — when the lookup fails', async () => {
    server.use(http.get(PEOPLE, () => problemResponse(503, { detail: 'hr is down' })));

    renderWithProviders(
      <Probe references={{ keycloakIds: [amina.keycloakId] }} keycloakId={amina.keycloakId} />,
    );

    expect(await screen.findByText(/name unavailable/i)).toBeVisible();
    // The identifier stays visible so the row is still traceable.
    expect(screen.getByText(amina.keycloakId!)).toBeVisible();
    expect(screen.queryByText(/not a current employee/i)).toBeNull();
  });

  it('marks a reference the server does not know as exactly that', async () => {
    server.use(http.get(PEOPLE, () => HttpResponse.json([])));
    const orphan = '00000000-0000-0000-0000-0000000000ff';

    renderWithProviders(<Probe references={{ keycloakIds: [orphan] }} keycloakId={orphan} />);

    expect(await screen.findByText(/not a current employee record/i)).toBeVisible();
    expect(screen.getByText(orphan)).toBeVisible();
  });

  it('renders the platform actor as the platform, never as a missing person', async () => {
    server.use(http.get(PEOPLE, () => HttpResponse.json([])));

    renderWithProviders(<Probe references={{ usernames: ['system'] }} username="system" />);

    expect(await screen.findByText('System')).toBeVisible();
    expect(screen.getByText(/automated platform action/i)).toBeVisible();
    expect(screen.queryByText(/not a current employee/i)).toBeNull();
  });
});
