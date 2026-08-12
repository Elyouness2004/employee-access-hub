import axios, { isAxiosError } from 'axios';

import { env } from '@/config/env';

import { CORRELATION_HEADER, normalizeApiError, sessionUnavailableError } from './problem';
import { areRequestsSuspended } from './request-gate';
import { hasSessionRenewer, renewSession } from './session-renewal';
import { getAccessToken } from './token-provider';

/**
 * THE HTTP boundary — one Axios instance behind the gateway (:8080).
 * Nothing outside shared/api imports Axios or builds URLs by hand
 * (enforced by ESLint).
 *
 * Cross-cutting concerns, in one place:
 *  - Bearer injection from the token provider (the auth feature registers it).
 *  - X-Correlation-Id generated per request and captured from every response.
 *  - 401 renew-and-replay: exactly one controlled renewal, one replay (below).
 *  - Every failure normalized into the ApiError union before callers see it.
 *  - AbortSignal pass-through (TanStack Query cancellation) works out of the box.
 *
 * CORS allows exactly three request headers: Authorization, Content-Type,
 * X-Correlation-Id. Never add others.
 */

declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    /** Set once a 401 replay has been attempted — a replay never replays. */
    _authReplayed?: boolean;
  }
}

export function createCorrelationId(): string {
  return crypto.randomUUID();
}

export const apiClient = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 30_000,
});

apiClient.interceptors.request.use(async (config) => {
  // The session is locked or gone: fail before the socket opens. A mounted
  // page stays on screen with its data, but it cannot talk to the gateway.
  if (areRequestsSuspended()) {
    throw sessionUnavailableError();
  }
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (!config.headers[CORRELATION_HEADER]) {
    config.headers[CORRELATION_HEADER] = createCorrelationId();
  }
  return config;
});

/**
 * 401 renew-and-replay (FRONTEND-ARCHITECTURE §5).
 *
 * A 401 means the token was rejected — usually expiry racing the renewal
 * timer. Recovery: one silent renewal (cross-tab-locked inside the renewer,
 * single-flight across concurrent 401s), then replay the original request
 * once with the fresh token.
 *
 * A replay is safe for mutations too: a 401 is rejected at the security
 * filter before any handler runs, so nothing was processed.
 *
 * Loops are impossible by construction:
 *  - `_authReplayed` marks the config; a replayed request that 401s again
 *    surfaces the error without another renewal.
 *  - No renewer registered (unauthenticated, dev mock, after logout) → no
 *    replay at all.
 *  - Renewal failure resolves `null` (the auth feature transitions to its
 *    session-expired state) and the original 401 surfaces.
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (
      isAxiosError(error) &&
      error.response?.status === 401 &&
      error.config &&
      !error.config._authReplayed &&
      hasSessionRenewer()
    ) {
      const config = error.config;
      config._authReplayed = true;
      const token = await renewSession();
      if (token) {
        // The request interceptor re-attaches the (now fresh) token.
        return apiClient.request(config);
      }
    }
    throw normalizeApiError(await withReadableProblemBody(error));
  },
);

/**
 * A failed `responseType: 'blob'` request (document content, audit CSV export)
 * hands back the RFC 7807 problem document as a `Blob`, not as an object — so
 * the normalizer would find no `detail`, no `errors` and no `rule`, and every
 * failed download would read as a bare status code. Reading the blob back into
 * JSON here keeps that one contract in one place: downloads get the same
 * server sentences, field maps and correlation ids as every other call.
 *
 * A blob that is not JSON (an HTML error page, an empty body) is left alone —
 * the status-only error is then the honest answer.
 */
async function withReadableProblemBody(error: unknown): Promise<unknown> {
  if (!isAxiosError(error) || !error.response) return error;
  const data: unknown = error.response.data;

  let text: string | null = null;
  if (typeof data === 'string') {
    text = data;
  } else if (Object.prototype.toString.call(data) === '[object Blob]') {
    // Tagged rather than `instanceof`: the Blob may come from another realm.
    text = await readBlobText(data as Blob);
  }
  if (text === null) return error;

  try {
    error.response.data = JSON.parse(text);
  } catch {
    // Not JSON (an HTML error page, an empty body): leave it, and let
    // normalizeApiError treat the response as carrying no problem document.
  }
  return error;
}

/**
 * Read a Blob as text across the three shapes the runtime may offer.
 * `Blob.text()` is the modern one; jsdom's Blob has neither it nor
 * `arrayBuffer()`, so `FileReader` is the floor — and the tests that prove
 * download error handling run there.
 */
async function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text();
  if (typeof blob.arrayBuffer === 'function') {
    return new TextDecoder().decode(await blob.arrayBuffer());
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('could not read the response body'));
    reader.readAsText(blob);
  });
}

/** Correlation id echoed by the gateway on a successful response, if any. */
export function responseCorrelationId(headers: Record<string, unknown>): string | undefined {
  const value = headers[CORRELATION_HEADER.toLowerCase()];
  return typeof value === 'string' ? value : undefined;
}
