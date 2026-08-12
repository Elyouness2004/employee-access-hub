import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { env } from '@/config/env';
import { server } from '@/shared/testing/msw/server';
import { problemResponse } from '@/shared/testing/msw/problem';

import { apiClient } from './client';
import { isApiError, type ApiError } from './problem';
import { resetSessionRenewer, setSessionRenewer } from './session-renewal';
import { setAccessTokenProvider } from './token-provider';

/**
 * 401 renew-and-replay (FRONTEND-ARCHITECTURE §5, rules/api-integration.md):
 * exactly one controlled renewal, exactly one replay, no loops, and no replay
 * at all when the session cannot renew.
 */

const PROBE = `${env.apiBaseUrl}/api/hr/auth/me`;

afterEach(() => {
  resetSessionRenewer();
});

/** Registers a token provider whose value the renewer rotates. */
function session(initial: string) {
  let token = initial;
  setAccessTokenProvider(() => token);
  return {
    set: (next: string) => {
      token = next;
    },
  };
}

describe('401 renew-and-replay', () => {
  it('renews once and replays the request with the fresh token', async () => {
    const current = session('stale-token');
    const renew = vi.fn(async () => {
      current.set('fresh-token');
      return 'fresh-token';
    });
    setSessionRenewer(renew);

    const seenTokens: (string | null)[] = [];
    server.use(
      http.get(PROBE, ({ request }) => {
        const auth = request.headers.get('Authorization');
        seenTokens.push(auth);
        if (auth === 'Bearer stale-token') return problemResponse(401, {}, 'corr-401');
        return HttpResponse.json({ subject: 'kc-1' });
      }),
    );

    const response = await apiClient.get(PROBE);

    expect(response.data).toEqual({ subject: 'kc-1' });
    expect(renew).toHaveBeenCalledTimes(1);
    expect(seenTokens).toEqual(['Bearer stale-token', 'Bearer fresh-token']);
  });

  it('replays at most once — a replay that 401s again surfaces the error', async () => {
    session('token');
    const renew = vi.fn(async () => 'token'); // renewal "succeeds" but token is still rejected
    setSessionRenewer(renew);

    let calls = 0;
    server.use(
      http.get(PROBE, () => {
        calls += 1;
        return problemResponse(401, {}, 'corr-401');
      }),
    );

    await expect(apiClient.get(PROBE)).rejects.toMatchObject({ kind: 'unauthorized', status: 401 });
    expect(calls).toBe(2); // original + one replay, then stop
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it('surfaces the original 401 when renewal fails (no replay)', async () => {
    session('token');
    const renew = vi.fn(async () => null);
    setSessionRenewer(renew);

    let calls = 0;
    server.use(
      http.get(PROBE, () => {
        calls += 1;
        return problemResponse(401, {}, 'corr-401');
      }),
    );

    let caught: unknown;
    try {
      await apiClient.get(PROBE);
    } catch (error) {
      caught = error;
    }

    expect(isApiError(caught)).toBe(true);
    expect((caught as ApiError).kind).toBe('unauthorized');
    expect((caught as ApiError & { correlationId?: string }).correlationId).toBe('corr-401');
    expect(calls).toBe(1);
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it('does not renew when no renewer is registered (unauthenticated / after logout)', async () => {
    let calls = 0;
    server.use(
      http.get(PROBE, () => {
        calls += 1;
        return problemResponse(401, {}, 'corr-401');
      }),
    );

    await expect(apiClient.get(PROBE)).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(calls).toBe(1);
  });

  it('shares ONE renewal across concurrent 401s (never two refreshes)', async () => {
    const current = session('stale-token');
    let renewals = 0;
    setSessionRenewer(async () => {
      renewals += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      current.set('fresh-token');
      return 'fresh-token';
    });

    server.use(
      http.get(PROBE, ({ request }) =>
        request.headers.get('Authorization') === 'Bearer stale-token'
          ? problemResponse(401, {}, 'corr-401')
          : HttpResponse.json({ ok: true }),
      ),
    );

    const responses = await Promise.all([
      apiClient.get(PROBE),
      apiClient.get(PROBE),
      apiClient.get(PROBE),
    ]);

    expect(responses.every((r) => r.data.ok === true)).toBe(true);
    expect(renewals).toBe(1);
  });

  it('replays a mutation too — a 401 is rejected before the handler runs', async () => {
    const current = session('stale-token');
    setSessionRenewer(async () => {
      current.set('fresh-token');
      return 'fresh-token';
    });

    let processed = 0;
    server.use(
      http.post(`${env.apiBaseUrl}/api/leave/requests`, ({ request }) => {
        if (request.headers.get('Authorization') === 'Bearer stale-token') {
          return problemResponse(401, {}, 'corr-401');
        }
        processed += 1;
        return HttpResponse.json({ id: 'req-1' }, { status: 201 });
      }),
    );

    const response = await apiClient.post(`${env.apiBaseUrl}/api/leave/requests`, { days: 1 });
    expect(response.status).toBe(201);
    expect(processed).toBe(1); // executed exactly once
  });

  it('never renews on 403 — authorization failures are not authentication failures', async () => {
    session('token');
    const renew = vi.fn(async () => 'other');
    setSessionRenewer(renew);

    server.use(
      http.get(PROBE, () => problemResponse(403, { detail: 'Requires MANAGER role' }, 'corr-403')),
    );

    await expect(apiClient.get(PROBE)).rejects.toMatchObject({
      kind: 'forbidden',
      detail: 'Requires MANAGER role',
    });
    expect(renew).not.toHaveBeenCalled();
  });

  it('never renews on other 4xx/5xx statuses', async () => {
    session('token');
    const renew = vi.fn(async () => 'other');
    setSessionRenewer(renew);

    server.use(http.get(PROBE, () => problemResponse(422, { rule: 'BR-01' }, 'corr-422')));

    await expect(apiClient.get(PROBE)).rejects.toMatchObject({ kind: 'businessRule' });
    expect(renew).not.toHaveBeenCalled();
  });
});
