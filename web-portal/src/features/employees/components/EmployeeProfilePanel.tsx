import { Link } from 'react-router-dom';

import {
  catalogueLabel,
  useDepartmentCatalogueQuery,
  usePositionCatalogueQuery,
} from '@/shared/catalogues';
import { correlationIdOf } from '@/shared/api';
import { Alert, CopyableId, DetailList } from '@/shared/components';
import { Button } from '@/shared/components/ui';
import { formatDate, formatDateTime } from '@/shared/lib/format';
import type { EmployeeResponse } from '@/shared/types/hr';

import { employeeName, useEmployeeQuery } from '../api/employees-api';
import { CatalogueReference } from './CatalogueReference';

/**
 * The Profile tab of the employee detail page (P17).
 *
 * `EmployeeResponse` is id-only — HR holds the catalogues, so the labels are
 * joined here rather than by the server. Three readings are kept apart because
 * they are three different facts: a label still loading, a label that resolved,
 * and a reference to something the catalogue does not contain (which shows the
 * id, so it can be traced rather than silently swallowed).
 *
 * The two identifiers are kept, and kept SECONDARY: they sit in their own
 * section below the record, each labelled with what it actually is and each
 * copyable, because the only reason anyone reads a UUID is to paste it
 * somewhere. The employee id navigates HR surfaces; the Keycloak id is the
 * login account and is what every ownership check in the platform compares
 * against. Reading one as the other is the correctness bug this panel exists to
 * prevent — which is why they are labelled rather than dropped.
 */
export interface EmployeeProfilePanelProps {
  employee: EmployeeResponse;
}

export function EmployeeProfilePanel({ employee }: EmployeeProfilePanelProps) {
  const departments = useDepartmentCatalogueQuery();
  const positions = usePositionCatalogueQuery();
  const manager = useEmployeeQuery(employee.managerId ?? '', {
    enabled: Boolean(employee.managerId),
  });

  const departmentName = catalogueLabel(
    departments.data,
    employee.departmentId,
    (entry) => entry.name,
  );
  const positionTitle = catalogueLabel(positions.data, employee.positionId, (entry) => entry.title);

  const catalogueError = departments.error ?? positions.error;

  return (
    <div className="flex flex-col gap-6">
      {/*
        Stated once, here, rather than implied by two fields that would
        otherwise read as "this department does not exist" — which is a claim
        about the data, not about a request that failed.
      */}
      {catalogueError ? (
        <Alert
          tone="warning"
          title="Department and position names could not be loaded"
          actions={
            <Button
              size="compact"
              variant="secondary"
              onClick={() => {
                if (departments.error) void departments.refetch();
                if (positions.error) void positions.refetch();
              }}
            >
              Retry
            </Button>
          }
        >
          <p>
            The record below is complete — only the catalogue lookup failed, so those two fields
            read “Name unavailable”.
          </p>
          {correlationIdOf(catalogueError) ? (
            <p className="mt-1 font-mono text-mono-sm">
              Correlation id: {correlationIdOf(catalogueError)}
            </p>
          ) : null}
        </Alert>
      ) : null}

      <section
        aria-labelledby="employee-record-heading"
        className="rounded-lg border border-border bg-surface p-5"
      >
        <h2 id="employee-record-heading" className="mb-4 text-panel-title text-ink-strong">
          Employment record
        </h2>
        <DetailList
          items={[
            { label: 'Work email', value: employee.email },
            { label: 'Hire date', value: formatDate(employee.hireDate) },
            {
              label: 'Department',
              value: (
                <CatalogueReference
                  resolved={departmentName}
                  isLoading={departments.isPending}
                  isUnavailable={Boolean(departments.error)}
                  id={employee.departmentId}
                  full
                />
              ),
            },
            {
              label: 'Position',
              value: (
                <CatalogueReference
                  resolved={positionTitle}
                  isLoading={positions.isPending}
                  isUnavailable={Boolean(positions.error)}
                  id={employee.positionId}
                  full
                />
              ),
            },
            {
              label: 'Reports to',
              value: !employee.managerId ? (
                <span className="text-ink-muted">Nobody — top of the reporting line</span>
              ) : manager.isPending ? (
                <span className="text-ink-muted">Loading…</span>
              ) : manager.data ? (
                <Link className="text-link underline" to={`/hr/employees/${manager.data.id}`}>
                  {employeeName(manager.data)} · {manager.data.matricule}
                </Link>
              ) : (
                <span className="font-mono text-mono-sm text-ink-muted">
                  Unresolved employee {employee.managerId}
                </span>
              ),
              wide: true,
            },
          ]}
        />
      </section>

      <section
        aria-labelledby="employee-identifiers-heading"
        className="rounded-lg border border-border bg-surface-2 p-5"
      >
        <h2 id="employee-identifiers-heading" className="text-panel-title text-ink">
          Technical identifiers
        </h2>
        <p className="mt-1 text-body-secondary text-ink-muted">
          Internal references, kept here because support and investigation need them. They are not
          this person&rsquo;s identity — the record above is.
        </p>

        <dl className="mt-4 flex flex-col gap-4">
          <div className="min-w-0">
            <dt className="text-caption text-ink-muted">Employee id</dt>
            <dd className="mt-0.5 text-ink-strong">
              <CopyableId value={employee.id} label="Employee id" />
            </dd>
            {/* A second `<dd>` rather than a `<p>`: a `<div>` inside a `<dl>`
                may only hold the term and its descriptions. */}
            <dd className="mt-0.5 text-caption text-ink-muted">
              This HR record. It is what HR routes and leave balances address.
            </dd>
          </div>

          <div className="min-w-0">
            <dt className="text-caption text-ink-muted">Keycloak id</dt>
            <dd className="mt-0.5 text-ink-strong">
              {employee.keycloakId ? (
                <CopyableId value={employee.keycloakId} label="Keycloak id" />
              ) : (
                <span className="text-body text-ink-muted">
                  Not linked — no login account has been provisioned
                </span>
              )}
            </dd>
            <dd className="mt-0.5 text-caption text-ink-muted">
              The login account (the token&rsquo;s{' '}
              <span className="font-mono text-mono-sm">sub</span>
              ). Every ownership check in the platform compares against this one, never the employee
              id.
            </dd>
          </div>
        </dl>

        <DetailList
          className="mt-4 border-t border-border pt-4"
          items={[
            { label: 'Record created', value: formatDateTime(employee.createdAt), mono: true },
            { label: 'Record last updated', value: formatDateTime(employee.updatedAt), mono: true },
          ]}
        />
      </section>
    </div>
  );
}
