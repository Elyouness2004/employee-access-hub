import { useEffect, useReducer, useSyncExternalStore } from 'react';

import { useOptionalAuth } from '../AuthProvider';
import { IDLE_SNAPSHOT_INACTIVE, type SessionIdleSnapshot } from './idle-monitor';

/**
 * The current session-idle phase.
 *
 * Subscribes to PHASE changes only — the monitor never emits per second, so an
 * idle application re-renders twice in half an hour (active → warning →
 * expired), not eighteen hundred times. The ticking countdown is a separate,
 * component-local concern (`useCountdown`) that re-renders one small element.
 *
 * Outside an AuthProvider (isolated component tests, dev mock identity) this
 * reports the inert snapshot rather than throwing: session UI is an offer, not
 * a requirement, for the components that host it.
 */
export function useSessionIdle(): SessionIdleSnapshot {
  const auth = useOptionalAuth();
  const idle = auth?.idle;
  return useSyncExternalStore(
    idle ? idle.subscribe : subscribeToNothing,
    idle ? idle.getSnapshot : getInactiveSnapshot,
    getInactiveSnapshot,
  );
}

function subscribeToNothing(): () => void {
  return () => undefined;
}

function getInactiveSnapshot(): SessionIdleSnapshot {
  return IDLE_SNAPSHOT_INACTIVE;
}

/**
 * Whole seconds until `deadlineAt`, ticking once per second while `active`.
 * Clamped at zero, and completely inert when not counting — no interval runs
 * unless a countdown is actually on screen.
 */
export function useCountdown(deadlineAt: number, active: boolean): number {
  // The value is DERIVED at render time, never stored: state held across a
  // deadline change would render one stale second, and that second is the one
  // the warning is judged on. The reducer exists only to schedule re-renders.
  const [, tick] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    if (!active || !Number.isFinite(deadlineAt)) return;
    const interval = setInterval(tick, 1_000);
    return () => clearInterval(interval);
  }, [active, deadlineAt]);

  return remainingSeconds(deadlineAt);
}

function remainingSeconds(deadlineAt: number): number {
  if (!Number.isFinite(deadlineAt)) return 0;
  return Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
}
