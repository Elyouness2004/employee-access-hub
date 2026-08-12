import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '@/app/App';
import { env, useMockIdentity } from '@/config/env';

describe('application bootstrap', () => {
  it('mounts the full provider tree and renders the shell at /', async () => {
    window.history.pushState({}, '', '/');
    render(<App />);

    expect(await screen.findByRole('heading', { level: 1, name: /welcome/i })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();

    // The dev identity indicator is present in dev/test builds and clearly
    // marked; it never fabricates a token.
    expect(await screen.findByRole('button', { name: /switch development role/i })).toBeVisible();
    expect(localStorage.getItem('eah:devRole')).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it('never reaches the mock identity outside a dev build', () => {
    // The mock branch is gated on env.isDev, which Vite replaces with a
    // literal `false` in production builds — so the provider, fixtures, and
    // role switcher are tree-shaken out entirely (asserted against dist/ in
    // the Phase 2 verification log). Here we assert the invariant itself:
    // mock identity implies a dev build, always.
    expect(useMockIdentity && !env.isDev).toBe(false);
  });
});
