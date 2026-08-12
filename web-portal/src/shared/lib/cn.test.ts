import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { cn } from './cn';

/**
 * The type scale must survive class merging.
 *
 * `tailwind-merge` treats an unknown `text-*` class as a text COLOR, so without
 * a theme-aware config `cn('text-panel-title text-ink-strong')` drops the size
 * and every component renders at the inherited one — a failure that produces no
 * error, no warning, and no failing render test.
 */
describe('cn', () => {
  it.each([
    ['text-panel-title text-ink-strong', ['text-panel-title', 'text-ink-strong']],
    ['text-body text-ink-muted', ['text-body', 'text-ink-muted']],
    ['text-mono-sm text-status-danger-text', ['text-mono-sm', 'text-status-danger-text']],
  ])('keeps size AND color in %s', (input, expected) => {
    const result = cn(input).split(' ');
    for (const cls of expected) expect(result).toContain(cls);
  });

  it('keeps a size token declared in a later argument (the Button case)', () => {
    expect(cn('text-label', 'bg-action-primary text-action-primary-text')).toContain('text-label');
  });

  it('still collapses genuine conflicts', () => {
    expect(cn('text-body text-caption')).toBe('text-caption');
    expect(cn('text-ink', 'text-ink-muted')).toBe('text-ink-muted');
    expect(cn('p-4 p-5')).toBe('p-5');
  });

  it('covers every font size declared in the Tailwind theme', () => {
    const config = readFileSync(path.resolve(process.cwd(), 'tailwind.config.ts'), 'utf8');
    const fontSizeBlock = /fontSize:\s*\{([\s\S]*?)\n {4}\},/.exec(config)?.[1] ?? '';
    const declared = [...fontSizeBlock.matchAll(/^\s{6}'?([a-z-]+)'?:/gm)].map((m) => m[1]);

    expect(declared.length).toBeGreaterThan(5);
    for (const token of declared) {
      expect(cn(`text-${token} text-ink-strong`).split(' ')).toContain(`text-${token}`);
    }
  });
});
