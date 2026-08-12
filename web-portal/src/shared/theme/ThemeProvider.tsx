import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';

import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { usePreference } from '@/shared/hooks/use-preference';

/**
 * Both themes ship together (DESIGN-SYSTEM §2): the resolved theme is stamped
 * as `data-theme` on <html>, where tokens.css re-declares every semantic token.
 * Preference order: stored user choice → OS preference. index.html applies the
 * same logic pre-paint to avoid a theme flash.
 */

export type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = usePreference<Theme | null>('theme', null);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const theme: Theme = stored ?? (systemDark ? 'dark' : 'light');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: setStored,
      toggle: () => setStored(theme === 'dark' ? 'light' : 'dark'),
    }),
    [theme, setStored],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
