import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Class merging that knows THIS project's Tailwind theme.
 *
 * Stock `tailwind-merge` ships Tailwind's default scales. Our config *replaces*
 * them (DESIGN-SYSTEM §3.1), so `text-panel-title` and `text-body` are unknown
 * to it — and because `text-*` is ambiguous, it files them under text COLOR.
 * The result is silent: `cn('text-panel-title text-ink-strong')` returns only
 * `text-ink-strong`, and every heading, label and button in the app renders at
 * the inherited size instead of its token. Nothing errors; the type scale just
 * quietly disappears.
 *
 * Declaring the theme's font sizes as their own class group fixes it, so size
 * and color survive together. Pinned by `cn.test.ts` — if a size token is added
 * to `tailwind.config.ts` it must be added here too.
 */
const FONT_SIZES = [
  'display',
  'page-title',
  'section-title',
  'panel-title',
  'body',
  'body-secondary',
  'label',
  'table-header',
  'caption',
  'helper',
  'validation',
  'mono',
  'mono-sm',
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...FONT_SIZES] }],
    },
  },
});

/** Merge conditional Tailwind class lists without duplicate-utility conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
