import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

import { env } from '@/config/env';
import { isApiError } from '@/shared/api';
import { ErrorState, PageContainer } from '@/shared/components';

import { NotFoundPage } from '../pages/NotFoundPage';

/**
 * Region-level error boundary rendered INSIDE the shell, so a failing page
 * never blanks the navigation. Users see a safe message (plus the correlation
 * id for API failures); stack traces render only in development.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }

  if (isApiError(error) && error.kind !== 'network') {
    return (
      <PageContainer>
        <ErrorState
          detail={'detail' in error && error.detail ? error.detail : 'The request failed.'}
          correlationId={error.correlationId}
          onRetry={() => window.location.reload()}
          retryLabel="Reload page"
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <ErrorState
        detail="This page hit an unexpected error. The rest of the application is unaffected."
        onRetry={() => window.location.reload()}
        retryLabel="Reload page"
        diagnostics={
          env.isDev && error instanceof Error ? (
            <details className="mt-4">
              <summary className="cursor-pointer text-caption text-ink-muted">
                Development diagnostics
              </summary>
              <pre className="mt-2 overflow-x-auto rounded-md bg-surface-2 p-3 font-mono text-mono-sm text-ink">
                {error.stack ?? error.message}
              </pre>
            </details>
          ) : null
        }
      />
    </PageContainer>
  );
}
