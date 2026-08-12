import { StatusBadge } from '@/shared/components';
import { cn } from '@/shared/lib/cn';
import { formatDateTime } from '@/shared/lib/format';
import { PersonReference, type PersonLookup } from '@/shared/people';
import type { AuditEntryResponse } from '@/shared/types/hr';

import { auditActionLabel } from '../humanize';

/**
 * The chronological trail of one resource (DESIGN-SYSTEM §11.2,
 * `ActivityTimeline` — audit variant).
 *
 * An **ordered** list, because the order is the information: the endpoint
 * returns these oldest-first and the sequence is what an investigation reads.
 * Semantics carry that (`<ol>`), not just the visual rail.
 *
 * The event the user opened is marked in the list rather than removed from it —
 * seeing where it sits in the sequence is the point of opening the timeline.
 *
 * Each row reads as words with its code beneath, matching the dialog above it:
 * a timeline whose rows were codes while the event it belongs to was a sentence
 * would look like two different records.
 */
export interface AuditResourceTimelineProps {
  events: AuditEntryResponse[];
  /** The event this timeline was opened from. */
  highlightId?: string;
  /** The dialog's resolver — the timeline never fetches its own. */
  people?: PersonLookup;
}

export function AuditResourceTimeline({ events, highlightId, people }: AuditResourceTimelineProps) {
  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface p-4 text-body text-ink-muted">
        This is the only event recorded against this resource.
      </p>
    );
  }

  return (
    <ol className="flex flex-col rounded-lg border border-border bg-surface">
      {events.map((event) => {
        const isCurrent = event.id === highlightId;
        return (
          <li
            key={event.id}
            className={cn(
              'flex flex-col gap-1 border-b border-border p-4 last:border-0',
              isCurrent && 'bg-surface-2',
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body-secondary text-ink-strong">
                {auditActionLabel(event.action) ?? event.action}
              </span>
              <StatusBadge status={event.result} />
              {isCurrent ? (
                <span className="text-caption text-ink-muted">— the event you opened</span>
              ) : null}
            </div>
            <p className="flex flex-wrap items-baseline gap-x-3 text-caption text-ink-muted">
              <span className="font-mono tabular-nums">{formatDateTime(event.timestamp)}</span>
              {people ? (
                <PersonReference
                  resolution={people.byUsername(event.user)}
                  fallback={event.user}
                  fullFallback
                  className="text-caption"
                />
              ) : (
                <span className="font-mono">{event.user}</span>
              )}
              <span className="font-mono">{event.action}</span>
            </p>
            {event.details ? (
              <p className="break-words font-mono text-mono-sm text-ink">{event.details}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
