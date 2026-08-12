import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';

import { correlationIdOf, isApiError, isRetryableApiError, normalizeApiError } from './problem';

function axiosFailure(
  status: number,
  data: unknown,
  headers: Record<string, string> = { 'x-correlation-id': 'corr-1234' },
): AxiosError {
  const config = { headers: {} } as InternalAxiosRequestConfig;
  const response = { status, data, headers, config, statusText: '' } as AxiosResponse;
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, {}, response);
}

describe('normalizeApiError', () => {
  it('maps 400 bean validation onto the errors map', () => {
    const error = normalizeApiError(
      axiosFailure(400, {
        title: 'Validation failed',
        detail: 'Request body is invalid',
        errors: { firstName: 'must not be blank' },
      }),
    );
    expect(error).toMatchObject({
      kind: 'validation',
      status: 400,
      errors: { firstName: 'must not be blank' },
      correlationId: 'corr-1234',
    });
  });

  it('keeps the 403 server detail (layer 2 vs layer 3 read differently)', () => {
    const error = normalizeApiError(
      axiosFailure(403, { detail: 'Only the assigned manager may decide this request' }),
    );
    expect(error).toMatchObject({
      kind: 'forbidden',
      detail: 'Only the assigned manager may decide this request',
    });
  });

  it('detects the terminate-current-session 409 by its backend title', () => {
    const confirm = normalizeApiError(
      axiosFailure(409, { title: 'Confirmation required', detail: 'This is your current session' }),
    );
    expect(confirm).toMatchObject({ kind: 'conflict', confirmationRequired: true });

    const plain = normalizeApiError(
      axiosFailure(409, { title: 'Conflict', detail: 'Department is in use' }),
    );
    expect(plain).toMatchObject({ kind: 'conflict', confirmationRequired: false });
  });

  it('carries the BR-xx rule on 422', () => {
    const error = normalizeApiError(
      axiosFailure(422, {
        title: 'Business rule violation',
        detail: 'Insufficient balance',
        rule: 'BR-01',
      }),
    );
    expect(error).toMatchObject({ kind: 'businessRule', rule: 'BR-01' });
  });

  it('never merges 502 provisioning failures with 503 unavailability', () => {
    const failed = normalizeApiError(axiosFailure(502, { detail: 'Keycloak rejected the user' }));
    const down = normalizeApiError(axiosFailure(503, { detail: 'Identity provider unavailable' }));
    expect(failed.kind).toBe('provisioningFailed');
    expect(down.kind).toBe('unavailable');
  });

  it('treats a missing response as a network error', () => {
    const error = normalizeApiError(new AxiosError('Network Error', 'ERR_NETWORK'));
    expect(error).toEqual({ kind: 'network' });
  });

  it('maps unknown statuses to server and non-axios values to network', () => {
    expect(normalizeApiError(axiosFailure(500, {})).kind).toBe('server');
    expect(normalizeApiError(new Error('boom')).kind).toBe('network');
  });

  it('brands results so isApiError narrows and passthrough is idempotent', () => {
    const error = normalizeApiError(axiosFailure(404, {}));
    expect(isApiError(error)).toBe(true);
    expect(normalizeApiError(error)).toBe(error);
    expect(isApiError({ kind: 'notFound', status: 404 })).toBe(false);
  });

  it('exposes the correlation id where the response carried one', () => {
    expect(correlationIdOf(normalizeApiError(axiosFailure(404, {})))).toBe('corr-1234');
    expect(correlationIdOf(normalizeApiError(axiosFailure(404, {}, {})))).toBeUndefined();
  });
});

describe('isRetryableApiError', () => {
  it('allows retries only for network/502/503', () => {
    expect(isRetryableApiError(normalizeApiError(new AxiosError('down', 'ERR_NETWORK')))).toBe(
      true,
    );
    expect(isRetryableApiError(normalizeApiError(axiosFailure(502, {})))).toBe(true);
    expect(isRetryableApiError(normalizeApiError(axiosFailure(503, {})))).toBe(true);
  });

  it('never retries 4xx or plain server errors', () => {
    for (const status of [400, 401, 403, 404, 409, 413, 415, 422, 500]) {
      expect(isRetryableApiError(normalizeApiError(axiosFailure(status, {})))).toBe(false);
    }
    expect(isRetryableApiError(new Error('not an api error'))).toBe(false);
  });
});
