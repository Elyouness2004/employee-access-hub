import { describe, expect, it } from 'vitest';

import { AUTH_CHANNEL_NAME, createAuthChannel } from './auth-channel';

/**
 * The channel's contract with its callers: posting is always safe. Session work
 * is async and outlives teardown, so a post after `close()` is reachable — and
 * on a raw BroadcastChannel that throws `InvalidStateError`, which surfaces as
 * an unhandled rejection that aborts the boot/renewal sequence mid-flight.
 */
describe('createAuthChannel', () => {
  it('delivers messages to subscribers of a peer channel', async () => {
    const sender = createAuthChannel();
    const receiver = createAuthChannel();
    const received: unknown[] = [];
    receiver.subscribe((message) => received.push(message));

    sender.post({ type: 'signed-out' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(received).toEqual([{ type: 'signed-out' }]);
    sender.close();
    receiver.close();
  });

  it('drops posts after close instead of throwing InvalidStateError', () => {
    const channel = createAuthChannel();
    channel.close();

    // The bug this guards: `new BroadcastChannel(...).close()` then
    // `postMessage(...)` throws, and the StrictMode double-mount closes the
    // first channel while its boot handoff is still pending.
    const raw = new BroadcastChannel(AUTH_CHANNEL_NAME);
    raw.close();
    expect(() => raw.postMessage({ type: 'signed-out' })).toThrow();

    expect(() => channel.post({ type: 'handoff-request', requestId: 'r1' })).not.toThrow();
  });

  it('is safe to close twice and stops delivering to old subscribers', () => {
    const channel = createAuthChannel();
    const received: unknown[] = [];
    channel.subscribe((message) => received.push(message));

    channel.close();
    expect(() => channel.close()).not.toThrow();

    // Subscribing after close yields an inert unsubscribe rather than a leak.
    const unsubscribe = channel.subscribe((message) => received.push(message));
    expect(() => unsubscribe()).not.toThrow();
    expect(received).toEqual([]);
  });
});
