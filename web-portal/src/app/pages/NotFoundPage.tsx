import { SearchX } from 'lucide-react';

import { EmptyState, PageContainer } from '@/shared/components';
import { AppLink } from '@/shared/components/ui';

/** P03 — also the landing for unknown ids a guard cannot distinguish. */
export function NotFoundPage() {
  return (
    <PageContainer>
      <EmptyState
        headingLevel="h1"
        icon={SearchX}
        title="Page not found"
        description="The address doesn't match any page in Employee Access Hub."
        action={<AppLink to="/">Go to the Dashboard</AppLink>}
      />
    </PageContainer>
  );
}
