import type { ReactNode } from 'react';

import { isApiError } from '@/shared/api';
import { messageFor } from '@/shared/api/form-errors';

import { Alert } from './Alert';
import { ErrorState } from './ErrorState';
import { PermissionDenied } from './PermissionDenied';

/**
 * One decision, made once: which failure state a query error deserves.
 *
 * The distinctions are not cosmetic and the rules require every one of them to
 * be a separate render (`docs/api/api-conventions.md`):
 *
 *  - **403** → `PermissionDenied` inline with the server's own words. Never a
 *    redirect, never "something went wrong".
 *  - **503** → a degraded-dependency banner. The dependency is down and the
 *    right advice is "wait", which is not the advice for a failed request.
 *  - **502** → "review and retry" — a provisioning attempt that FAILED, which
 *    is a different fact from a dependency being unreachable. Never merged
 *    with 503.
 *  - anything else → `ErrorState` with the `detail` and the correlation id.
 *
 * 404 is deliberately NOT handled here: it means different things per endpoint
 * ("not yours", "no balance allocated for this year", "metadata only"), so the
 * caller renders the honest one instead of a generic "not found".
 */
export interface QueryStateBoundaryProps {
  error: unknown;
  onRetry?: () => void;
  /** Rendered instead of the generic error when the server answered 404. */
  notFound?: ReactNode;
  className?: string;
}

export function QueryStateBoundary({
  error,
  onRetry,
  notFound,
  className,
}: QueryStateBoundaryProps) {
  if (!isApiError(error)) {
    return <ErrorState detail={messageFor(error)} {...(onRetry ? { onRetry } : {})} />;
  }

  switch (error.kind) {
    case 'forbidden':
      return (
        <PermissionDenied
          detail={error.detail}
          {...(error.correlationId ? { correlationId: error.correlationId } : {})}
          {...(className ? { className } : {})}
        />
      );
    case 'notFound':
      return notFound ? (
        <>{notFound}</>
      ) : (
        <ErrorState
          title="Not found"
          detail={error.detail ?? 'That record could not be found.'}
          {...(error.correlationId ? { correlationId: error.correlationId } : {})}
          {...(onRetry ? { onRetry } : {})}
          {...(className ? { className } : {})}
        />
      );
    case 'unavailable':
      return (
        <Alert
          tone="warning"
          title="Data unavailable right now"
          {...(className ? { className } : {})}
          actions={
            onRetry ? (
              <button type="button" className="text-label underline" onClick={onRetry}>
                Retry
              </button>
            ) : null
          }
        >
          <p>{error.detail} This is a dependency being unreachable — try again shortly.</p>
          {error.correlationId ? (
            <p className="mt-1 font-mono text-mono-sm">Correlation id: {error.correlationId}</p>
          ) : null}
        </Alert>
      );
    case 'provisioningFailed':
      return (
        <ErrorState
          title="Provisioning failed"
          // 502 ≠ 503: the operation was attempted and rejected, so the fix is
          // to review the data and retry, not to wait for a service to return.
          detail={`${error.detail} Review the details and retry.`}
          {...(error.correlationId ? { correlationId: error.correlationId } : {})}
          {...(onRetry ? { onRetry } : {})}
          {...(className ? { className } : {})}
        />
      );
    default:
      return (
        <ErrorState
          detail={messageFor(error)}
          {...(error.kind !== 'network' && error.correlationId
            ? { correlationId: error.correlationId }
            : {})}
          {...(onRetry ? { onRetry } : {})}
          {...(className ? { className } : {})}
        />
      );
  }
}
