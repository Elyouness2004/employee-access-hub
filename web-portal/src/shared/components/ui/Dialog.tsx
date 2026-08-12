import * as DialogPrimitive from '@radix-ui/react-dialog';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * Centered modal dialog on the wrapped Radix primitive: focus trap, Escape
 * handling, scroll lock, `aria-hidden` on the rest of the page, and focus
 * restoration all come from Radix — never hand-rolled (accessibility rule
 * "use the wrapped primitives").
 *
 * Sizes follow DESIGN-SYSTEM §4.2 (sm 400 · md 560 · lg 720) and become a
 * full-screen sheet below `md`. `--shadow-md` is the ceiling for overlays.
 *
 * Every dialog needs a `DialogTitle` — visually hidden where the content
 * already names itself. Confirmations pass `role="alertdialog"`.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-panel-title text-ink-strong', className)}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-body text-ink-muted', className)}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';

const SIZES = {
  sm: 'sm:max-w-dialog-sm',
  md: 'sm:max-w-dialog-md',
  lg: 'sm:max-w-dialog-lg',
} as const;

export interface DialogContentProps extends ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  size?: keyof typeof SIZES;
}

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, size = 'md', children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 animate-overlay-in bg-overlay" />
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'flex max-h-full w-full animate-dialog-in flex-col gap-4 overflow-y-auto border border-border bg-surface-raised p-5 shadow-md outline-none',
          // Full-bleed sheet on phones, centered panel from sm up.
          'rounded-t-lg sm:rounded-lg',
          SIZES[size],
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </div>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = 'DialogContent';

/**
 * Action row: stacked and full-width on phones, right-aligned from sm up.
 *
 * Deliberately NOT `flex-col-reverse` (the common shadcn default): reversing
 * only the visual order makes the first thing you see the last thing you reach
 * by keyboard, which the accessibility rules forbid ("focus order matches
 * visual order"). Put the primary action last in the DOM and it reads last on
 * phones and rightmost on desktop — one order, both directions.
 */
export function DialogFooter({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:justify-end [&>button]:w-full sm:[&>button]:w-auto',
        className,
      )}
      {...props}
    />
  );
}
