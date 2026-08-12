import { Search } from 'lucide-react';
import { useId } from 'react';

import { Input } from '@/shared/components/ui';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';

/**
 * Debounced search bound to the URL's `?search=`.
 *
 * Local state drives the input so typing stays responsive; the URL — and
 * therefore the request — updates only once typing pauses. Without the debounce
 * every keystroke is a round trip through the gateway and a history entry.
 *
 * The value re-syncs when the URL changes underneath (back button, "clear
 * filters"), so the box never shows a filter that is no longer applied.
 */
export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** What is being searched — a placeholder is never the label. */
  label: string;
  placeholder?: string;
  debounceMs?: number;
}

export function SearchField({
  value,
  onChange,
  label,
  placeholder,
  debounceMs = 300,
}: SearchFieldProps) {
  // Unique per instance: two lists on one page (the approvals tabs) would
  // otherwise share an id and break both `<label for>` associations.
  const id = useId();
  const [draft, setDraft] = useDebouncedValue(value, onChange, debounceMs);

  return (
    <div className="relative min-w-0 flex-1 sm:max-w-content">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
      />
      <Input
        id={id}
        type="search"
        compact
        value={draft}
        placeholder={placeholder ?? label}
        onChange={(event) => setDraft(event.target.value)}
        className="pl-9"
      />
    </div>
  );
}
