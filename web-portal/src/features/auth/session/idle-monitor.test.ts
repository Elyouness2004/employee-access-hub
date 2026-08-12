import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionIdleMonitor } from './idle-monitor';
import { sessionPolicy, type SessionPolicy } from './session-policy';

/**
 * The idle model in isolation: a clock, four concepts, and no React.
 *
 * The policy here is a scaled-down mirror of the realm (30 min idle / 8 h max /
 * 60 s warning) so the assertions read as ratios rather than magic numbers.
 */
const POLICY: SessionPolicy = sessionPolicy({
  idleTimeoutMs: 30_000,
  warningMs: 6_000,
  maxLifetimeMs: 300_000,
  // The real policy gives the unextendable cap a longer lead; scaled here so
  // the two deadlines stay distinguishable in the assertions below.
  lifetimeWarningMs: 12_000,
});

function monitor(overrides: Partial<ConstructorParameters<typeof SessionIdleMonitor>[0]> = {}) {
  return new SessionIdleMonitor({ policy: POLICY, target: null, ...overrides });
}

beforeEach(() => {
  // Fake timers also fake Date.now, so the monitor's clock and the test's
  // advance in lockstep.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('idle phases', () => {
  it('starts active and enters the warning phase exactly at the lead time', () => {
    const idle = monitor();
    idle.start({ authenticatedAt: null });

    expect(idle.getSnapshot().phase).toBe('active');

    vi.advanceTimersByTime(POLICY.idleTimeoutMs - POLICY.warningMs - 1);
    expect(idle.getSnapshot().phase).toBe('active');

    vi.advanceTimersByTime(1);
    expect(idle.getSnapshot()).toMatchObject({ phase: 'warning', deadline: 'idle' });
  });

  it('expires when the mirrored idle timeout is reached', () => {
    const idle = monitor();
    idle.start({ authenticatedAt: null });

    vi.advanceTimersByTime(POLICY.idleTimeoutMs);

    expect(idle.getSnapshot().phase).toBe('expired');
  });

  it('emits only on phase changes — never once per second', () => {
    const idle = monitor();
    idle.start({ authenticatedAt: null });
    const listener = vi.fn();
    idle.subscribe(listener);

    vi.advanceTimersByTime(POLICY.idleTimeoutMs);

    // active → warning → expired. Nothing in between: 30 s of counting down
    // costs two renders, not thirty.
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps a stable snapshot reference while the phase holds (no render churn)', () => {
    const idle = monitor();
    idle.start({ authenticatedAt: null });
    const first = idle.getSnapshot();

    vi.advanceTimersByTime(1_000);

    expect(idle.getSnapshot()).toBe(first);
  });
});

describe('what counts as activity', () => {
  it('resets the idle clock on user activity', () => {
    const idle = monitor();
    idle.start({ authenticatedAt: null });

    vi.advanceTimersByTime(POLICY.idleTimeoutMs - 1_000);
    idle.recordActivity();
    vi.advanceTimersByTime(POLICY.idleTimeoutMs - POLICY.warningMs - 1);

    expect(idle.getSnapshot().phase).toBe('active');
  });

  it.each(['pointerdown', 'keydown', 'input', 'wheel'] as const)(
    'treats a %s event on the document as activity',
    (type) => {
      const idle = monitor({ target: document });
      idle.start({ authenticatedAt: null });

      vi.advanceTimersByTime(POLICY.idleTimeoutMs - 2_000);
      document.dispatchEvent(new Event(type, { bubbles: true }));
      vi.advanceTimersByTime(5_000);

      expect(idle.getSnapshot().phase).toBe('active');
      idle.dispose();
    },
  );

  it('ignores passive background events — visibility and focus are not interactions', () => {
    const idle = monitor({ target: document });
    idle.start({ authenticatedAt: null });

    vi.advanceTimersByTime(POLICY.idleTimeoutMs - 1_000);
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(1_000);

    // A tab that merely came back into view has not been used: it expires.
    expect(idle.getSnapshot().phase).toBe('expired');
    idle.dispose();
  });

  it('stops listening once stopped', () => {
    const idle = monitor({ target: document });
    idle.start({ authenticatedAt: null });
    idle.stop();

    document.dispatchEvent(new Event('keydown'));

    expect(idle.getSnapshot().phase).toBe('active');
    expect(idle.getSnapshot().deadlineAt).toBe(Infinity);
  });

  it('ignores activity once locked — only verified re-authentication revives it', () => {
    const idle = monitor();
    idle.start({ authenticatedAt: null });
    vi.advanceTimersByTime(POLICY.idleTimeoutMs);

    idle.recordActivity();

    expect(idle.getSnapshot().phase).toBe('expired');

    idle.resume({});
    expect(idle.getSnapshot().phase).toBe('active');
  });
});

describe('cross-tab activity', () => {
  it('broadcasts activity no more often than the broadcast throttle', () => {
    const onActivity = vi.fn();
    const idle = monitor({ onActivity, broadcastThrottleMs: 10_000 });
    idle.start({ authenticatedAt: null });

    vi.advanceTimersByTime(2_000);
    idle.recordActivity();
    vi.advanceTimersByTime(2_000);
    idle.recordActivity();
    expect(onActivity).not.toHaveBeenCalled();

    vi.advanceTimersByTime(7_000);
    idle.recordActivity();
    expect(onActivity).toHaveBeenCalledTimes(1);
  });

  it('adopts a peer tab’s activity without echoing it back', () => {
    const onActivity = vi.fn();
    const idle = monitor({ onActivity, broadcastThrottleMs: 0 });
    idle.start({ authenticatedAt: null });

    vi.advanceTimersByTime(POLICY.idleTimeoutMs - 1_000);
    idle.recordActivity(Date.now(), { broadcast: false });
    vi.advanceTimersByTime(5_000);

    expect(idle.getSnapshot().phase).toBe('active');
    expect(onActivity).not.toHaveBeenCalled();
  });

  it('throttles repeated activity inside one second', () => {
    const onActivity = vi.fn();
    const idle = monitor({ onActivity, broadcastThrottleMs: 0, activityThrottleMs: 1_000 });
    idle.start({ authenticatedAt: null });

    vi.advanceTimersByTime(2_000);
    idle.recordActivity();
    idle.recordActivity();
    idle.recordActivity();

    expect(onActivity).toHaveBeenCalledTimes(1);
  });
});

describe('absolute maximum lifetime', () => {
  it('reports the lifetime deadline once it is nearer than the idle one', () => {
    const idle = monitor();
    // Authenticated long ago: the 8 h-equivalent cap lands before the idle one.
    idle.start({ authenticatedAt: Date.now() - (POLICY.maxLifetimeMs - 10_000) });

    expect(idle.getSnapshot()).toMatchObject({ phase: 'warning', deadline: 'lifetime' });
  });

  it('expires at the cap even when the user is active the whole time', () => {
    const idle = monitor();
    idle.start({ authenticatedAt: Date.now() - (POLICY.maxLifetimeMs - 10_000) });

    for (let elapsed = 0; elapsed < 10_000; elapsed += 2_000) {
      vi.advanceTimersByTime(2_000);
      idle.recordActivity();
    }

    expect(idle.getSnapshot()).toMatchObject({ phase: 'expired', deadline: 'lifetime' });
  });

  it('does not invent a cap when the auth_time claim is absent', () => {
    const idle = monitor();
    idle.start({ authenticatedAt: null });

    expect(idle.getSnapshot().deadlineAt).toBe(Date.now() + POLICY.idleTimeoutMs);
  });
});

describe('session continuity', () => {
  it('does not restart the clock when the same session is re-adopted (token renewal)', () => {
    const idle = monitor();
    idle.start({ authenticatedAt: null });
    vi.advanceTimersByTime(POLICY.idleTimeoutMs - POLICY.warningMs);
    expect(idle.getSnapshot().phase).toBe('warning');

    // A renewal produces a new user object and calls start() again — that is
    // plumbing, not a person, and must not clear the warning.
    idle.start({ authenticatedAt: null });

    expect(idle.getSnapshot().phase).toBe('warning');
  });
});
