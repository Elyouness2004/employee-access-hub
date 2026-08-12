import type { HTMLAttributes } from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * Content region wrapper: 1280px reading width, page padding per breakpoint
 * (32 ≥xl · 24 lg · 20 md · 16 <md — DESIGN-SYSTEM §4.1).
 */
export function PageContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mx-auto w-full max-w-content px-4 py-6 md:px-5 lg:px-6 xl:px-8', className)}
      {...props}
    />
  );
}
