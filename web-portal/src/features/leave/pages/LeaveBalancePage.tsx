import { Link } from 'react-router-dom';

import { PageContainer, PageHeader } from '@/shared/components';
import { Button } from '@/shared/components/ui';

import { useMyBalanceQuery } from '../api/leave-api';
import { LeaveBalanceMeter } from '../components/LeaveBalanceMeter';

/**
 * P09 — My balance. The three figures the leave service holds for the current
 * year, and nothing else.
 *
 * There is deliberately no history or projection: the service exposes one row
 * per employee per year (`LeaveBalanceResponse`) and no ledger, so a "days used
 * over time" chart would be fabricated. Adjustments are HR's surface (P20,
 * Phase 4) — an employee cannot change their own allocation and the page does
 * not imply otherwise.
 */
export function LeaveBalancePage() {
  const balance = useMyBalanceQuery();

  return (
    <PageContainer>
      <PageHeader
        title="My balance"
        description="Your annual leave allocation for the current year."
        actions={
          <Button asChild variant="secondary">
            <Link to="/leave">Back to my leave</Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-4">
        <LeaveBalanceMeter
          balance={balance.data}
          isLoading={balance.isPending}
          error={balance.error}
          onRetry={() => void balance.refetch()}
        />
        <p className="text-body-secondary text-ink-muted">
          Only annual leave draws on this balance. Approved requests debit it at the moment your
          manager approves them; cancelling an approved request credits the days back. HR adjusts
          allocations — contact them if a figure looks wrong.
        </p>
      </div>
    </PageContainer>
  );
}
