import { useSyncExternalStore } from 'react';

/**
 * Reactive media-query subscription. Drives the responsive shell modes
 * (drawer < md · icon rail md · preference-collapsible ≥ lg) so tooltip and
 * drawer behavior can follow the EFFECTIVE layout, not just CSS.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/** Breakpoints from DESIGN-SYSTEM §4.3 (Tailwind defaults). */
export const MEDIA = {
  /** At and above `md`: tables stay tables. Below it they become cards. */
  mdUp: '(min-width: 768px)',
  lgUp: '(min-width: 1024px)',
} as const;
