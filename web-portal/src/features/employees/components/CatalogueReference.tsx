import { shortId } from '@/shared/lib/format';

/**
 * A department or position id rendered as words — with the four readings kept
 * apart, because collapsing them is how a transport failure gets presented as a
 * fact about the data.
 *
 *  - **resolved** — the catalogue contains it. Show the label.
 *  - **loading** — the catalogue has not arrived. Say so; a row is not empty
 *    just because a second request is still in flight.
 *  - **unavailable** — the catalogue request FAILED. `useQuery` leaves
 *    `isPending` false on an error, so without this branch every row would
 *    claim the reference does not exist when the truth is that nothing is known
 *    about it either way.
 *  - **unknown** — the catalogue arrived and does not contain this id: a
 *    genuinely dangling reference. Show the id so it can be traced.
 *
 * One component rather than one per screen: the directory and the profile panel
 * were making the same distinction with different words, which is how two
 * screens end up disagreeing about the same row.
 */
export interface CatalogueReferenceProps {
  /** The label the catalogue resolved, or null. */
  resolved: string | null;
  isLoading: boolean;
  /** The catalogue request failed — nothing is known, which is not "missing". */
  isUnavailable: boolean;
  /** The raw id, shown when the reference is genuinely dangling. */
  id: string;
  /** Full id rather than the short form — for detail views with room. */
  full?: boolean;
}

export function CatalogueReference({
  resolved,
  isLoading,
  isUnavailable,
  id,
  full = false,
}: CatalogueReferenceProps) {
  if (resolved) return <>{resolved}</>;
  if (isLoading) return <span className="text-ink-muted">Loading…</span>;
  if (isUnavailable) {
    return (
      <span className="text-ink-muted" title={id}>
        Name unavailable
      </span>
    );
  }
  return (
    <span className="font-mono text-mono-sm text-ink-muted" title={id}>
      Not in the catalogue ({full ? id : shortId(id)})
    </span>
  );
}
