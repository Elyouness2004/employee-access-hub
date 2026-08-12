import * as DialogPrimitive from '@radix-ui/react-dialog';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * Side sheet on the wrapped Radix Dialog: focus trap, Escape handling, and
 * focus restoration come from the primitive. `--shadow-md` is the ceiling
 * (dialogs/drawers); motion stays in the 120–220ms budget and collapses under
 * prefers-reduced-motion. Every sheet needs a `SheetTitle` (visually hidden
 * where the content already names itself).
 */

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogPrimitive.Title;
export const SheetDescription = DialogPrimitive.Description;

export const SheetContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 animate-overlay-in bg-overlay" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex w-64 max-w-full animate-sheet-in-left flex-col border-r border-border bg-surface-raised shadow-md outline-none',
        className,
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = 'SheetContent';
