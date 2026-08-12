import { useQueryClient } from '@tanstack/react-query';
import { ErrorResponse, User, type UserManager } from 'oidc-client-ts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  resetAccessTokenProvider,
  resetSessionRenewer,
  resumeRequests,
  setAccessTokenProvider,
  setSessionRenewer,
  suspendRequests,
} from '@/shared/api';
import { SessionControlsProvider, type Identity } from '@/shared/auth';

import { createAuthChannel, type AuthChannel } from './cross-tab/auth-channel';
import {
  browserLocks,
  CrossTabRefreshCoordinator,
  type RenewalAttempt,
} from './cross-tab/refresh-coordinator';
import { identityFromUser } from './oidc/claims';
import { getUserManager } from './oidc/user-manager';
import { HOME_PATH, sanitizeReturnPath } from './return-path';
import type { SessionEndReason } from './session/ended-copy';
import {
  IDLE_SNAPSHOT_INACTIVE,
  SessionIdleMonitor,
  type SessionIdleSnapshot,
} from './session/idle-monitor';
import { sessionPolicyFromEnv, type SessionPolicy } from './session/session-policy';

/** Re-exported so consumers need one import for the auth surface. */
export type { SessionEndReason };

/**
 * The OIDC authentication provider — the ONLY module that drives the
 * UserManager. It owns the auth state machine, the renewal schedule, the
 * cross-tab coordinator, the client-side idle model, and the shared/api seams
 * (token provider + 401 renewer + request gate). UI components never see
 * oidc-client-ts; they consume `useAuth()` here or the shared
 * Identity/SessionControls contracts.
 *
 * State machine:
 *
 *   restoring ──(session found: memory / tab handoff / SSO cookie)──▶ authenticated
 *   restoring ──(no session anywhere)─────────────────────────────▶ unauthenticated
 *   authenticated ──(renewal definitively fails)──────────────────▶ ended('expired')
 *   authenticated ──(client idle limit reached)───────────────────▶ ended('idle')
 *   authenticated ──(absolute lifetime reached)───────────────────▶ ended('lifetime')
 *   authenticated ──(renewal keeps failing on the network)────────▶ ended('unreachable')
 *   ended('idle'|'unreachable') ──(continueSession verifies)──────▶ authenticated
 *   ended(*) ──(interactive login via Keycloak)───────────────────▶ authenticated
 *   authenticated ──(sign-out, this tab or a peer)────────────────▶ unauthenticated
 *
 * The four `ended` reasons are NOT interchangeable and the UI must not merge
 * them: `expired` is a fact from the authorization server; `idle` is this
 * client's advisory lock (the Keycloak session may well still be alive);
 * `lifetime` is the one limit nobody can extend; and `unreachable` means we
 * never got an answer at all — reporting that as `expired` would assert
 * something about the session that this client cannot know.
 *
 * Renewal is scheduled by this provider's own timer (~60 s before token expiry —
 * `automaticSilentRenew` is off) and always funnels through the cross-tab
 * coordinator, as do 401-triggered renewals from the HTTP layer. One code
 * path, one lock. A session that has ended stops renewing entirely: every
 * refresh grant resets Keycloak's idle clock, so a locked page that kept
 * renewing would hold an abandoned SSO session open — the exact behavior the
 * idle model exists to end.
 */

export type UnauthenticatedReason = 'no-session' | 'signed-out' | 'auth-error';

export type AuthState =
  | { status: 'restoring' }
  | { status: 'authenticated'; identity: Identity }
  | { status: 'unauthenticated'; reason: UnauthenticatedReason }
  /**
   * The session ended. `identity` is the last known one, kept so the route
   * tree stays mounted under the lock overlay — the user's page, filters and
   * unsaved input survive re-authentication. It is decoded display data only;
   * the tokens are gone or unusable and the request gate is shut.
   */
  | { status: 'expired'; reason: SessionEndReason; identity: Identity | null };

/** Outcome of an explicit "continue session" request. */
export type ContinueSessionOutcome =
  /** Verified with Keycloak and resumed in place — nothing was lost. */
  | 'continued'
  /** Keycloak will not extend this session; interactive sign-in is required. */
  | 'reauthentication-required'
  /** Could not reach the identity provider — the session may still be fine. */
  | 'unavailable';

/** The idle model as consumers see it (no timers, no DOM, no OIDC). */
export interface SessionIdleController {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => SessionIdleSnapshot;
  /** Register real user activity (in-app navigation calls this). */
  recordActivity: (at?: number) => void;
}

export interface AuthContextValue {
  state: AuthState;
  /** 'oidc' in every real build; 'disabled' only under the dev mock identity. */
  mode: 'oidc' | 'disabled';
  /** Start the interactive login redirect, remembering the intended route. */
  signIn: (returnTo?: string) => Promise<void>;
  /** End the session everywhere: local state → peers → Keycloak end-session. */
  signOut: () => Promise<void>;
  /** CallbackPage only: finish the code exchange; resolves the safe return path. */
  completeSignIn: () => Promise<string>;
  /**
   * Verify the session with Keycloak and, if it is still valid, resume in
   * place: idle clock restarted, request gate reopened, route untouched.
   * Never claims success on the strength of the local timer alone.
   */
  continueSession: () => Promise<ContinueSessionOutcome>;
  /** Client-side idle model (advisory — Keycloak remains the authority). */
  idle: SessionIdleController;
  /** The mirrored realm policy, for copy that must state real numbers. */
  sessionPolicy: SessionPolicy;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within an AuthProvider');
  return value;
}

/**
 * The auth context when one exists, `null` otherwise. Shell components that
 * merely *offer* session UI (the expiry warning) use this so they stay
 * mountable in isolation tests and under the dev mock identity.
 */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}

/** Renewal margin before expiry (matches accessTokenExpiringNotificationTime). */
const RENEW_BEFORE_EXPIRY_S = 60;
/** Retry delay after a transient renewal failure while the token still lives. */
const TRANSIENT_RETRY_MS = 20_000;

/** Test seam: everything environment-shaped is injectable. */
export interface AuthProviderDeps {
  manager?: UserManager;
  channel?: AuthChannel;
  locks?: Pick<LockManager, 'request'> | null;
  handoffTimeoutMs?: number;
  lockWaitTimeoutMs?: number;
  /** Override the mirrored realm timeouts (tests use seconds, not half-hours). */
  sessionPolicy?: SessionPolicy;
  idleMonitor?: SessionIdleMonitor;
}

export interface AuthProviderProps {
  /**
   * 'oidc' — real Keycloak authentication (the only mode production builds
   * can reach). 'disabled' — inert context for dev mock-identity builds so
   * auth routes stay mountable; constructs no OIDC plumbing at all.
   */
  mode: 'oidc' | 'disabled';
  deps?: AuthProviderDeps;
  children: ReactNode;
}

function isSessionGone(error: unknown): boolean {
  return (
    error instanceof ErrorResponse &&
    typeof error.error === 'string' &&
    ['invalid_grant', 'login_required', 'interaction_required', 'consent_required'].includes(
      error.error,
    )
  );
}

function sameIdentity(a: Identity, b: Identity): boolean {
  return (
    a.subject === b.subject &&
    a.username === b.username &&
    a.displayName === b.displayName &&
    a.roles.length === b.roles.length &&
    a.roles.every((role, i) => role === b.roles[i])
  );
}

/**
 * When this session was authenticated, from the ID token's `auth_time` claim
 * (seconds). Absent → the absolute-lifetime deadline is not tracked at all:
 * guessing it would lock people out early, and the server enforces the real
 * cap regardless.
 */
function authenticatedAtOf(user: User | null): number | null {
  const authTime = user?.profile.auth_time;
  return typeof authTime === 'number' ? authTime * 1000 : null;
}

const INERT_IDLE: SessionIdleController = {
  subscribe: () => () => undefined,
  getSnapshot: () => IDLE_SNAPSHOT_INACTIVE,
  recordActivity: () => undefined,
};

export function AuthProvider({ mode, deps, children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>(
    mode === 'oidc' ? { status: 'restoring' } : { status: 'unauthenticated', reason: 'no-session' },
  );

  // Created during the first render, not in an effect: child effects run
  // BEFORE the provider's effect, and /auth/callback completes the code
  // exchange from one of them — the manager must already exist.
  const [manager] = useState<UserManager | null>(() =>
    mode === 'oidc' ? (deps?.manager ?? getUserManager()) : null,
  );
  const [sessionPolicy] = useState<SessionPolicy>(
    () => deps?.sessionPolicy ?? sessionPolicyFromEnv(),
  );

  const userRef = useRef<User | null>(null);
  const stateRef = useRef<AuthState>(state);
  stateRef.current = state;
  /** Last decoded identity — kept through expiry so the page stays mounted. */
  const lastIdentityRef = useRef<Identity | null>(null);
  const coordinatorRef = useRef<CrossTabRefreshCoordinator | null>(null);
  const renewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Pending "renew when this tab becomes visible again" subscription. */
  const visibilityWaitRef = useRef<(() => void) | null>(null);

  const [idleMonitor] = useState<SessionIdleMonitor | null>(() => {
    if (mode !== 'oidc') return null;
    return (
      deps?.idleMonitor ??
      new SessionIdleMonitor({
        policy: sessionPolicy,
        onActivity: (at) => coordinatorRef.current?.announceActivity(at),
      })
    );
  });

  const clearRenewTimer = useCallback(() => {
    if (renewTimerRef.current !== null) {
      clearTimeout(renewTimerRef.current);
      renewTimerRef.current = null;
    }
    visibilityWaitRef.current?.();
    visibilityWaitRef.current = null;
  }, []);

  /** Local sign-out bookkeeping (both user-initiated and peer-propagated). */
  const clearLocalSession = useCallback(
    (reason: UnauthenticatedReason) => {
      userRef.current = null;
      lastIdentityRef.current = null;
      clearRenewTimer();
      idleMonitor?.stop();
      resumeRequests();
      void manager?.removeUser().catch(() => undefined);
      queryClient.clear();
      setState({ status: 'unauthenticated', reason });
    },
    [clearRenewTimer, idleMonitor, manager, queryClient],
  );

  /**
   * The session ended — lock the page instead of destroying it.
   *
   * The route tree stays mounted (the overlay covers it), so the request gate
   * is what guarantees a locked page makes no authenticated calls. In-flight
   * queries are cancelled but the cache is KEPT: that cache is the user's page.
   */
  const endSession = useCallback(
    (
      reason: SessionEndReason,
      { announce, dropTokens }: { announce: boolean; dropTokens: boolean },
    ) => {
      clearRenewTimer();
      idleMonitor?.stop();
      suspendRequests();
      void queryClient.cancelQueries();
      if (dropTokens) {
        userRef.current = null;
        void manager?.removeUser().catch(() => undefined);
      }
      if (announce) coordinatorRef.current?.announceSessionExpired(reason);
      setState({ status: 'expired', reason, identity: lastIdentityRef.current });
    },
    [clearRenewTimer, idleMonitor, manager, queryClient],
  );

  const runScheduledRenewal = useRef<() => void>(() => undefined);

  const scheduleRenewal = useCallback(
    (user: User) => {
      clearRenewTimer();
      const delayMs = Math.max((user.expires_in ?? 0) - RENEW_BEFORE_EXPIRY_S, 5) * 1000;
      renewTimerRef.current = setTimeout(() => runScheduledRenewal.current(), delayMs);
    },
    [clearRenewTimer],
  );

  /** Adopt a user (own renewal, callback, peer fan-out) into local state. */
  const adoptUser = useCallback(
    (user: User, { announce }: { announce: boolean }) => {
      userRef.current = user;
      void manager?.storeUser(user).catch(() => undefined);
      const identity = identityFromUser(user);
      if (!identity) {
        clearLocalSession('auth-error');
        return;
      }
      lastIdentityRef.current = identity;
      if (announce) coordinatorRef.current?.announceUserUpdated(user.toStorageString());

      // A peer's fresh token does not unlock an ended session: only a verified
      // continue-session (or a new interactive sign-in) does. Renewing here
      // would also restart the timer on a page nobody is using.
      if (stateRef.current.status === 'expired') {
        setState({ ...stateRef.current, identity });
        return;
      }

      scheduleRenewal(user);
      idleMonitor?.start({ authenticatedAt: authenticatedAtOf(user) });
      setState((prev) =>
        prev.status === 'authenticated' && sameIdentity(prev.identity, identity)
          ? prev
          : { status: 'authenticated', identity },
      );
    },
    [clearLocalSession, idleMonitor, manager, scheduleRenewal],
  );

  /** Resume a locked session after it was VERIFIED with the authorization server. */
  const unlockSession = useCallback(
    ({ wasLocked }: { wasLocked: boolean }) => {
      resumeRequests();
      idleMonitor?.resume({ authenticatedAt: authenticatedAtOf(userRef.current) });
      const user = userRef.current;
      const identity = user ? identityFromUser(user) : lastIdentityRef.current;
      if (!identity) return;
      lastIdentityRef.current = identity;
      if (user) scheduleRenewal(user);
      setState({ status: 'authenticated', identity });
      // Only worth doing after a real lock: data may have gone stale while the
      // gate was shut. Extending from the warning bar changed nothing, and
      // invalidating the whole cache for a no-op click is pure churn.
      if (wasLocked) void queryClient.invalidateQueries();
    },
    [idleMonitor, queryClient, scheduleRenewal],
  );

  // ── OIDC lifecycle ────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'oidc' || !manager || !idleMonitor) return;

    const channel = deps?.channel ?? createAuthChannel();
    const ownsChannel = !deps?.channel;
    /**
     * Set by this effect's cleanup. The boot sequence below is async and outlives
     * a teardown, so every step re-checks it: StrictMode's mount → cleanup →
     * mount disposes the first coordinator while its boot is still awaiting, and
     * a disposed boot must not go on to drive state the live effect now owns
     * (announcing a signed-out state over the second boot's restored session).
     */
    let disposed = false;

    /** One real silent renewal / silent sign-in in THIS tab. Never throws. */
    const performRenewal = async (): Promise<RenewalAttempt> => {
      try {
        // With an in-memory refresh token this is a refresh grant; without one
        // (fresh boot) it is an iframe prompt=none against the SSO cookie.
        const user = await manager.signinSilent();
        if (!user) return { ok: false, reason: 'transient' };
        adoptUser(user, { announce: false }); // the coordinator fans it out
        return { ok: true, payload: user.toStorageString() };
      } catch (error) {
        return { ok: false, reason: isSessionGone(error) ? 'session-gone' : 'transient' };
      }
    };

    const coordinator = new CrossTabRefreshCoordinator({
      channel,
      locks: deps?.locks !== undefined ? deps.locks : browserLocks(),
      lockWaitTimeoutMs: deps?.lockWaitTimeoutMs,
      handoffTimeoutMs: deps?.handoffTimeoutMs,
      callbacks: {
        performRenewal,
        currentUserPayload: () => userRef.current?.toStorageString() ?? null,
        currentTokenSecondsRemaining: () => userRef.current?.expires_in ?? null,
        onExternalUserUpdated: (payload) => {
          adoptUser(User.fromStorageString(payload), { announce: false });
        },
        onExternalSessionExpired: (reason) =>
          endSession(reason, { announce: false, dropTokens: reason === 'expired' }),
        onExternalSignedOut: () => clearLocalSession('signed-out'),
        // A person working in another tab keeps this one alive: the idle clock
        // is a property of the browser, not of a single document.
        onExternalActivity: (at) => idleMonitor.recordActivity(at, { broadcast: false }),
        onExternalSessionContinued: () => {
          if (stateRef.current.status === 'expired') unlockSession({ wasLocked: true });
          else idleMonitor.recordActivity(Date.now(), { broadcast: false });
        },
      },
    });
    coordinatorRef.current = coordinator;

    /** Timer-driven renewal (~60 s before expiry). */
    runScheduledRenewal.current = () => {
      // A hidden tab does NOT renew. Every refresh grant resets Keycloak's
      // `lastSessionRefresh`, so a background tab renewing on a timer would
      // hold the SSO session open for the full 8 h max lifespan and silently
      // defeat the realm's 30-minute idle timeout. Instead the tab lets the
      // token lapse and renews when it becomes visible again (or when the
      // next request 401s) — inside the idle window that succeeds silently;
      // beyond it the session is genuinely gone, which is the intent.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        const onVisible = () => {
          if (document.visibilityState === 'hidden') return;
          visibilityWaitRef.current?.();
          visibilityWaitRef.current = null;
          runScheduledRenewal.current();
        };
        visibilityWaitRef.current?.();
        document.addEventListener('visibilitychange', onVisible);
        visibilityWaitRef.current = () =>
          document.removeEventListener('visibilitychange', onVisible);
        return;
      }
      void coordinator.renew().then((result) => {
        if (result.status === 'renewed' || result.status === 'adopted') return; // adopted already
        if (result.reason === 'session-gone') {
          endSession('expired', { announce: true, dropTokens: true });
          return;
        }
        // Transient (network / lock timeout): the current token may still be
        // valid — retry shortly. Once it is not, the session becomes UNUSABLE,
        // which is not the same as expired: we never asked the server, so
        // saying "your session is no longer valid" would be a claim we cannot
        // make. Keep the refresh token so "Try again" can settle it later.
        const remaining = userRef.current?.expires_in ?? 0;
        if (remaining > 30) {
          clearRenewTimer();
          renewTimerRef.current = setTimeout(
            () => runScheduledRenewal.current(),
            TRANSIENT_RETRY_MS,
          );
        } else {
          endSession('unreachable', { announce: false, dropTokens: false });
        }
      });
    };

    // The idle model drives the ended state: reaching a client-side deadline
    // locks the page. Note it announces its reason so every tab shows the same
    // thing, and keeps the tokens (an idle lock is advisory — continue-session
    // needs the refresh token to ask Keycloak whether the session is alive).
    const unsubscribeIdle = idleMonitor.subscribe(() => {
      if (idleMonitor.getSnapshot().phase !== 'expired') return;
      if (stateRef.current.status !== 'authenticated') return;
      const reason = idleMonitor.getSnapshot().deadline === 'lifetime' ? 'lifetime' : 'idle';
      endSession(reason, { announce: true, dropTokens: false });
    });

    // shared/api seams: Bearer source + the 401 renew-once hook.
    setAccessTokenProvider(() => userRef.current?.access_token ?? null);
    setSessionRenewer(async () => {
      if (!userRef.current) return null;
      const result = await coordinator.renew();
      if (result.status === 'renewed' || result.status === 'adopted') {
        return userRef.current?.access_token ?? null;
      }
      if (result.reason === 'session-gone') {
        endSession('expired', { announce: true, dropTokens: true });
      }
      return null;
    });

    // ── Boot: restore the session without user interaction ─────────────────
    // Skip on the OIDC plumbing routes — /auth/callback completes sign-in
    // explicitly (completeSignIn), and a parallel silent attempt would race
    // the code exchange.
    const bootPath = window.location.pathname;
    if (bootPath !== '/auth/callback' && bootPath !== '/auth/silent') {
      void (async () => {
        const existing = await manager.getUser().catch(() => null);
        if (disposed) return;
        if (existing && !existing.expired) {
          adoptUser(existing, { announce: false });
          return;
        }
        // 1) Cheapest: adopt the session of an already-open tab, keeping the
        //    whole browser on one refresh-token lineage.
        const handoff = await coordinator.requestHandoff();
        if (disposed) return;
        if (handoff) {
          const user = User.fromStorageString(handoff);
          if (!user.expired) {
            adoptUser(user, { announce: false });
            return;
          }
        }
        // 2) Silent sign-in against the Keycloak SSO cookie. Runs under the
        //    cross-tab refresh lock (via the coordinator) so two tabs booting
        //    together cannot mint two token lineages.
        const result = await coordinator.renew();
        if (disposed) return;
        if (result.status === 'renewed' || result.status === 'adopted') return; // adopted
        setState({ status: 'unauthenticated', reason: 'no-session' });
      })();
    }

    return () => {
      disposed = true;
      clearRenewTimer();
      unsubscribeIdle();
      idleMonitor.dispose();
      resetAccessTokenProvider();
      resetSessionRenewer();
      resumeRequests();
      coordinator.dispose();
      coordinatorRef.current = null;
      if (ownsChannel) channel.close();
      runScheduledRenewal.current = () => undefined;
    };
    // The callbacks close over refs, and `deps` is a test-only injection that
    // is stable for the provider's lifetime: this effect runs once per mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, manager, idleMonitor]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const signIn = useCallback(
    async (returnTo?: string) => {
      if (mode !== 'oidc') return;
      await manager?.signinRedirect({
        state: { returnTo: sanitizeReturnPath(returnTo) },
      });
    },
    [manager, mode],
  );

  const completeSignIn = useCallback(async () => {
    if (!manager) throw new Error('Authentication is not active in this build');
    const user = await manager.signinRedirectCallback();
    // A fresh interactive sign-in supersedes any ended state — start clean.
    resumeRequests();
    setState({ status: 'restoring' });
    stateRef.current = { status: 'restoring' };
    adoptUser(user, { announce: true });
    const returnTo = (user.state as { returnTo?: unknown } | undefined)?.returnTo;
    return sanitizeReturnPath(returnTo ?? HOME_PATH);
  }, [adoptUser, manager]);

  const signOut = useCallback(async () => {
    if (mode !== 'oidc') return;
    // Order (FRONTEND-ARCHITECTURE §5): local state and cache first, peers
    // second, Keycloak end-session redirect last. signoutRedirect reads the
    // stored user for id_token_hint and removes it itself.
    userRef.current = null;
    lastIdentityRef.current = null;
    clearRenewTimer();
    idleMonitor?.stop();
    resumeRequests();
    queryClient.clear();
    coordinatorRef.current?.announceSignedOut();
    setState({ status: 'unauthenticated', reason: 'signed-out' });
    await manager?.signoutRedirect().catch(async () => {
      // End-session redirect failed (e.g. Keycloak unreachable): the local
      // session is already cleared; make sure the stored user is gone too.
      await manager.removeUser().catch(() => undefined);
    });
  }, [clearRenewTimer, idleMonitor, manager, mode, queryClient]);

  const continueSession = useCallback(async (): Promise<ContinueSessionOutcome> => {
    if (mode !== 'oidc' || !idleMonitor) return 'unavailable';

    const current = stateRef.current;
    const snapshot = idleMonitor.getSnapshot();
    const wasLocked = current.status === 'expired';

    // Only two ends can be continued from: the advisory idle lock, and one we
    // never managed to ask about. `lifetime` and `expired` are settled — the
    // absolute cap cannot be extended by anyone, and the server has already
    // refused — so offering to continue would be a lie.
    if (current.status === 'expired') {
      if (current.reason !== 'idle' && current.reason !== 'unreachable') {
        return 'reauthentication-required';
      }
    } else if (current.status !== 'authenticated') {
      return 'reauthentication-required';
    } else if (snapshot.phase === 'warning' && snapshot.deadline === 'lifetime') {
      return 'reauthentication-required';
    }

    // The gate stays shut: renewal runs through oidc-client-ts's own fetch, not
    // `apiClient`, so opening it here would only let the locked page's own
    // queries out while we wait.
    const result = await coordinatorRef.current?.renew();

    if (result && (result.status === 'renewed' || result.status === 'adopted')) {
      unlockSession({ wasLocked });
      coordinatorRef.current?.announceSessionContinued(Date.now());
      return 'continued';
    }
    if (result?.status === 'failed' && result.reason === 'session-gone') {
      endSession('expired', { announce: true, dropTokens: true });
      return 'reauthentication-required';
    }
    // Transient: we do NOT know that the session is gone, so we must not say
    // so. An unlocked page stays usable (its token may still be fine); a locked
    // one stays locked, and the user can try again.
    return 'unavailable';
  }, [endSession, idleMonitor, mode, unlockSession]);

  const idle = useMemo<SessionIdleController>(
    () =>
      idleMonitor
        ? {
            subscribe: (listener) => idleMonitor.subscribe(listener),
            getSnapshot: idleMonitor.getSnapshot,
            recordActivity: (at) => idleMonitor.recordActivity(at),
          }
        : INERT_IDLE,
    [idleMonitor],
  );

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      state,
      mode,
      signIn,
      signOut,
      completeSignIn,
      continueSession,
      idle,
      sessionPolicy,
    }),
    [state, mode, signIn, signOut, completeSignIn, continueSession, idle, sessionPolicy],
  );

  const sessionControls = useMemo(() => ({ signOut: () => void signOut() }), [signOut]);

  if (mode !== 'oidc') {
    return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
  }

  return (
    <AuthContext.Provider value={contextValue}>
      <SessionControlsProvider controls={sessionControls}>{children}</SessionControlsProvider>
    </AuthContext.Provider>
  );
}
