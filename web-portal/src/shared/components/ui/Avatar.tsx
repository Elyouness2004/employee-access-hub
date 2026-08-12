import { cn } from '@/shared/lib/cn';

/**
 * Initials avatar on `--surface-2` (DESIGN-SYSTEM §11.1); sizes 24/32/40.
 * Decorative by design (`aria-hidden`): the accessible name must be adjacent
 * visible text (e.g. the user menu label).
 */

const sizeClasses = {
  sm: 'h-6 w-6 text-mono-sm',
  md: 'h-8 w-8 text-caption',
  lg: 'h-10 w-10 text-body-secondary',
} as const;

export interface AvatarProps {
  name: string;
  size?: keyof typeof sizeClasses;
  className?: string;
}

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '';
  const second = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + second).toUpperCase() || '?';
}

export function Avatar({ name, size = 'md', className }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full bg-surface-2 font-medium text-ink-muted',
        sizeClasses[size],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
