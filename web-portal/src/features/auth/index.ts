/**
 * Public surface of the auth feature (app/* composes only through here).
 * Everything OIDC-shaped — UserManager, coordinator, claims mapping — stays
 * feature-private; the rest of the app consumes the shared Identity /
 * SessionControls contracts exactly as it did with the Phase 1 dev adapter.
 */
export { AuthProvider, useAuth, useOptionalAuth } from './AuthProvider';
export type {
  AuthContextValue,
  AuthProviderProps,
  AuthState,
  ContinueSessionOutcome,
  SessionEndReason,
} from './AuthProvider';
export { SessionExpiryWarning } from './components/SessionExpiryWarning';
export { useSessionIdle } from './session/use-session-idle';
export type { SessionIdlePhase, SessionIdleSnapshot } from './session/idle-monitor';
export { RequireAuth } from './guards/RequireAuth';
export type { LoginLocationState } from './guards/RequireAuth';
export { LoginPage } from './pages/LoginPage';
export { CallbackPage } from './pages/CallbackPage';
export { completeSilentCallback, SILENT_CALLBACK_PATH } from './silent-callback';
