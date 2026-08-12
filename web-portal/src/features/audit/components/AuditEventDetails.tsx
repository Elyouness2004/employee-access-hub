import { DetailList, QueryStateBoundary, StatusBadge, TechnicalDetails } from '@/shared/components';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Skeleton,
} from '@/shared/components/ui';
import { formatDateTime } from '@/shared/lib/format';
import { PersonReference, usePeopleLookup } from '@/shared/people';
import type { AuditEntryResponse } from '@/shared/types/hr';

import { useAuditEventQuery } from '../api/audit-api';
import {
  auditActionLabel,
  auditServiceLabel,
  parseAuditFailure,
  parseAuditResource,
} from '../humanize';
import { AuditResourceTimeline } from './AuditResourceTimeline';

/**
 * One audit event and the full history of its resource (DESIGN-SYSTEM §11.3).
 *
 * The timeline is the reason this is a dialog rather than an expanded row: an
 * investigator looking at "employee X was offboarded" almost always wants the
 * rest of what happened to employee X, and the endpoint returns exactly that —
 * every event sharing the same `resource` string, oldest first.
 *
 * **The hierarchy is the design.** What happened, who did it, when, to whom, and
 * why it failed come first, in words. The machine data an investigator pastes
 * into a log query — event id, resource reference, exception, HTTP status, the
 * raw details blob — is all still here, complete, one disclosure below. Nothing
 * is dropped: an audit tool that hides the identifier is unusable, and one that
 * leads with it makes people read UUIDs instead of facts.
 *
 * `result` and `details` are backend-owned and rendered verbatim; the action
 * label and failure explanation are DERIVED beside them, never in place of them.
 *
 * Strictly read-only. `audit_log` is append-only (BR-06) and there is no
 * endpoint that writes — so this dialog offers no action beyond closing.
 */
export interface AuditEventDetailsProps {
  /** The event to open, or `null` when the dialog is closed. */
  eventId: string | null;
  /** The row that was clicked, so the dialog has a title before the fetch lands. */
  fallback: AuditEntryResponse | null;
  onOpenChange: (open: boolean) => void;
}

export function AuditEventDetails({ eventId, fallback, onOpenChange }: AuditEventDetailsProps) {
  const query = useAuditEventQuery(eventId);
  const event = query.data?.event ?? fallback;

  const resource = parseAuditResource(event?.resource);
  const failure = parseAuditFailure(event?.details);
  const actionLabel = auditActionLabel(event?.action);

  // The actor is a `preferred_username`; a resource of `employee:<uuid>` is an
  // employee id — except on the offboarding fan-out rows other services write,
  // where it is a Keycloak subject. Both are offered to the resolver, and it
  // answers for whichever one exists.
  const timeline = query.data?.timeline ?? [];
  const people = usePeopleLookup({
    usernames: [event?.user, ...timeline.map((entry) => entry.user)],
    employeeIds: resource?.kind === 'employee' ? [resource.id] : [],
    keycloakIds: resource?.kind === 'employee' ? [resource.id] : [],
  });

  const subject =
    resource?.kind === 'employee'
      ? (() => {
          const byEmployee = people.byEmployeeId(resource.id);
          return byEmployee.state === 'resolved' ? byEmployee : people.byKeycloakId(resource.id);
        })()
      : null;

  return (
    <Dialog open={eventId !== null} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <div className="flex flex-col gap-1">
          <DialogTitle>{actionLabel ?? event?.action ?? 'Audit event'}</DialogTitle>
          <DialogDescription>
            {event
              ? `Recorded ${formatDateTime(event.timestamp)} in the ${auditServiceLabel(event.service)} service.`
              : 'Loading this event.'}
          </DialogDescription>
        </div>

        {event ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={event.result} />
              {/* The machine code stays visible next to the words — it is what
                  gets pasted into a filter — but it is no longer the heading. */}
              <span className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-mono-sm text-ink-muted">
                {event.action}
              </span>
            </div>

            <DetailList
              items={[
                {
                  label: 'Recorded by',
                  value: (
                    <PersonReference
                      resolution={people.byUsername(event.user)}
                      fallback={event.user}
                      fullFallback
                      showEmail
                    />
                  ),
                },
                { label: 'Date', value: formatDateTime(event.timestamp), mono: true },
                { label: 'Result', value: <StatusBadge status={event.result} /> },
                { label: 'Service', value: auditServiceLabel(event.service) },
                ...(resource
                  ? [
                      {
                        label: resource.label,
                        value: subject ? (
                          <PersonReference
                            resolution={subject}
                            fallback={resource.id}
                            fullFallback
                            showMatricule
                          />
                        ) : (
                          <span className="break-all font-mono text-mono-sm">{resource.id}</span>
                        ),
                        wide: true,
                      },
                    ]
                  : []),
                ...(failure
                  ? [
                      {
                        label: 'Reason',
                        // The explanation when the exception type is one we
                        // know; the server's own message otherwise. Never both
                        // invented and presented as the record's words.
                        value: failure.explanation ?? failure.message ?? failure.exception,
                        wide: true,
                      },
                    ]
                  : event.details
                    ? [{ label: 'Details', value: event.details, mono: true, wide: true }]
                    : [
                        {
                          label: 'Details',
                          value: 'The action recorded no additional detail.',
                          wide: true,
                        },
                      ]),
              ]}
            />

            <TechnicalDetails>
              <DetailList
                items={[
                  { label: 'Event id', value: event.id, mono: true, wide: true },
                  { label: 'Action code', value: event.action, mono: true },
                  { label: 'Actor (username)', value: event.user, mono: true },
                  { label: 'Service', value: event.service, mono: true },
                  { label: 'Resource', value: event.resource, mono: true, wide: true },
                  ...(failure?.exception
                    ? [{ label: 'Exception', value: failure.exception, mono: true }]
                    : []),
                  ...(failure?.httpStatus
                    ? [{ label: 'HTTP status', value: failure.httpStatus, mono: true }]
                    : []),
                  ...(event.details
                    ? [{ label: 'Recorded detail', value: event.details, mono: true, wide: true }]
                    : []),
                ]}
              />
              {/*
                The trail records no correlation id, IP, role or session — those
                columns do not exist on `audit_log`. Saying so is what stops an
                investigator hunting for a field that was never captured.
              */}
              <p className="mt-3 text-caption text-ink-muted">
                The trail does not record a correlation id, IP address, role or session id for an
                event — those columns do not exist on the audit table.
              </p>
            </TechnicalDetails>
          </>
        ) : null}

        <section className="flex flex-col gap-2">
          <h3 className="text-panel-title text-ink-strong">Everything recorded on this resource</h3>
          {query.error ? (
            <QueryStateBoundary error={query.error} onRetry={() => void query.refetch()} />
          ) : query.isPending ? (
            <div aria-busy="true" className="flex flex-col gap-2">
              <span className="sr-only">Loading the resource timeline</span>
              <Skeleton className="h-24 w-full" />
            </div>
          ) : (
            <AuditResourceTimeline
              events={timeline}
              highlightId={query.data?.event.id}
              people={people}
            />
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
