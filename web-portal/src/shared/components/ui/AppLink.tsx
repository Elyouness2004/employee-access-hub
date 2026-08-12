import { forwardRef } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

import { cn } from '@/shared/lib/cn';

/**
 * In-content navigation link: ink + underline (never blue), router-aware.
 * Navigation chrome (sidebar, menus) styles its own links; body copy uses this.
 */
export const AppLink = forwardRef<HTMLAnchorElement, LinkProps & { className?: string }>(
  ({ className, ...props }, ref) => (
    <Link
      ref={ref}
      className={cn(
        'rounded-sm text-link underline underline-offset-2 transition-colors duration-fast hover:text-ink-muted',
        className,
      )}
      {...props}
    />
  ),
);
AppLink.displayName = 'AppLink';
