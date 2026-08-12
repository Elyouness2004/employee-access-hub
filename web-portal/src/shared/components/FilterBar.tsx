import { X } from 'lucide-react';
import { useId, type ReactNode } from 'react';

import { Button, Input, Select } from '@/shared/components/ui';
import { cn } from '@/shared/lib/cn';

/**
 * The toolbar above a server-driven list: search, the endpoint's filters, and
 * one clear-all. Filters narrow the server-side scope and never widen it
 * (api-conventions §1), so this offers only what the endpoint actually accepts.
 *
 * Clear-all appears only when something is applied — a permanently-disabled
 * control teaches nothing, and a disabled control needs a reason.
 */
export interface FilterBarProps {
  children: ReactNode;
  onClear?: () => void;
  isFiltered?: boolean;
  className?: string;
}

export function FilterBar({ children, onClear, isFiltered, className }: FilterBarProps) {
  return (
    /*
     * Always wraps. It used to switch to `md:flex-nowrap`, which was fine while
     * a bar held two or three controls and broke once they held six or seven
     * (the audit trail, the expense queues): flex items shrink, but a native
     * `type="date"` will not go below its intrinsic width, so the row pushed
     * past the viewport and scrolled the page sideways between 768px and about
     * 1100px. Wrapping is the only behaviour that is correct for a variable
     * number of filters.
     *
     * `items-end` throughout, so a control with a label above it lines up with
     * the unlabelled "Clear filters" button on the same row.
     */
    <div role="search" className={cn('flex flex-wrap items-end gap-3', className)}>
      {children}
      {onClear && isFiltered ? (
        <Button size="compact" variant="ghost" onClick={onClear}>
          <X aria-hidden="true" />
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}

/**
 * A labelled enum filter. The label is visible (never a placeholder), and the
 * "any" option is explicit so clearing is a choice rather than a blank.
 */
export interface FilterSelectProps {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options: readonly { value: string; label: string }[];
  /** Wording of the unfiltered option, e.g. "Any status". */
  anyLabel: string;
}

export function FilterSelect({ label, value, onChange, options, anyLabel }: FilterSelectProps) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-caption text-ink-muted">
        {label}
      </label>
      <Select
        id={id}
        compact
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        <option value="">{anyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** A labelled date bound (`from`/`to`). Native input: full keyboard entry, typed values allowed. */
export function FilterDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-caption text-ink-muted">
        {label}
      </label>
      {/* The same control styling as every other field, from one place — a
          second copy is a second thing to forget when the tokens change. */}
      <Input
        id={id}
        compact
        type="date"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
      />
    </div>
  );
}
