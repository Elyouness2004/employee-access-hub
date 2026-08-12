import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { env } from '@/config/env';
import { server } from '@/shared/testing/msw/server';
import { problemResponse } from '@/shared/testing/msw/problem';

import { apiClient, responseCorrelationId } from './client';
import { isApiError, type ApiError } from './problem';
import { resumeRequests, suspendRequests } from './request-gate';
import { setAccessTokenProvider } from './token-provider';

const AUTH_ME = `${env.apiBaseUrl}/api/hr/auth/me`;

afterEach(() => resumeRequests());

describe('apiClient', () => {
  it('generates X-Correlation-Id per request and captures the echo', async () => {
    let sentCorrelationId: string | null = null;
    server.use(
      http.get(AUTH_ME, ({ request }) => {
        sentCorrelationId = request.headers.get('X-Correlation-Id');
        return HttpResponse.json(
          { subject: 's', username: 'u', issuer: env.oidcAuthority, audience: [], authorities: [] },
          { headers: { 'X-Correlation-Id': sentCorrelationId ?? '' } },
        );
      }),
    );

    const response = await apiClient.get(AUTH_ME);
    expect(sentCorrelationId).toBeTruthy();
    expect(responseCorrelationId(response.headers as Record<string, unknown>)).toBe(
      sentCorrelationId,
    );
  });

  it('sends no Authorization header until a token provider is registered', async () => {
    let authHeader: string | null = 'unset';
    server.use(
      http.get(AUTH_ME, ({ request }) => {
        authHeader = request.headers.get('Authorization');
        return HttpResponse.json({});
      }),
    );

    await apiClient.get(AUTH_ME);
    expect(authHeader).toBeNull();
  });

  it('attaches the bearer token from the registered provider (memory only)', async () => {
    setAccessTokenProvider(() => 'phase2-token');
    let authHeader: string | null = null;
    server.use(
      http.get(AUTH_ME, ({ request }) => {
        authHeader = request.headers.get('Authorization');
        return HttpResponse.json({});
      }),
    );

    await apiClient.get(AUTH_ME);
    expect(authHeader).toBe('Bearer phase2-token');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('normalizes RFC 7807 failures into the ApiError union with correlation id', async () => {
    server.use(
      http.get(AUTH_ME, () =>
        problemResponse(403, { title: 'Forbidden', detail: 'Access is denied' }, 'corr-403'),
      ),
    );

    let caught: unknown;
    try {
      await apiClient.get(AUTH_ME);
    } catch (error) {
      caught = error;
    }
    expect(isApiError(caught)).toBe(true);
    const apiError = caught as ApiError & { kind: 'forbidden' };
    expect(apiError.kind).toBe('forbidden');
    expect(apiError.detail).toBe('Access is denied');
    expect(apiError.correlationId).toBe('corr-403');
  });
});

/**
 * The gate is what lets session expiry stop destroying the page: the route
 * stays mounted, so something has to guarantee it cannot keep calling the
 * gateway. It must fail BEFORE the network, or a locked page would still 401,
 * renew, and reset Keycloak's idle clock.
 */
describe('request gate (locked or ended session)', () => {
  it('rejects as unauthorized without reaching the network', async () => {
    const handler = vi.fn(() => HttpResponse.json({}));
    server.use(http.get(AUTH_ME, handler));
    suspendRequests();

    let caught: unknown;
    try {
      await apiClient.get(AUTH_ME);
    } catch (error) {
      caught = error;
    }

    expect(isApiError(caught)).toBe(true);
    expect((caught as ApiError).kind).toBe('unauthorized');
    expect(handler).not.toHaveBeenCalled();
  });

  it('blocks mutations too, not just reads', async () => {
    const handler = vi.fn(() => HttpResponse.json({}));
    server.use(http.post(AUTH_ME, handler));
    suspendRequests();

    await expect(apiClient.post(AUTH_ME, { any: 'body' })).rejects.toMatchObject({
      kind: 'unauthorized',
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('lets traffic through again once the session is verified', async () => {
    const handler = vi.fn(() => HttpResponse.json({ ok: true }));
    server.use(http.get(AUTH_ME, handler));

    suspendRequests();
    await expect(apiClient.get(AUTH_ME)).rejects.toBeDefined();
    resumeRequests();
    await apiClient.get(AUTH_ME);

    expect(handler).toHaveBeenCalledTimes(1);
  });
});
