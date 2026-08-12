import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { isApiError, type ApiError } from './problem';

/**
 * Landing a failed submission on the right places (FRONTEND-ARCHITECTURE §7,
 * `docs/api/api-conventions.md`).
 *
 * The server is the authority on validity, so its verdict has to reach the same
 * slots the client's own rules use — otherwise a user fixes a field the form
 * never flagged. Two destinations, decided by whether the message is about a
 * field:
 *
 *  - `400 validation` carries `errors: { field: message }`. Keys that match a
 *    form field land on it; keys that do not (a nested or renamed path) go to
 *    the form-level alert rather than being dropped silently.
 *  - `422 businessRule` is never a field error. It carries a BR code and a
 *    sentence the domain wrote ("requested 5 business day(s) but only 3
 *    available") — render that sentence, never a generic "invalid request".
 *
 * Input is NEVER wiped: this only adds messages.
 */

export interface SubmissionFailure {
  /** Message for the form-level alert, or null when every error found a field. */
  formMessage: string | null;
  /** Correlation id to show beside it (mono) — the key to the server logs. */
  correlationId?: string;
  /** BR-xx when the backend named a rule; shown as provenance, not as the message. */
  rule?: string;
}

/**
 * Push an `ApiError` into a react-hook-form instance and return whatever could
 * not be attached to a field.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly Path<T>[],
): SubmissionFailure {
  if (!isApiError(error)) {
    return { formMessage: 'Something went wrong. Please try again.' };
  }

  const base: SubmissionFailure = {
    formMessage: null,
    ...(error.kind !== 'network' && error.correlationId
      ? { correlationId: error.correlationId }
      : {}),
  };

  switch (error.kind) {
    case 'validation': {
      const unmatched: string[] = [];
      for (const [field, message] of Object.entries(error.errors)) {
        if ((knownFields as readonly string[]).includes(field)) {
          setError(field as Path<T>, { type: 'server', message });
        } else {
          unmatched.push(`${field}: ${message}`);
        }
      }
      const hasFieldErrors = Object.keys(error.errors).length > unmatched.length;
      return {
        ...base,
        formMessage: unmatched.length
          ? unmatched.join(' · ')
          : hasFieldErrors
            ? null
            : (error.detail ?? 'One or more fields are invalid.'),
      };
    }
    case 'businessRule':
      // The domain wrote this sentence; it is the specific guidance the user
      // needs, and a generic message here would waste it.
      return { ...base, formMessage: error.detail, ...(error.rule ? { rule: error.rule } : {}) };
    case 'forbidden':
      return { ...base, formMessage: error.detail };
    case 'conflict':
      return { ...base, formMessage: error.detail };
    case 'notFound':
      return { ...base, formMessage: error.detail ?? 'That record no longer exists.' };
    case 'unavailable':
      return {
        ...base,
        formMessage: `${error.detail} Nothing was saved — try again shortly.`,
      };
    case 'provisioningFailed':
      return { ...base, formMessage: error.detail };
    case 'network':
      return {
        ...base,
        formMessage: 'The server could not be reached. Nothing was saved — check your connection.',
      };
    default:
      return { ...base, formMessage: 'Something went wrong. Please try again.' };
  }
}

/** A user-safe sentence for any `ApiError`, for surfaces without a form. */
export function messageFor(error: unknown): string {
  if (!isApiError(error)) return 'Something went wrong. Please try again.';
  const typed: ApiError = error;
  switch (typed.kind) {
    case 'network':
      return 'The server could not be reached. Check your connection and try again.';
    case 'unauthorized':
      return 'Your session is no longer valid.';
    case 'notFound':
      return typed.detail ?? 'That record could not be found.';
    case 'validation':
      return typed.detail ?? 'The request was rejected as invalid.';
    case 'server':
      return typed.detail ?? 'The server had a problem handling that request.';
    case 'payloadTooLarge':
      return typed.detail ?? 'That file is larger than the server accepts.';
    case 'unsupportedMediaType':
      return typed.detail ?? 'That file type is not accepted.';
    default:
      return typed.detail;
  }
}

/**
 * "This login account has no employee record yet" — identity onboarding has not
 * run. A legitimate state, NOT a failure, and the services express it two
 * different ways:
 *
 *  - hr-service `GET /api/hr/me` answers **404** (api-conventions §2: "a caller
 *    whose identity has not been linked gets 404, not an empty body");
 *  - leave- and expense-service answer **422 `Employee not eligible`*, because
 *    their `EmployeeNotEligibleException` maps there (`ApiExceptionHandler`).
 *
 * Both mean the same thing to a person, so both belong behind one predicate —
 * otherwise every consumer has to remember which service it is talking to, and
 * one of them will get it wrong.
 */
export function isUnlinkedIdentity(error: unknown): boolean {
  if (!isApiError(error)) return false;
  if (error.kind === 'notFound') return true;
  return error.kind === 'businessRule' && error.title === 'Employee not eligible';
}
