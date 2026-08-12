import { lazy, Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';

import { env, useMockIdentity } from '@/config/env';
import { AuthProvider } from '@/features/auth';
import { TooltipProvider } from '@/shared/components/ui';
import { ThemeProvider } from '@/shared/theme/ThemeProvider';

import { QueryProvider } from './providers/QueryProvider';
import { RootErrorBoundary } from './RootErrorBoundary';
import { router } from './router/router';

// Dev-only mock identity branch: `env.isDev` is statically false in
// production builds, so the chunk (fixtures, role switcher wiring, inert auth
// mode) is never emitted there — production has exactly one identity source:
// Keycloak via the OIDC provider.
const DevIdentityBranch = env.isDev ? lazy(() => import('./dev/DevIdentityBranch')) : null;

/**
 * Provider composition — the only layer that sees everything.
 *
 * QueryProvider sits above the identity source: sign-out clears the query
 * cache before the end-session redirect. The identity source is either the
 * real OIDC AuthProvider (always, in production) or — dev builds with
 * VITE_DEV_AUTH=mock only — the Phase 1 fixture adapter. Both feed the same
 * shared contracts; nothing below can tell them apart.
 */
export function App() {
  const routedApp = (
    <TooltipProvider delayDuration={300}>
      <RouterProvider router={router} />
    </TooltipProvider>
  );

  return (
    <RootErrorBoundary>
      <ThemeProvider>
        <QueryProvider>
          {DevIdentityBranch && useMockIdentity ? (
            <Suspense fallback={null}>
              <DevIdentityBranch>{routedApp}</DevIdentityBranch>
            </Suspense>
          ) : (
            <AuthProvider mode="oidc">{routedApp}</AuthProvider>
          )}
        </QueryProvider>
      </ThemeProvider>
    </RootErrorBoundary>
  );
}
