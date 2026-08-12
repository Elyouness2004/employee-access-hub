import type { SessionPolicy } from './session-policy';

/**
 * The client-side session-idle model.
 *
 * FOUR DISTINCT CONCEPTS, deliberately not conflated:
 *
 *  1. **Access-token renewal** (~every 4 min) — invisible plumbing. It is NOT
 *     activity and never touches this monitor; a page renewing on a timer says
 *     nothing about whether a human is present.
 *  2. **User activity** — a real interaction (pointer, key, touch, form input,
 *     in-app navigation). Only this resets the idle clock.
 *  3. **Idle timeout** — inactivity reaching `policy.idleTimeoutMs`. Mirrors the
 *     realm's `ssoSessionIdleTimeout` so the page locks around the time the
 *     server would stop honoring the session. Extendable by the user.
 *  4. **Absolute maximum lifetime** — `policy.maxLifetimeMs` after authentication.
 *     Mirrors `ssoSessionMaxLifespan`. **Not** extendable: past it Keycloak
 *     requires interactive re-authentication, so the UI must not offer "continue".
 *
 * The monitor is a plain observable (no React) so it can be unit-tested with
 * fake timers and consumed through `useSyncExternalStore`. It emits only on
 * PHASE changes — never once per second — so an idle app re-renders at most
 * twice in half an hour. The visible countdown is a component-local concern.
 *
 * What is deliberately NOT activity: token refreshes, background polling,
 * query refetches, React renders, `visibilitychange`, and programmatic focus.
 * A hidden tab therefore keeps counting down and can never keep an abandoned
 * session alive.
 *
 * This is a usability control, not a security boundary — Keycloak decides
 * whether a session is valid, and a locked page still proves nothing about it.
 */

export type SessionIdlePhase = 'active' | 'warning' | 'expired';

/** Which limit is nearest — decides the copy and whether extending is possible. */
export type SessionDeadlineKind = 'idle' | 'lifetime';

export interface SessionIdleSnapshot {
  phase: SessionIdlePhase;
  deadline: SessionDeadlineKind;
  /** Epoch ms of the nearest deadline; `Infinity` when nothing is tracked. */
  deadlineAt: number;
}

/** The inert snapshot: monitoring is off (dev mock identity, signed out, tests). */
export const IDLE_SNAPSHOT_INACTIVE: SessionIdleSnapshot = {
  phase: 'active',
  deadline: 'idle',
  deadlineAt: Infinity,
};

/**
 * Events that mean "a person is using this page". All are user-initiated by
 * construction: none of them can be raised by our own rendering, by a focus
 * trap opening a dialog, or by a background refresh.
 *
 * `wheel` is here because reading is using the page — someone working through a
 * long audit table with the wheel touches nothing else for minutes at a time.
 * `mousemove` is deliberately NOT: a cursor resting on a page nobody is looking
 * at would keep the session alive forever.
 */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'input'] as const;

/**
 * Marks the session-timeout UI itself (warning bar, lock overlay). Interacting
 * with a control that says "your session is about to expire" is not using the
 * application — and counting it would be self-defeating: the pointerdown on
 * "Continue session" would reset the clock, unmount the banner, and throw the
 * click away before it ever reached the handler that verifies the session.
 */
export const SESSION_UI_ATTRIBUTE = 'data-session-ui';

export interface IdleMonitorTarget {
  addEventListener: Document['addEventListener'];
  removeEventListener: Document['removeEventListener'];
}

export interface IdleMonitorOptions {
  policy: SessionPolicy;
  /** Tell peers this tab saw activity (already throttled when called). */
  onActivity?: (at: number) => void;
  now?: () => number;
  /** Ignore repeated activity within this window (default 1 s). */
  activityThrottleMs?: number;
  /** Minimum gap between cross-tab activity broadcasts (default 15 s). */
  broadcastThrottleMs?: number;
  /** DOM source of activity events; `null` disables listeners (unit tests). */
  target?: IdleMonitorTarget | null;
}

export interface StartOptions {
  /**
   * When this session was authenticated (epoch ms) — the `auth_time` claim.
   * `null` disables the absolute-lifetime deadline: without the claim the SPA
   * cannot know it, and inventing one would lock people out early.
   */
  authenticatedAt: number | null;
  /** Seed for the idle clock; defaults to now (opening/restoring is activity). */
  lastActivityAt?: number;
}

export class SessionIdleMonitor {
  private readonly policy: SessionPolicy;
  private readonly now: () => number;
  private readonly activityThrottleMs: number;
  private readonly broadcastThrottleMs: number;
  private readonly target: IdleMonitorTarget | null;
  private readonly onActivity: ((at: number) => void) | undefined;

  private readonly listeners = new Set<() => void>();
  private snapshot: SessionIdleSnapshot = IDLE_SNAPSHOT_INACTIVE;

  private running = false;
  private lastActivityAt = 0;
  private authenticatedAt: number | null = null;
  private lastBroadcastAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly handleDomActivity = (event: Event) => {
    const target = event.target;
    if (target instanceof Element && target.closest(`[${SESSION_UI_ATTRIBUTE}]`)) return;
    this.recordActivity();
  };

  constructor(options: IdleMonitorOptions) {
    this.policy = options.policy;
    this.now = options.now ?? (() => Date.now());
    this.activityThrottleMs = options.activityThrottleMs ?? 1_000;
    this.broadcastThrottleMs = options.broadcastThrottleMs ?? 15_000;
    this.target =
      options.target === undefined
        ? typeof document === 'undefined'
          ? null
          : document
        : options.target;
    this.onActivity = options.onActivity;
  }

  /** Begin tracking an authenticated session. Idempotent per session start. */
  start({ authenticatedAt, lastActivityAt }: StartOptions): void {
    const at = lastActivityAt ?? this.now();
    const alreadyTracking = this.running && this.authenticatedAt === authenticatedAt;
    this.authenticatedAt = authenticatedAt;
    if (alreadyTracking) {
      // Same session (e.g. a token renewal produced a new user object): keep
      // the idle clock running rather than silently extending it.
      return;
    }
    this.running = true;
    this.lastActivityAt = at;
    this.lastBroadcastAt = at;
    this.attach();
    this.settle();
  }

  /** Stop tracking (sign-out, unmount). Snapshot returns to inert. */
  stop(): void {
    this.running = false;
    this.detach();
    this.clearTimer();
    this.publishInactive();
  }

  dispose(): void {
    this.stop();
    this.listeners.clear();
  }

  /**
   * Record real user activity. Peer-sourced activity passes `broadcast: false`
   * so a single interaction cannot echo between tabs.
   *
   * Ignored once the phase is `expired`: a locked page must be revived through
   * verified re-authentication (`resume`), never by clicking on the scrim.
   */
  recordActivity(at: number = this.now(), { broadcast = true } = {}): void {
    if (!this.running || this.snapshot.phase === 'expired') return;
    if (at <= this.lastActivityAt) return;
    if (at - this.lastActivityAt < this.activityThrottleMs) return;

    this.lastActivityAt = at;
    this.settle();

    if (broadcast && this.onActivity && at - this.lastBroadcastAt >= this.broadcastThrottleMs) {
      this.lastBroadcastAt = at;
      this.onActivity(at);
    }
  }

  /**
   * Restart the clock after the session was VERIFIED with the authorization
   * server (continue-session, or a fresh interactive sign-in). The only way out
   * of the `expired` phase.
   */
  resume({ authenticatedAt }: { authenticatedAt?: number | null } = {}): void {
    if (authenticatedAt !== undefined) this.authenticatedAt = authenticatedAt;
    const at = this.now();
    this.running = true;
    this.lastActivityAt = at;
    this.lastBroadcastAt = at;
    this.attach();
    this.settle();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot = (): SessionIdleSnapshot => this.snapshot;

  /** Test/diagnostic view of the clock the snapshot is derived from. */
  get lastActivity(): number {
    return this.lastActivityAt;
  }

  // ── internals ────────────────────────────────────────────────────────────

  private attach(): void {
    if (!this.target) return;
    for (const event of ACTIVITY_EVENTS) {
      // Capture phase: a component calling stopPropagation must not make the
      // user invisible to the idle clock. Passive: never blocks scrolling.
      this.target.addEventListener(event, this.handleDomActivity, {
        capture: true,
        passive: true,
      });
    }
  }

  private detach(): void {
    if (!this.target) return;
    for (const event of ACTIVITY_EVENTS) {
      this.target.removeEventListener(event, this.handleDomActivity, { capture: true });
    }
  }

  /**
   * The two deadlines and their (different) warning leads. The absolute cap is
   * listed first so ties resolve to it: it is the deadline that cannot be
   * extended, and offering "continue" against it would be a lie.
   */
  private deadlines(): { kind: SessionDeadlineKind; at: number; lead: number }[] {
    return [
      {
        kind: 'lifetime',
        at:
          this.authenticatedAt === null
            ? Infinity
            : this.authenticatedAt + this.policy.maxLifetimeMs,
        lead: this.policy.lifetimeWarningMs,
      },
      {
        kind: 'idle',
        at: this.lastActivityAt + this.policy.idleTimeoutMs,
        lead: this.policy.warningMs,
      },
    ];
  }

  private computeSnapshot(): SessionIdleSnapshot {
    if (!this.running) return IDLE_SNAPSHOT_INACTIVE;
    const now = this.now();
    const candidates = this.deadlines();
    // Because the leads differ, "which deadline is nearest" is not the same
    // question as "which one is already warning": a cap 4 minutes out (5 min
    // lead) warns while an idle limit 2 minutes out (1 min lead) does not.
    //
    // EITHER deadline entering its own lead raises the warning, but the one
    // reported is always the NEAREST — otherwise a cap four minutes out could
    // announce itself (5 min lead) while an idle limit two minutes out stayed
    // silent (1 min lead), and the bar would both overstate the time left and
    // deny an extension that was actually available.
    const chosen = candidates.reduce((a, b) => (b.at < a.at ? b : a));
    const phase: SessionIdlePhase = candidates.some((c) => c.at <= now)
      ? 'expired'
      : candidates.some((c) => c.at - now <= c.lead)
        ? 'warning'
        : 'active';
    return { phase, deadline: chosen.kind, deadlineAt: chosen.at };
  }

  /** Recompute, notify if the phase changed, and re-arm the boundary timer. */
  private settle(): void {
    const previous = this.snapshot;
    const next = this.computeSnapshot();
    // The snapshot is always kept current, but only a PHASE change (or a switch
    // to the other deadline) notifies subscribers. `deadlineAt` moves on every
    // keystroke, and notifying on that would re-render every consumer once per
    // second while somebody types — the countdown is a component-local concern
    // precisely so that it does not cost that.
    this.snapshot = next;
    if (next.phase !== previous.phase || next.deadline !== previous.deadline) {
      for (const listener of [...this.listeners]) listener();
    }
    this.arm();
  }

  private arm(): void {
    this.clearTimer();
    if (!this.running || this.snapshot.phase === 'expired') return;
    const now = this.now();
    // The next transition is the soonest boundary of EITHER deadline still
    // ahead of us: its warning start, or the deadline itself.
    const boundaries = this.deadlines()
      .flatMap((candidate) => [candidate.at - candidate.lead, candidate.at])
      .filter((at) => at > now && Number.isFinite(at));
    if (boundaries.length === 0) return;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        this.settle();
      },
      Math.max(Math.min(...boundaries) - now, 0),
    );
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Force the inert snapshot on every subscriber (stop / dispose only). */
  private publishInactive(): void {
    if (this.snapshot === IDLE_SNAPSHOT_INACTIVE) return;
    this.snapshot = IDLE_SNAPSHOT_INACTIVE;
    for (const listener of [...this.listeners]) listener();
  }
}
