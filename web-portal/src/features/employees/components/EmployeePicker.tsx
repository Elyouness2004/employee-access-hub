import { Search, UserRound, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import {
  Alert,
  EmployeeCell,
  EmptyState,
  QueryStateBoundary,
  SearchField,
} from '@/shared/components';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Skeleton,
  VisuallyHidden,
} from '@/shared/components/ui';
import { cn } from '@/shared/lib/cn';

import {
  employeeName,
  EMPLOYEE_PICKER_SIZE,
  useEmployeeQuery,
  useEmployeeSearchQuery,
} from '../api/employees-api';

/**
 * Choose the employee a record reports to — the `managerId` on `EmployeeRequest`.
 *
 * **Why a dialog and not a typeahead.** A combobox is the obvious shape and the
 * wrong one to hand-build: the accessibility rules forbid hand-rolled ARIA
 * widgets, and Radix — the primitive set this app wraps — has no combobox. A
 * search field plus a list of real buttons inside a Radix dialog gives the same
 * job a focus trap, native keyboard traversal and a screen-reader story that a
 * home-made listbox would have to re-earn, at no cost to the user.
 *
 * **Search is the server's.** The dialog sends `?search=` to
 * `GET /api/hr/employees` and shows what comes back — up to ten rows, because
 * the answer to "too many matches" is a narrower search, not a longer list. The
 * count in the footer is the envelope's `totalElements`, so the user is told how
 * many matches exist rather than how many are on screen.
 *
 * **Self-exclusion is an affordance, not the rule.** `EmployeeService` answers
 * 422 "an employee cannot be their own manager"; this shows that row disabled
 * with the reason rather than hiding it, so a search that finds only yourself
 * explains itself instead of looking broken.
 */
export interface EmployeePickerProps {
  /** Currently selected employee id (an HR record id, never a Keycloak subject). */
  value: string | null;
  onChange: (employeeId: string | null) => void;
  /** Wording of the dialog and the empty selection, e.g. "manager". */
  noun: string;
  /** The record being edited — it may not select itself. */
  excludeEmployeeId?: string | undefined;
  /** From `FormField`, so the trigger is labelled and described like any control. */
  id?: string | undefined;
  describedBy?: string | undefined;
  /**
   * Id of the element that names this control.
   *
   * A `<label for>` is NOT part of the accessible-name computation for a
   * `button` (HTML-AAM: aria-labelledby → aria-label → subtree → title), so a
   * visible label alone leaves some browsers announcing only the current value.
   * `aria-labelledby` pointing at the label AND at the value gives every engine
   * the same "Reports to, Any manager".
   */
  labelledBy?: string | undefined;
  invalid?: boolean;
  /** 32px trigger for a filter bar row. */
  compact?: boolean;
  /** Wording of the "nobody selected" state. */
  emptyLabel?: string;
}

export function EmployeePicker({
  value,
  onChange,
  noun,
  excludeEmployeeId,
  id,
  describedBy,
  labelledBy,
  invalid = false,
  compact = false,
  emptyLabel,
}: EmployeePickerProps) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const valueId = useId();

  // Only the id is in the form; the name has to be resolved to be shown. The
  // record is cached under the same key the detail page uses, so opening an
  // employee afterwards costs nothing.
  const selected = useEmployeeQuery(value ?? '', { enabled: Boolean(value) });

  useEffect(() => {
    if (open) setTerm('');
  }, [open]);

  const selectedLabel = value
    ? selected.isPending
      ? 'Loading…'
      : selected.data
        ? `${employeeName(selected.data)} · ${selected.data.matricule}`
        : // The id is set but the record is gone or unreadable: say which id,
          // because "—" would hide a dangling reference.
          `Unresolved employee ${value}`
    : (emptyLabel ?? `No ${noun}`);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/*
        No `aria-invalid`: the attribute is not supported on role=button, and
        the error is already announced through `aria-describedby` from
        `FormField`. The border carries the same signal visually.
      */}
      <button
        type="button"
        id={id}
        aria-labelledby={labelledBy ? `${labelledBy} ${valueId}` : undefined}
        aria-describedby={describedBy}
        onClick={() => setOpen(true)}
        className={cn(
          // Same 1.4.11 reasoning as `controlClasses`: this trigger IS a
          // control, so its edge is held to 3:1 and hover steps up from there.
          'inline-flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-surface px-3 text-left text-body text-ink-strong transition-colors duration-fast hover:border-ink-muted',
          invalid ? 'border-status-danger-text' : 'border-border-strong',
          compact ? 'h-8 max-md:h-11' : 'h-9 max-md:h-11',
        )}
      >
        <UserRound aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
        <span id={valueId} className={cn('truncate', !value && 'text-ink-muted')}>
          {selectedLabel}
        </span>
      </button>

      {value ? (
        <Button
          size="compact"
          variant="ghost"
          onClick={() => onChange(null)}
          aria-label={`Remove the ${noun}`}
        >
          <X aria-hidden="true" />
          Remove
        </Button>
      ) : null}

      <PickerDialog
        open={open}
        onOpenChange={setOpen}
        noun={noun}
        term={term}
        onTermChange={setTerm}
        {...(excludeEmployeeId ? { excludeEmployeeId } : {})}
        onSelect={(employeeId) => {
          onChange(employeeId);
          setOpen(false);
        }}
      />
    </div>
  );
}

function PickerDialog({
  open,
  onOpenChange,
  noun,
  term,
  onTermChange,
  excludeEmployeeId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noun: string;
  term: string;
  onTermChange: (term: string) => void;
  excludeEmployeeId?: string | undefined;
  onSelect: (employeeId: string) => void;
}) {
  const results = useEmployeeSearchQuery(term, { enabled: open });
  const total = results.data?.totalElements ?? 0;
  const shown = results.data?.content.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <div className="flex flex-col gap-1">
          <DialogTitle>Choose a {noun}</DialogTitle>
          <DialogDescription>
            Search the workforce by name, matricule or work email. The server decides who exists —
            an unknown reference is refused when you save.
          </DialogDescription>
        </div>

        <SearchField
          value={term}
          onChange={onTermChange}
          label={`Search for a ${noun}`}
          placeholder="Name, matricule or email"
        />

        {/*
          Search results change under the user as they type, and a screen-reader
          user gets no other signal that the list moved. One polite region,
          announced once per settled result — not per keystroke, because the
          query is already debounced upstream.
        */}
        <VisuallyHidden aria-live="polite">
          {results.isPending
            ? 'Searching'
            : results.error
              ? 'The search failed'
              : `${total} ${total === 1 ? 'match' : 'matches'}, showing ${shown}`}
        </VisuallyHidden>

        {results.error ? (
          <QueryStateBoundary error={results.error} onRetry={() => void results.refetch()} />
        ) : results.isPending ? (
          <div aria-busy="true" className="flex flex-col gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : shown === 0 ? (
          <EmptyState
            icon={Search}
            title="Nobody matches that search"
            description="Try a partial surname, a matricule, or the start of a work email."
          />
        ) : (
          <>
            <ul className="flex flex-col gap-1">
              {results.data?.content.map((candidate) => {
                const isSelf = candidate.id === excludeEmployeeId;
                return (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      disabled={isSelf}
                      onClick={() => onSelect(candidate.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-2 py-2 text-left hover:enabled:bg-surface-hover disabled:cursor-default"
                    >
                      <EmployeeCell
                        name={employeeName(candidate)}
                        matricule={candidate.matricule}
                      />
                      <span className="shrink-0 text-caption text-ink-muted">
                        {isSelf ? 'Cannot report to themselves' : candidate.email}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {total > shown ? (
              <Alert tone="info" live={false}>
                Showing the first {EMPLOYEE_PICKER_SIZE} of {total} matches. Narrow the search to
                find the right person.
              </Alert>
            ) : null}
          </>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
