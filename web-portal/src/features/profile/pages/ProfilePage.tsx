import { UserRoundX } from 'lucide-react';

import { isApiError } from '@/shared/api';
import { useIdentity } from '@/shared/auth';
import {
  DetailList,
  EmptyState,
  PageContainer,
  PageHeader,
  QueryStateBoundary,
  StatusBadge,
  type DetailItem,
} from '@/shared/components';
import { Skeleton, VisuallyHidden } from '@/shared/components/ui';
import { formatDate } from '@/shared/lib/format';

import { useAccessQuery, useMyProfileQuery } from '../api/profile-api';

/**
 * P13 — Profile. Two panels, because the platform genuinely has two answers to
 * "who am I":
 *
 *  - **HR record** (`/api/hr/me`) — the workforce fact: department, position,
 *    manager, hire date. Labels arrive resolved, because the catalogues behind
 *    them are HR-only and an employee could never turn the raw ids into
 *    anything readable.
 *  - **Access** (`/api/hr/auth/me`) — the token as the SERVER sees it. This is
 *    the panel that matters when access is in question: the client decodes its
 *    own copy for display, but only the server's view is authoritative.
 *
 * The two identifiers stay visibly distinct (FRONTEND-SPECIFICATION §1): the
 * employee id is the HR record, the subject is the login account. Confusing them
 * is a correctness bug, so the page never abbreviates either into "ID".
 */
export function ProfilePage() {
  const profile = useMyProfileQuery();
  const access = useAccessQuery();
  const identity = useIdentity();

  const unlinked = isApiError(profile.error) && profile.error.kind === 'notFound';

  const profileItems: DetailItem[] = profile.data
    ? [
        { label: 'Name', value: `${profile.data.firstName} ${profile.data.lastName}` },
        { label: 'Matricule', value: profile.data.matricule, mono: true },
        { label: 'Work email', value: profile.data.email },
        { label: 'Department', value: profile.data.departmentName ?? 'Not assigned' },
        { label: 'Position', value: profile.data.positionTitle ?? 'Not assigned' },
        { label: 'Hire date', value: formatDate(profile.data.hireDate) },
        {
          label: 'Manager',
          value: profile.data.managerName ? (
            <>
              {profile.data.managerName}
              {profile.data.managerEmail ? (
                <span className="block text-body-secondary text-ink-muted">
                  {profile.data.managerEmail}
                </span>
              ) : null}
            </>
          ) : (
            'No manager on record'
          ),
        },
        {
          label: 'Employment status',
          value: <StatusBadge status={profile.data.status} />,
        },
        {
          label: 'Employee id',
          value: profile.data.id,
          mono: true,
          wide: true,
        },
      ]
    : [];

  return (
    <PageContainer>
      <PageHeader
        title="Profile"
        description="Your HR record and the access your organization account carries."
      />

      <div className="flex flex-col gap-8">
        <section aria-labelledby="hr-record-title">
          <h2 id="hr-record-title" className="mb-4 text-section-title text-ink-strong">
            HR record
          </h2>
          {profile.isPending ? (
            <PanelSkeleton label="HR record" />
          ) : unlinked ? (
            <EmptyState
              icon={UserRoundX}
              title="No employee record linked yet"
              description="Your organization account is not connected to an HR record. This happens before identity onboarding runs — HR can link it. Leave, expenses and team features stay unavailable until then."
            />
          ) : profile.error ? (
            <QueryStateBoundary error={profile.error} onRetry={() => void profile.refetch()} />
          ) : (
            <div className="rounded-lg border border-border bg-surface p-5">
              <DetailList items={profileItems} />
            </div>
          )}
        </section>

        <section aria-labelledby="access-title">
          <h2 id="access-title" className="mb-1 text-section-title text-ink-strong">
            Access
          </h2>
          <p className="mb-4 text-body-secondary text-ink-muted">
            What the server sees in your token. Roles are issued by the identity provider and
            re-checked on every request — this page cannot grant anything.
          </p>
          {access.isPending ? (
            <PanelSkeleton label="Access" />
          ) : access.error ? (
            <QueryStateBoundary error={access.error} onRetry={() => void access.refetch()} />
          ) : access.data ? (
            <div className="rounded-lg border border-border bg-surface p-5">
              <DetailList
                items={[
                  {
                    label: 'Username',
                    value: access.data.username ?? identity.username,
                    mono: true,
                  },
                  { label: 'Subject (login account)', value: access.data.subject, mono: true },
                  { label: 'Issuer', value: access.data.issuer, mono: true, wide: true },
                  {
                    label: 'Audience',
                    value: access.data.audience.join(', ') || '—',
                    mono: true,
                  },
                  {
                    label: 'Authorities granted by the server',
                    value: (
                      <span className="flex flex-wrap gap-1">
                        {access.data.authorities.map((authority) => (
                          <span
                            key={authority}
                            className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-mono-sm"
                          >
                            {authority}
                          </span>
                        ))}
                      </span>
                    ),
                    wide: true,
                  },
                ]}
              />
            </div>
          ) : null}
        </section>
      </div>
    </PageContainer>
  );
}

function PanelSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="rounded-lg border border-border bg-surface p-5">
      <VisuallyHidden>Loading {label}</VisuallyHidden>
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-5 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}
