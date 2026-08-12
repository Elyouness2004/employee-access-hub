import { Component, type ErrorInfo, type ReactNode } from 'react';

import { env } from '@/config/env';

/**
 * Last-resort boundary around the provider tree (router errors are handled by
 * RouteErrorBoundary inside the shell). Renders a minimal, dependency-free
 * fallback: if this fires, providers themselves are broken. Styled with tokens
 * via CSS custom properties directly — Tailwind may not be trustworthy here.
 */
interface RootErrorBoundaryState {
  error: Error | null;
}

export class RootErrorBoundary extends Component<{ children: ReactNode }, RootErrorBoundaryState> {
  override state: RootErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (env.isDev) {
      console.error('[web-portal] Root error boundary caught:', error, info.componentStack);
    }
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--canvas)',
          color: 'var(--text)',
          fontFamily: 'var(--font-sans)',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: '480px', textAlign: 'center' }}>
          <h1 style={{ color: 'var(--text-strong)', fontSize: '22px', lineHeight: '30px' }}>
            Employee Access Hub can't start
          </h1>
          <p style={{ marginTop: '8px', fontSize: '14px', lineHeight: '22px' }}>
            An unexpected error prevented the application from loading. Reload to try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: '16px',
              height: '36px',
              padding: '0 16px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--action-primary)',
              color: 'var(--action-primary-text)',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            Reload
          </button>
          {env.isDev ? (
            <pre
              style={{
                marginTop: '16px',
                textAlign: 'left',
                overflow: 'auto',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                background: 'var(--surface-2)',
                borderRadius: 'var(--radius-md)',
                padding: '12px',
              }}
            >
              {this.state.error.stack ?? this.state.error.message}
            </pre>
          ) : null}
        </div>
      </div>
    );
  }
}
