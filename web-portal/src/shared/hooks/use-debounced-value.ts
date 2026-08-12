import { useEffect, useRef, useState } from 'react';

/**
 * A text control whose value is committed after typing pauses.
 *
 * Every filter in the app writes to the URL, and the URL is what the request is
 * built from — so an uncontrolled `onChange` means one request and one history
 * entry per keystroke. Typing `1250.00` into an amount filter is seven of each
 * for one intent.
 *
 * The draft re-syncs when the committed value changes underneath (the back
 * button, "clear filters"), so the box never shows a filter that is no longer
 * applied. Promoted out of `SearchField`, which had this logic first and is now
 * one of its consumers (FRONTEND-ARCHITECTURE §14: ≥2 real consumers).
 */
export function useDebouncedValue(
  value: string,
  commit: (next: string) => void,
  debounceMs = 300,
): [string, (next: string) => void] {
  const [draft, setDraft] = useState(value);
  // Held in a ref so a caller passing an inline arrow does not restart the
  // timer on every render — which would mean it never fires while typing.
  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => commitRef.current(draft), debounceMs);
    return () => clearTimeout(timer);
  }, [draft, value, debounceMs]);

  return [draft, setDraft];
}
