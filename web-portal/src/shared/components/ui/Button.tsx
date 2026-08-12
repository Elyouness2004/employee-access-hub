import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@/shared/lib/cn';

import { Spinner } from './Spinner';

/**
 * The four approved button variants (DESIGN-SYSTEM §11.1). Primary is graphite,
 * never blue. Heights: 36px default / 32px compact — and ≥44px targets below md.
 * Disabled controls must have a nearby explanation (tooltip or helper text) —
 * that is the caller's contract.
 */
export const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-label no-underline transition-colors duration-fast disabled:cursor-default disabled:bg-surface-2 disabled:text-ink-disabled [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-action-primary text-action-primary-text hover:enabled:bg-action-primary-hover',
        secondary:
          'border border-action-secondary-border bg-surface text-ink-strong hover:enabled:bg-surface-hover disabled:border-border',
        ghost: 'text-ink hover:enabled:bg-surface-hover disabled:bg-transparent',
        destructive:
          'bg-action-destructive text-action-destructive-text hover:enabled:bg-action-destructive-hover',
      },
      size: {
        default: 'h-9 px-4 max-md:h-11',
        compact: 'h-8 px-3 max-md:h-11',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Disables the control and shows an in-control spinner; announces busy. */
  loading?: boolean;
  /** Render the styles onto the child element (e.g. a router Link). */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      loading = false,
      asChild = false,
      disabled,
      type,
      children,
      ...props
    },
    ref,
  ) => {
    if (asChild) {
      return (
        <Slot ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
          {children}
        </Slot>
      );
    }
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? <Spinner size={16} decorative /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
