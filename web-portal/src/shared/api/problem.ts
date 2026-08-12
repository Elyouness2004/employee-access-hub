import { isAxiosError } from 'axios';

/**
 * RFC 7807 normalization — every failed request in the app becomes one of these
 * variants (FRONTEND-ARCHITECTURE §7). Handling rules per kind live in
 * docs/api/api-conventions.md. Every variant carries the correlation id
 * when the response exposed one; error surfaces must display it (mono).
 */

/** Raw RFC 7807 body shape the services emit (api-conventions §4). */
export interface ProblemDetailBody {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  /** 400 bean validation: field → message. */
  errors?: Record<string, string>;
  /** 422 business rule: BR-xx code. */
  rule?: string;
}

interface ApiErrorBase {
  correlationId?: string;
  /** Backend `title` where present — never shown raw to users without mapping. */
  title?: string;
}

export type ApiError =
  | ({
      kind: 'validation';
      status: 400;
      detail?: string;
      errors: Record<string, string>;
    } & ApiErrorBase)
  | ({ kind: 'unauthorized'; status: 401 } & ApiErrorBase)
  | ({ kind: 'forbidden'; status: 403; detail: string } & ApiErrorBase)
  | ({ kind: 'notFound'; status: 404; detail?: string } & ApiErrorBase)
  | ({
      kind: 'conflict';
      status: 409;
      detail: string;
      confirmationRequired: boolean;
    } & ApiErrorBase)
  | ({ kind: 'payloadTooLarge'; status: 413; detail?: string } & ApiErrorBase)
  | ({ kind: 'unsupportedMediaType'; status: 415; detail?: string } & ApiErrorBase)
  | ({ kind: 'businessRule'; status: 422; detail: string; rule?: string } & ApiErrorBase)
  | ({ kind: 'provisioningFailed'; status: 502; detail: string } & ApiErrorBase)
  | ({ kind: 'unavailable'; status: 503; detail: string } & ApiErrorBase)
  | ({ kind: 'server'; status: number; detail?: string } & ApiErrorBase)
  | { kind: 'network' };

const API_ERROR_BRAND = Symbol.for('eah.apiError');

interface BrandedApiError {
  [API_ERROR_BRAND]: true;
}

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Partial<BrandedApiError>)[API_ERROR_BRAND] === true
  );
}

function brand(error: ApiError): ApiError {
  Object.defineProperty(error, API_ERROR_BRAND, { value: true, enumerable: false });
  return error;
}

export const CORRELATION_HEADER = 'X-Correlation-Id';

/**
 * The client refused to send a request because the session is not usable
 * (idle-locked or expired). Shaped as `unauthorized` because that is exactly
 * what it is — the difference is only that no packet left the browser.
 */
export function sessionUnavailableError(): ApiError {
  return brand({ kind: 'unauthorized', status: 401 });
}

/** The hr-service emits exactly this title on the terminate-current-session 409. */
const CONFIRMATION_REQUIRED_TITLE = 'Confirmation required';

/**
 * Normalize any thrown value from the HTTP layer into the ApiError union.
 * Pure and total: unknown failures become `server`/`network`, never a throw.
 */
export function normalizeApiError(error: unknown): ApiError {
  if (isApiError(error)) return error;

  if (!isAxiosError(error)) {
    return brand({ kind: 'network' });
  }
  const response = error.response;
  if (!response) {
    // Request never reached the gateway (or was aborted): a network condition.
    return brand({ kind: 'network' });
  }

  const status = response.status;
  const body: ProblemDetailBody =
    typeof response.data === 'object' && response.data !== null
      ? (response.data as ProblemDetailBody)
      : {};
  const headerValue = response.headers?.[CORRELATION_HEADER.toLowerCase()] as string | undefined;
  const base: ApiErrorBase = {};
  if (headerValue) base.correlationId = headerValue;
  if (body.title) base.title = body.title;
  const detail = body.detail;

  switch (status) {
    case 400:
      return brand({ kind: 'validation', status, detail, errors: body.errors ?? {}, ...base });
    case 401:
      return brand({ kind: 'unauthorized', status, ...base });
    case 403:
      return brand({ kind: 'forbidden', status, detail: detail ?? 'Access denied.', ...base });
    case 404:
      return brand({ kind: 'notFound', status, detail, ...base });
    case 409:
      return brand({
        kind: 'conflict',
        status,
        detail: detail ?? 'The request conflicts with the current state.',
        confirmationRequired: body.title === CONFIRMATION_REQUIRED_TITLE,
        ...base,
      });
    case 413:
      return brand({ kind: 'payloadTooLarge', status, detail, ...base });
    case 415:
      return brand({ kind: 'unsupportedMediaType', status, detail, ...base });
    case 422:
      return brand({
        kind: 'businessRule',
        status,
        detail: detail ?? 'A business rule prevents this action.',
        rule: body.rule,
        ...base,
      });
    case 502:
      return brand({
        kind: 'provisioningFailed',
        status,
        detail: detail ?? 'Provisioning failed — review and retry.',
        ...base,
      });
    case 503:
      return brand({
        kind: 'unavailable',
        status,
        detail: detail ?? 'A dependency is unavailable — try again later.',
        ...base,
      });
    default:
      return brand({ kind: 'server', status, detail, ...base });
  }
}

/**
 * Query retry policy input: only transient failures are retryable —
 * network errors and 502/503. Never a 4xx (FRONTEND-ARCHITECTURE §6).
 */
export function isRetryableApiError(error: unknown): boolean {
  if (!isApiError(error)) return false;
  return (
    error.kind === 'network' || error.kind === 'unavailable' || error.kind === 'provisioningFailed'
  );
}

/** Correlation id of a normalized error, if the response carried one. */
export function correlationIdOf(error: unknown): string | undefined {
  if (!isApiError(error) || error.kind === 'network') return undefined;
  return error.correlationId;
}
