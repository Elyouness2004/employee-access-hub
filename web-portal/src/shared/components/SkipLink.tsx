/**
 * First focusable element in the shell (WCAG 2.4.1). Visually hidden until
 * focused, then a raised surface pinned top-left.
 */
export function SkipLink({ targetId = 'main' }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only no-underline focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-surface focus:px-4 focus:py-2 focus:text-label focus:text-ink-strong focus:shadow-md"
    >
      Skip to main content
    </a>
  );
}
