import { useLocation } from 'react-router-dom';

import type { ForbiddenLocationState } from '@/shared/auth';
import { EmptyState, PageContainer } from '@/shared/components';
import { AppLink } from '@/shared/components/ui';

import { FORBIDDEN_ICON } from '../navigation/nav-config';

/**
 * P02 — the route-guard target. You are signed in; your roles don't grant
 * this area — authorization policy denied the request. Guards pass the
 * attempted path so the page can name it. API 403s never come here — they
 * render inline with the server's `detail`.
 */
export function ForbiddenPage() {
  const location = useLocation();
  const attemptedPath = (location.state as ForbiddenLocationState | null)?.attemptedPath;

  return (
    <PageContainer>
      <EmptyState
        headingLevel="h1"
        icon={FORBIDDEN_ICON}
        title="Access denied"
        description={
          attemptedPath ? (
            <>
              You are signed in, but your roles don&rsquo;t include access to{' '}
              <span className="font-mono text-mono-sm text-ink">{attemptedPath}</span>.
              Authorization policy denied the request — the server enforces this on every call; this
              page only explains it.
            </>
          ) : (
            "You are signed in, but your roles don't include this area. The server enforces access on every request — this page only explains it."
          )
        }
        action={<AppLink to="/">Go to the Dashboard</AppLink>}
      />
    </PageContainer>
  );
}
