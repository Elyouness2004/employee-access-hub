import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Design-token contract (roadmap Phase 1): components carry NO raw hex colors,
 * NO Tailwind default-palette classes, and NO arbitrary values. Colors exist
 * only in src/styles/tokens.css; Tailwind maps them. This test fails the build
 * the moment a forbidden style sneaks in.
 */

const SRC = path.resolve(process.cwd(), 'src');

function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter(
      (file) =>
        /\.(ts|tsx)$/.test(file) &&
        !file.endsWith('.test.ts') &&
        !file.endsWith('.test.tsx') &&
        !file.endsWith('.d.ts'),
    );
}

const RAW_HEX = /#[0-9a-fA-F]{3,8}\b/;

const TAILWIND_PALETTE =
  /\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|divide|accent|caret|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

// Arbitrary VALUES like p-[18px], bg-[#123456], w-[420px] — not arbitrary
// variants like data-[highlighted]: or child selectors like [&_svg]:size-5.
const ARBITRARY_VALUE = /-\[(?:#|--|\d|calc)[^\]]*\]/;

describe('design-token contract', () => {
  const files = sourceFiles();

  it('scans a realistic number of source files', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it.each([
    ['raw hex colors', RAW_HEX],
    ['Tailwind default-palette classes', TAILWIND_PALETTE],
    ['arbitrary utility values', ARBITRARY_VALUE],
  ])('contains no %s in components or app code', (_label, pattern) => {
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const match = pattern.exec(content);
      if (match) {
        offenders.push(`${path.relative(SRC, file)} → "${match[0]}"`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
