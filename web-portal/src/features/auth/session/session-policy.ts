import { env } from '@/config/env';

/**
 * The client-side session-timeout policy — a MIRROR of the Keycloak realm's
 * session settings, not a second source of truth.
 *
 * Verified realm values (keycloak-config/realm-employee-hub.json):
 *   ssoSessionIdleTimeout   1800 s  (30 min of inactivity ends the SSO session)
 *   ssoSessionMaxLifespan  28800 s  (8 h absolute cap — re-authentication is
 *                                    mandatory past it; it cannot be extended)
 *   accessTokenLifespan      300 s  (NOT a session timeout: renewal is silent
 *                                    and automatic, so warning on it would fire
 *                                    every ~4 min about a non-event)
 *
 * Keycloak publishes none of these to a client, so they arrive through
 * `VITE_SESSION_*` (config/env.ts) and a deployment that retunes the realm must
 * retune them together. Nothing here is a security control: the timer warns the
 * user and locks an idle page, while the server alone decides whether a session
 * is still valid.
 */
export interface SessionPolicy {
  /** Inactivity before the client locks the page (mirrors `ssoSessionIdleTimeout`). */
  idleTimeoutMs: number;
  /** Lead time of the warning ahead of the IDLE deadline (≥60 s). */
  warningMs: number;
  /** Absolute session lifetime (mirrors `ssoSessionMaxLifespan`); never extendable. */
  maxLifetimeMs: number;
  /**
   * Lead time ahead of the ABSOLUTE deadline. Longer than the idle one on
   * purpose: an idle warning can be dismissed by simply carrying on working,
   * whereas this one cannot be extended at all — the only response is to save
   * and sign in again, and a minute is not enough time to do that.
   */
  lifetimeWarningMs: number;
}

/** Lead time for the unextendable cap, unless the policy is too short to allow it. */
const LIFETIME_WARNING_MS = 5 * 60_000;

export function sessionPolicyFromEnv(): SessionPolicy {
  return sessionPolicy({
    idleTimeoutMs: env.sessionIdleTimeoutSeconds * 1000,
    warningMs: env.sessionWarningSeconds * 1000,
    maxLifetimeMs: env.sessionMaxLifetimeSeconds * 1000,
  });
}

/** Fill in the derived lead time; exported so tests build policies the same way. */
export function sessionPolicy(
  base: Omit<SessionPolicy, 'lifetimeWarningMs'> & { lifetimeWarningMs?: number },
): SessionPolicy {
  return {
    ...base,
    lifetimeWarningMs:
      base.lifetimeWarningMs ??
      // Never more than half the session: a warning that is showing from the
      // moment you sign in is noise, not a warning.
      Math.min(Math.max(base.warningMs, LIFETIME_WARNING_MS), Math.floor(base.maxLifetimeMs / 2)),
  };
}
