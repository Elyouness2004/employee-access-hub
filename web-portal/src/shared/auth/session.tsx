import { createContext, useContext, type ReactNode } from 'react';

/**
 * Session-control contract — the shared seam through which shell components
 * (UserMenu) reach real authentication actions without importing the auth
 * feature (shared/* never imports features/*).
 *
 * The Phase 2 OIDC provider supplies the implementation. When no provider is
 * mounted (dev mock identity, isolated component tests) the hook returns
 * `null` and consumers render their honest "no real session" state instead.
 */
export interface SessionControls {
  /** Ends the session: local state cleared first, then Keycloak end-session. */
  signOut: () => void;
}

const SessionControlsContext = createContext<SessionControls | null>(null);

export function SessionControlsProvider({
  controls,
  children,
}: {
  controls: SessionControls;
  children: ReactNode;
}) {
  return (
    <SessionControlsContext.Provider value={controls}>{children}</SessionControlsContext.Provider>
  );
}

/** Real session actions, or `null` when no real session exists (dev mock). */
export function useSessionControls(): SessionControls | null {
  return useContext(SessionControlsContext);
}
