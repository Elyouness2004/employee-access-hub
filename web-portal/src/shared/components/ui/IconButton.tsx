import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@/shared/lib/cn';

import { Tooltip, TooltipContent, TooltipTrigger } from './Tooltip';

/**
 * Icon-only action: the accessible name is REQUIRED (enforced by the `label`
 * prop) and doubles as the tooltip. 20px Lucide icon inside; ≥44px targets
 * below md.
 */
const iconButtonVariants = cva(
  'inline-flex select-none items-center justify-center rounded-md transition-colors duration-fast disabled:cursor-default disabled:bg-surface-2 disabled:text-ink-disabled [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        ghost: 'text-ink hover:enabled:bg-surface-hover disabled:bg-transparent',
        secondary:
          'border border-action-secondary-border bg-surface text-ink-strong hover:enabled:bg-surface-hover disabled:border-border',
      },
      size: {
        default: 'h-9 w-9 max-md:h-11 max-md:w-11',
        compact: 'h-8 w-8 max-md:h-11 max-md:w-11',
      },
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'default',
    },
  },
);

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof iconButtonVariants> {
  /** Accessible name; also shown as the tooltip. */
  label: string;
  /** Render onto a child element (e.g. a router Link) instead of a button. */
  asChild?: boolean;
  /** Suppress the tooltip when a visible label sits next to the control. */
  withTooltip?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      className,
      variant,
      size,
      label,
      asChild = false,
      withTooltip = true,
      type,
      children,
      ...props
    },
    ref,
  ) => {
    const classes = cn(iconButtonVariants({ variant, size }), className);
    const control = asChild ? (
      <Slot ref={ref} aria-label={label} className={classes} {...props}>
        {children}
      </Slot>
    ) : (
      <button ref={ref} type={type ?? 'button'} aria-label={label} className={classes} {...props}>
        {children}
      </button>
    );

    if (!withTooltip) return control;

    return (
      <Tooltip>
        <TooltipTrigger asChild>{control}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  },
);
IconButton.displayName = 'IconButton';
