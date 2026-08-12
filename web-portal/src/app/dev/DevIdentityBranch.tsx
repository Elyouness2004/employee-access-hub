import type { ReactNode } from 'react';

import { AuthProvider } from '@/features/auth';

import { DevIdentityProvider } from './DevIdentityProvider';

/**
 * ⚠️ DEVELOPMENT-ONLY identity composition. ⚠️
 *
 * Mock fixtures feed the shared Identity contract (as in Phase 1) and the
 * auth feature runs in 'disabled' mode — an inert context so the auth routes
 * stay mountable, constructing no OIDC plumbing and no tokens. Loaded only
 * through App.tsx's `env.isDev`-guarded lazy import, so this module (and the
 * fixtures underneath it) is never part of a production bundle.
 */
export default function DevIdentityBranch({ children }: { children: ReactNode }) {
  return (
    <DevIdentityProvider>
      <AuthProvider mode="disabled">{children}</AuthProvider>
    </DevIdentityProvider>
  );
}
