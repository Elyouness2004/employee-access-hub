import * as TabsPrimitive from '@radix-ui/react-tabs';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * Level-3 navigation on the wrapped Radix primitive: arrow-key switching, roving
 * tabindex and the tab/tabpanel wiring come from Radix — never hand-rolled.
 *
 * The active tab is marked by a 2px ink underline AND the strong text colour, so
 * it reads without colour (DESIGN-SYSTEM §10). Counts live inside the tab label
 * so screen readers get them as part of the accessible name.
 */

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    // `overflow-x-auto` contains a long tab set inside the strip rather than
    // letting it widen the page: FRONTEND-SPECIFICATION §7 forbids horizontal
    // PAGE scroll outright. Pages with more tabs than fit a phone should switch
    // to an accordion (P17 does); this is the floor, not the answer.
    // `py-1 -mb-px` before you ask: setting `overflow-x` computes `overflow-y`
    // to `auto` as well, so the strip clips vertically — and the focus ring is
    // drawn 2px wide at 2px offset, i.e. 4px OUTSIDE the trigger box. Without
    // the padding a focused tab loses its ring top and bottom, which the design
    // system forbids. The negative margin keeps the underline flush.
    className={cn(
      '-mb-px flex items-center gap-4 overflow-x-auto border-b border-border py-1',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-1 text-label text-ink-muted transition-colors duration-fast max-md:h-11',
      'hover:text-ink-strong',
      'data-[state=active]:border-action-primary data-[state=active]:text-ink-strong',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn('mt-6 outline-none', className)} {...props} />
));
TabsContent.displayName = 'TabsContent';
