import { useId, type ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

/**
 * THE accessibility contract for every form control (DESIGN-SYSTEM §9.2,
 * `docs/frontend/DESIGN-SYSTEM.md §10`). Nothing in a feature wires labels or
 * `aria-describedby` by hand — it would be wired differently each time.
 *
 * What it guarantees:
 *  - a VISIBLE `<label for>` — a placeholder is never a label;
 *  - helper text stating the constraint BEFORE the user can break it;
 *  - the error linked through `aria-describedby` with `aria-invalid` set, so a
 *    screen reader hears the problem when it lands on the field;
 *  - required marked in text as well as with the asterisk, because an asterisk
 *    alone is a glyph, not information.
 *
 * The control is a render prop so the field owns the ids without owning the
 * widget: `<FormField …>{(props) => <Input {...props} />}</FormField>`.
 */
export interface FormFieldRenderProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
  required: boolean;
}

export interface FormFieldProps {
  label: string;
  /** Constraint stated up front (max length, date rules, balance floor). */
  helper?: ReactNode;
  /** Server or client validation message; presence sets `aria-invalid`. */
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: FormFieldRenderProps) => ReactNode;
}

export function FormField({
  label,
  helper,
  error,
  required = false,
  className,
  children,
}: FormFieldProps) {
  const id = useId();
  const helperId = `${id}-helper`;
  const errorId = `${id}-error`;
  const describedBy =
    [helper ? helperId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-label text-ink-strong">
        {label}
        {required ? (
          <>
            {' '}
            <span aria-hidden="true" className="text-status-danger-text">
              *
            </span>
            <span className="sr-only">(required)</span>
          </>
        ) : null}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        required,
      })}
      {helper ? (
        <p id={helperId} className="text-helper text-ink-muted">
          {helper}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-validation text-status-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
