import { Outlet } from 'react-router-dom';

import { useMockIdentity } from '@/config/env';
import { RequireAuth } from '@/features/auth';

/**
 * The protected branch's entry element. In real builds this is the OIDC
 * authentication gate (splash → login redirect → identity). Under the
 * dev mock identity (`VITE_DEV_AUTH=mock`, dev builds only — the flag is
 * hard-false in production) the identity is already provided above the
 * router, so the gate passes through.
 */
export function AuthGate() {
  if (useMockIdentity) return <Outlet />;
  return <RequireAuth />;
}
