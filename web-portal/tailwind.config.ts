import type { Config } from 'tailwindcss';

/**
 * Identity Control Plane — Tailwind is a thin mapping over the semantic tokens in
 * `src/styles/tokens.css` (DESIGN-SYSTEM §2–§7). The default Tailwind palette, type
 * scale, radii, and shadows are REPLACED, not extended, so classes like `bg-blue-500`,
 * `text-4xl`, or `rounded-xl` do not exist. If a value seems missing here, the design
 * needs a token first — never an arbitrary value.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Breakpoints intentionally match DESIGN-SYSTEM §4.3 (Tailwind defaults).
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',

      canvas: 'var(--canvas)',
      surface: {
        DEFAULT: 'var(--surface)',
        2: 'var(--surface-2)',
        raised: 'var(--surface-raised)',
        hover: 'var(--surface-hover)',
        active: 'var(--surface-active)',
      },
      sidebar: {
        surface: 'var(--sidebar-surface)',
        hover: 'var(--sidebar-hover)',
        active: 'var(--sidebar-active)',
        text: 'var(--sidebar-text)',
        'text-strong': 'var(--sidebar-text-strong)',
        'text-muted': 'var(--sidebar-text-muted)',
      },
      ink: {
        DEFAULT: 'var(--text)',
        strong: 'var(--text-strong)',
        muted: 'var(--text-muted)',
        disabled: 'var(--text-disabled)',
      },
      border: {
        DEFAULT: 'var(--border)',
        strong: 'var(--border-strong)',
      },
      'focus-ring': 'var(--focus-ring)',
      overlay: 'var(--overlay)',
      action: {
        primary: {
          DEFAULT: 'var(--action-primary)',
          hover: 'var(--action-primary-hover)',
          text: 'var(--action-primary-text)',
        },
        'secondary-border': 'var(--action-secondary-border)',
        destructive: {
          DEFAULT: 'var(--action-destructive)',
          hover: 'var(--action-destructive-hover)',
          text: 'var(--action-destructive-text)',
        },
      },
      link: 'var(--link)',
      status: {
        success: {
          text: 'var(--status-success-text)',
          bg: 'var(--status-success-bg)',
          border: 'var(--status-success-border)',
        },
        warning: {
          text: 'var(--status-warning-text)',
          bg: 'var(--status-warning-bg)',
          border: 'var(--status-warning-border)',
        },
        danger: {
          text: 'var(--status-danger-text)',
          bg: 'var(--status-danger-bg)',
          border: 'var(--status-danger-border)',
        },
        info: {
          text: 'var(--status-info-text)',
          bg: 'var(--status-info-bg)',
          border: 'var(--status-info-border)',
        },
        neutral: {
          text: 'var(--status-neutral-text)',
          bg: 'var(--status-neutral-bg)',
          border: 'var(--status-neutral-border)',
        },
      },
      chart: {
        1: 'var(--chart-1)',
        2: 'var(--chart-2)',
        3: 'var(--chart-3)',
        4: 'var(--chart-4)',
        grid: 'var(--chart-grid)',
      },
      skeleton: {
        base: 'var(--skeleton-base)',
        highlight: 'var(--skeleton-highlight)',
      },
    },
    fontFamily: {
      sans: 'var(--font-sans)',
      mono: 'var(--font-mono)',
    },
    // Type scale — DESIGN-SYSTEM §3.1. Weights are applied per style: 400/500/600 only.
    fontSize: {
      display: ['28px', { lineHeight: '36px', fontWeight: '600' }],
      'page-title': ['22px', { lineHeight: '30px', fontWeight: '600' }],
      'section-title': ['17px', { lineHeight: '24px', fontWeight: '600' }],
      'panel-title': ['15px', { lineHeight: '22px', fontWeight: '600' }],
      body: ['14px', { lineHeight: '22px', fontWeight: '400' }],
      'body-secondary': ['13px', { lineHeight: '20px', fontWeight: '400' }],
      label: ['13px', { lineHeight: '18px', fontWeight: '500' }],
      'table-header': ['12px', { lineHeight: '16px', fontWeight: '600' }],
      caption: ['12px', { lineHeight: '16px', fontWeight: '400' }],
      helper: ['12px', { lineHeight: '16px', fontWeight: '400' }],
      validation: ['12px', { lineHeight: '16px', fontWeight: '500' }],
      mono: ['13px', { lineHeight: '20px', fontWeight: '400' }],
      'mono-sm': ['12px', { lineHeight: '16px', fontWeight: '400' }],
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
    },
    // 4px rhythm (DESIGN-SYSTEM §4.1) + the control/shell sizes the spec names:
    // 32/36px control heights, 44px touch targets, 56px top bar, 64px icon rail, 256px sidebar.
    spacing: {
      0: '0',
      px: '1px',
      0.5: '2px',
      1: '4px',
      1.5: '6px',
      2: '8px',
      2.5: '10px',
      3: '12px',
      4: '16px',
      5: '20px',
      6: '24px',
      8: '32px',
      9: '36px',
      10: '40px',
      11: '44px',
      12: '48px',
      14: '56px',
      16: '64px',
      20: '80px',
      64: '256px',
    },
    borderRadius: {
      none: '0',
      sm: 'var(--radius-sm)',
      DEFAULT: 'var(--radius-md)',
      md: 'var(--radius-md)',
      lg: 'var(--radius-lg)',
      full: 'var(--radius-full)',
    },
    boxShadow: {
      none: 'none',
      xs: 'var(--shadow-xs)',
      sm: 'var(--shadow-sm)',
      md: 'var(--shadow-md)',
    },
    transitionDuration: {
      DEFAULT: 'var(--motion-fast-ms)',
      fast: 'var(--motion-fast-ms)',
      base: 'var(--motion-base-ms)',
      slow: 'var(--motion-slow-ms)',
    },
    transitionTimingFunction: {
      DEFAULT: 'ease-out',
      out: 'ease-out',
    },
    extend: {
      width: {
        sidebar: '256px',
        'sidebar-rail': '64px',
        drawer: '420px',
      },
      maxWidth: {
        shell: '1440px',
        content: '1280px',
        // Dialog sizes (DESIGN-SYSTEM §4.2) — full-screen sheet below sm.
        'dialog-sm': '400px',
        'dialog-md': '560px',
        'dialog-lg': '720px',
      },
      outlineColor: {
        'focus-ring': 'var(--focus-ring)',
      },
      outlineOffset: {
        2: '2px',
      },
    },
  },
  plugins: [],
} satisfies Config;
