import { getUserManager } from './oidc/user-manager';

/**
 * The silent-renewal iframe target. main.tsx short-circuits this path BEFORE
 * mounting React: the hidden iframe only needs to hand the authorization
 * response back to the opening tab's UserManager (postMessage) — booting the
 * whole SPA inside it would be wasted work and could recurse into another
 * silent attempt.
 */
export const SILENT_CALLBACK_PATH = '/auth/silent';

export async function completeSilentCallback(): Promise<void> {
  try {
    await getUserManager().signinSilentCallback();
  } catch {
    // The opener tab times out and handles the failure; the iframe stays inert.
  }
}
