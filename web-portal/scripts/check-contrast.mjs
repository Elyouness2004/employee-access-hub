import { readFileSync } from 'node:fs';

/**
 * WCAG 2.2 AA contrast verification for every token pair the SPA actually
 * renders, in BOTH themes.
 *
 * It exists because `vitest-axe` cannot run axe's colour-contrast rule under
 * jsdom — jsdom has no layout and no canvas, so the rule is skipped and the axe
 * smokes prove structure only. This computes the ratios from
 * `src/styles/tokens.css` directly, which is the one place the values live.
 *
 * Thresholds: 4.5:1 for body text (1.4.3), 3:1 for the boundary of an
 * interactive component and for a graphical object that carries meaning
 * (1.4.11). Run with `npm run check:contrast`; it is part of `npm run check`.
 */

const css = readFileSync('src/styles/tokens.css', 'utf8');
function block(selector) {
  const i = css.indexOf(selector);
  const start = css.indexOf('{', i);
  const end = css.indexOf('\n}', start);
  const out = {};
  for (const m of css.slice(start, end).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g))
    out[m[1]] = m[2].trim();
  return out;
}
const light = block(':root {');
const dark = { ...light, ...block("[data-theme='dark'] {") };

function rgb(v) {
  if (v.startsWith('#')) {
    const h = v.slice(1);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  const m = v.match(/rgb\(\s*(\d+)\s+(\d+)\s+(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}
const lin = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
function ratio(a, b) {
  const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// [foreground, background, minimum, what it is]
const PAIRS = [
  ['text', 'surface', 4.5, 'body text on a panel'],
  ['text', 'canvas', 4.5, 'body text on the page'],
  ['text', 'surface-2', 4.5, 'body text on the sunken surface'],
  ['text-strong', 'surface', 4.5, 'headings on a panel'],
  ['text-strong', 'canvas', 4.5, 'headings on the page'],
  ['text-muted', 'surface', 4.5, 'secondary/helper text on a panel'],
  ['text-muted', 'canvas', 4.5, 'secondary text on the page'],
  ['text-muted', 'surface-2', 4.5, 'secondary text on the sunken surface'],
  ['link', 'surface', 4.5, 'links'],
  ['link', 'canvas', 4.5, 'links on the page'],
  ['sidebar-text', 'sidebar-surface', 4.5, 'sidebar item label'],
  ['sidebar-text-strong', 'sidebar-surface', 4.5, 'sidebar active label'],
  ['sidebar-text-muted', 'sidebar-surface', 4.5, 'sidebar group heading'],
  ['sidebar-text', 'sidebar-hover', 4.5, 'sidebar label, hovered'],
  ['sidebar-text-strong', 'sidebar-active', 4.5, 'sidebar label, active'],
  ['action-primary-text', 'action-primary', 4.5, 'primary button label'],
  ['action-primary-text', 'action-primary-hover', 4.5, 'primary button label, hovered'],
  ['action-destructive-text', 'action-destructive', 4.5, 'destructive button label'],
  ['action-destructive-text', 'action-destructive-hover', 4.5, 'destructive button label, hovered'],
  ['status-success-text', 'status-success-bg', 4.5, 'success badge text'],
  ['status-warning-text', 'status-warning-bg', 4.5, 'warning badge text'],
  ['status-danger-text', 'status-danger-bg', 4.5, 'danger badge text'],
  ['status-info-text', 'status-info-bg', 4.5, 'info badge text'],
  ['status-neutral-text', 'status-neutral-bg', 4.5, 'neutral badge text'],
  ['status-success-text', 'surface', 4.5, 'success text on a panel'],
  ['status-warning-text', 'surface', 4.5, 'warning text on a panel'],
  ['status-danger-text', 'surface', 4.5, 'danger/validation text on a panel'],
  ['status-info-text', 'surface', 4.5, 'info text on a panel'],
  // UI components and graphical objects: 3:1
  ['border-strong', 'surface', 3, 'control border on a panel'],
  ['border-strong', 'canvas', 3, 'control border on the page'],
  ['action-secondary-border', 'surface', 3, 'secondary button border'],
  ['focus-ring', 'surface', 3, 'focus ring on a panel'],
  ['focus-ring', 'canvas', 3, 'focus ring on the page'],
  ['action-primary', 'surface', 3, 'meter fill / solid control on a panel'],
  ['chart-1', 'surface', 3, 'chart series 1'],
  ['chart-2', 'surface', 3, 'chart series 2'],
  ['chart-3', 'surface', 3, 'chart series 3'],
  ['chart-4', 'surface', 3, 'chart series 4'],
];

/**
 * Deliberately NOT held to 3:1, with the reason recorded here rather than left
 * as a permanently-red line somebody eventually stops reading:
 *
 *   --status-*-border  The hairline around a StatusBadge. 1.4.11 covers what is
 *                      "required to identify" a component or state; a badge's
 *                      state is carried by its ICON and its TEXT LABEL, both of
 *                      which are verified above at 4.5:1 against the badge's own
 *                      tinted background. The border only closes the chip, and
 *                      raising it to 3:1 would turn a quiet status marker into an
 *                      outlined button it is not (DESIGN-SYSTEM §2.4).
 *
 *   --border           Row and panel separation. A separator is decoration; the
 *                      boundary of an interactive control is --border-strong,
 *                      which IS checked above.
 */

let failures = 0;
for (const [theme, tokens] of [
  ['light', light],
  ['dark', dark],
]) {
  console.log(`\n── ${theme} ──`);
  for (const [fg, bg, min, what] of PAIRS) {
    const r = ratio(tokens[fg], tokens[bg]);
    const ok = r >= min;
    if (!ok) failures++;
    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2)}:1  (min ${min})  --${fg} on --${bg}  — ${what}`,
    );
  }
}
console.log(`\n${failures} failing pair(s).`);
if (failures > 0) process.exitCode = 1;
