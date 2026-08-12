import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect, vi } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';

import { resetAccessTokenProvider } from '@/shared/api';

import { server } from './msw/server';

expect.extend(axeMatchers);

// ── Network: MSW owns it; an unhandled request is a test failure — tests can
// never hit the real backend.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  resetAccessTokenProvider();
  cleanup();
  localStorage.clear();
});
afterAll(() => server.close());

// ── jsdom gaps Radix/Tailwind rely on ──────────────────────────────────────

// React Router's data router constructs `new Request(url, { signal })` with
// jsdom's AbortController, but Node's undici Request brand-checks the signal
// and throws — silently killing every in-test navigation. Bridge: fall back to
// omitting a foreign signal (no loaders abort in these tests).
const NativeRequest = globalThis.Request;
globalThis.Request = class CompatRequest extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    try {
      super(input, init);
    } catch (error) {
      if (init?.signal) {
        const { signal: _foreignSignal, ...rest } = init;
        super(input, rest);
      } else {
        throw error;
      }
    }
  }
};

// Deterministic matchMedia: desktop by default; tests override via
// `setViewport` below.
const matchers = new Map<string, { matches: boolean; listeners: Set<() => void> }>();

let viewportWidth = 1280;

function evaluateQuery(query: string): boolean {
  const min = /\(min-width:\s*(\d+)px\)/.exec(query);
  if (min?.[1]) return viewportWidth >= Number(min[1]);
  const max = /\(max-width:\s*([\d.]+)px\)/.exec(query);
  if (max?.[1]) return viewportWidth <= Number(max[1]);
  // Non-width queries (prefers-color-scheme, reduced motion) default to false.
  return false;
}

function getEntry(query: string) {
  let entry = matchers.get(query);
  if (!entry) {
    entry = { matches: evaluateQuery(query), listeners: new Set() };
    matchers.set(query, entry);
  }
  return entry;
}

/** Test helper: simulate a viewport width (re-evaluates every media query). */
export function setViewport(width: number): void {
  viewportWidth = width;
  for (const [query, entry] of matchers) {
    const matches = evaluateQuery(query);
    if (matches !== entry.matches) {
      entry.matches = matches;
      entry.listeners.forEach((listener) => listener());
    }
  }
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query: string): MediaQueryList => {
    return {
      get matches() {
        return getEntry(query).matches;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => {
        getEntry(query).listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: () => void) => {
        getEntry(query).listeners.delete(listener);
      },
      addListener: (listener: () => void) => getEntry(query).listeners.add(listener),
      removeListener: (listener: () => void) => getEntry(query).listeners.delete(listener),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  }),
});

afterEach(() => {
  viewportWidth = 1280;
  matchers.clear();
});

// Radix positioning/measurement shims.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = window.ResizeObserver ?? (ResizeObserverStub as typeof ResizeObserver);
window.HTMLElement.prototype.scrollIntoView =
  window.HTMLElement.prototype.scrollIntoView ?? (() => {});
window.HTMLElement.prototype.hasPointerCapture =
  window.HTMLElement.prototype.hasPointerCapture ?? (() => false);
window.HTMLElement.prototype.releasePointerCapture =
  window.HTMLElement.prototype.releasePointerCapture ?? (() => {});
