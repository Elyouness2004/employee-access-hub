import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeLockManager, linkedChannels } from '../test-support';
import type { AuthChannel } from './auth-channel';
import {
  CrossTabRefreshCoordinator,
  type CoordinatorCallbacks,
  type RenewalAttempt,
} from './refresh-coordinator';

/**
 * The realm rotates refresh tokens with `refreshTokenMaxReuse: 0` — two
 * concurrent refreshes revoke the whole session. These tests are the
 * automated half of that guarantee (the manual two-tab procedure is the
 * other; see web-portal/README.md).
 */

interface TabOptions {
  channel: AuthChannel;
  locks: FakeLockManager;
  renewal?: () => Promise<RenewalAttempt>;
  secondsRemaining?: () => number | null;
}

function makeTab({ channel, locks, renewal, secondsRemaining }: TabOptions) {
  let payload: string | null = 'user@v1';
  let remaining = 30;
  const events = { expired: 0, signedOut: 0, adopted: [] as string[] };

  const performRenewal = vi.fn(
    renewal ??
      (async (): Promise<RenewalAttempt> => {
        payload = 'user@v2';
        remaining = 300;
        return { ok: true, payload };
      }),
  );

  const callbacks: CoordinatorCallbacks = {
    performRenewal,
    currentUserPayload: () => payload,
    currentTokenSecondsRemaining: secondsRemaining ?? (() => remaining),
    onExternalUserUpdated: (next) => {
      events.adopted.push(next);
      payload = next;
      remaining = 300;
    },
    onExternalSessionExpired: () => {
      events.expired += 1;
    },
    onExternalSignedOut: () => {
      events.signedOut += 1;
    },
  };

  const coordinator = new CrossTabRefreshCoordinator({
    channel,
    locks,
    callbacks,
    handoffTimeoutMs: 20,
    lockWaitTimeoutMs: 50,
  });

  return { coordinator, performRenewal, events, current: () => payload };
}

describe('CrossTabRefreshCoordinator', () => {
  let locks: FakeLockManager;

  beforeEach(() => {
    locks = new FakeLockManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces concurrent renewals inside one tab into a single attempt', async () => {
    const [channel] = linkedChannels(1);
    const tab = makeTab({ channel: channel!, locks });

    const results = await Promise.all([
      tab.coordinator.renew(),
      tab.coordinator.renew(),
      tab.coordinator.renew(),
    ]);

    expect(tab.performRenewal).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.status === 'renewed')).toBe(true);
  });

  it('lets exactly ONE tab refresh; the second adopts the result instead', async () => {
    const [channelA, channelB] = linkedChannels(2);
    // Tab A holds the lock until we release it, so B is guaranteed to queue.
    let releaseA!: () => void;
    const aInLock = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const tabA = makeTab({
      channel: channelA!,
      locks,
      renewal: async () => {
        await aInLock;
        return { ok: true, payload: 'user@v2' };
      },
    });
    const tabB = makeTab({ channel: channelB!, locks });

    const runA = tabA.coordinator.renew();
    const runB = tabB.coordinator.renew();
    releaseA();

    const [resultA, resultB] = await Promise.all([runA, runB]);

    expect(resultA.status).toBe('renewed');
    expect(tabA.performRenewal).toHaveBeenCalledTimes(1);
    // B waited, saw A's fan-out, and never touched the refresh token.
    expect(resultB.status).toBe('adopted');
    expect(tabB.performRenewal).not.toHaveBeenCalled();
    expect(tabB.events.adopted).toEqual(['user@v2']);
    expect(tabB.current()).toBe('user@v2');
  });

  it('propagates a successful refresh to every other tab', async () => {
    const [channelA, channelB, channelC] = linkedChannels(3);
    const tabA = makeTab({ channel: channelA!, locks });
    const tabB = makeTab({ channel: channelB!, locks });
    const tabC = makeTab({ channel: channelC!, locks });

    await tabA.coordinator.renew();

    expect(tabB.events.adopted).toEqual(['user@v2']);
    expect(tabC.events.adopted).toEqual(['user@v2']);
  });

  it('propagates a definitive refresh failure as session-expired', async () => {
    const [channelA, channelB] = linkedChannels(2);
    const tabA = makeTab({
      channel: channelA!,
      locks,
      renewal: async () => ({ ok: false, reason: 'session-gone' }),
    });
    const tabB = makeTab({ channel: channelB!, locks });

    const result = await tabA.coordinator.renew();
    expect(result).toEqual({ status: 'failed', reason: 'session-gone' });

    // The owner announces; peers transition too.
    tabA.coordinator.announceSessionExpired();
    expect(tabB.events.expired).toBe(1);
  });

  it('reports a transient failure without expiring the session', async () => {
    const [channel] = linkedChannels(1);
    const tab = makeTab({
      channel: channel!,
      locks,
      renewal: async () => ({ ok: false, reason: 'transient' }),
    });

    expect(await tab.coordinator.renew()).toEqual({ status: 'failed', reason: 'transient' });
  });

  it('fails safe on lock timeout — never refreshes outside the lock', async () => {
    const [channelA, channelB] = linkedChannels(2);
    // Tab A never finishes: it holds the lock past B's wait timeout.
    const tabA = makeTab({
      channel: channelA!,
      locks,
      renewal: () => new Promise<RenewalAttempt>(() => undefined),
    });
    // B's token is nearly dead, so a fan-out it never received can't rescue it.
    const tabB = makeTab({ channel: channelB!, locks, secondsRemaining: () => 10 });

    void tabA.coordinator.renew();
    const result = await tabB.coordinator.renew();

    expect(result).toEqual({ status: 'failed', reason: 'lock-timeout' });
    expect(tabB.performRenewal).not.toHaveBeenCalled();
  });

  it('treats a peer fan-out that arrives DURING the lock wait as the renewal', async () => {
    const [channelA, channelB] = linkedChannels(2);
    let announce!: () => void;
    const announced = new Promise<void>((resolve) => {
      announce = resolve;
    });
    const tabA = makeTab({
      channel: channelA!,
      locks,
      // Announces the fresh user, then holds the lock indefinitely — B must
      // recognize the adopted session rather than time out and fail.
      renewal: async () => {
        await announced;
        channelA!.post({ type: 'user-updated', payload: 'user@v9' });
        return new Promise<RenewalAttempt>(() => undefined);
      },
    });
    const tabB = makeTab({ channel: channelB!, locks });

    void tabA.coordinator.renew();
    const runB = tabB.coordinator.renew(); // snapshots user@v1, then queues
    announce();

    expect(await runB).toEqual({ status: 'adopted', payload: 'user@v9' });
    expect(tabB.performRenewal).not.toHaveBeenCalled();
    expect(tabB.events.adopted).toEqual(['user@v9']);
  });

  it('propagates logout to every tab', async () => {
    const [channelA, channelB, channelC] = linkedChannels(3);
    const tabA = makeTab({ channel: channelA!, locks });
    const tabB = makeTab({ channel: channelB!, locks });
    const tabC = makeTab({ channel: channelC!, locks });

    tabA.coordinator.announceSignedOut();

    expect(tabB.events.signedOut).toBe(1);
    expect(tabC.events.signedOut).toBe(1);
    expect(tabA.events.signedOut).toBe(0); // no self-delivery
  });

  it('hands the session to a newly opened tab', async () => {
    const [channelA, channelB] = linkedChannels(2);
    makeTab({ channel: channelA!, locks }); // signed-in tab
    const newTab = makeTab({ channel: channelB!, locks });

    await expect(newTab.coordinator.requestHandoff()).resolves.toBe('user@v1');
  });

  it('resolves the handoff to null when no signed-in peer answers', async () => {
    const [channel] = linkedChannels(1);
    const tab = makeTab({ channel: channel!, locks });

    await expect(tab.coordinator.requestHandoff()).resolves.toBeNull();
  });

  it('still renews (single-flight) when the Web Locks API is unavailable', async () => {
    const [channel] = linkedChannels(1);
    const coordinator = new CrossTabRefreshCoordinator({
      channel: channel!,
      locks: null,
      callbacks: {
        performRenewal: vi.fn(async () => ({ ok: true as const, payload: 'user@v2' })),
        currentUserPayload: () => 'user@v1',
        currentTokenSecondsRemaining: () => 10,
        onExternalUserUpdated: () => undefined,
        onExternalSessionExpired: () => undefined,
        onExternalSignedOut: () => undefined,
      },
    });

    await expect(coordinator.renew()).resolves.toEqual({ status: 'renewed', payload: 'user@v2' });
    coordinator.dispose();
  });

  it('stops delivering events after dispose', async () => {
    const [channelA, channelB] = linkedChannels(2);
    const tabA = makeTab({ channel: channelA!, locks });
    const tabB = makeTab({ channel: channelB!, locks });

    tabB.coordinator.dispose();
    tabA.coordinator.announceSignedOut();

    expect(tabB.events.signedOut).toBe(0);
  });
});
