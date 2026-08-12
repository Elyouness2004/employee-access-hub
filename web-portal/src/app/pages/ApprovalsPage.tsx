import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ExpenseQueuePanel } from '@/features/expenses';
import { LeaveInboxPanel } from '@/features/leave';
import { PageContainer, PageHeader } from '@/shared/components';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui';

/**
 * P14 — Approvals. Two queues, one page.
 *
 * The page lives in `app/` rather than in a feature because it composes two
 * features that may not import each other (FRONTEND-ARCHITECTURE §14): the leave
 * queue owns the leave decision mutation and its balance invalidation, the
 * expense queue owns the second-approval semantics. Duplicating either into a
 * third "approvals" feature would give the same endpoint two cache keys and two
 * invalidation rules — the classic way for a decided row to keep looking pending
 * in one place and not the other.
 *
 * The active tab lives in the URL, like every other list-state decision in the
 * app: a manager who is working through the expense queue and reloads, or shares
 * the link, should land back in the expense queue. Each panel namespaces its own
 * `page`/`sort`/`search` so the two queues cannot send each other's parameters —
 * their sortable columns are different, and the server silently drops what it
 * does not recognise.
 *
 * Reachable only with the MANAGER role. Both endpoints are annotated
 * `hasRole('MANAGER')` and scope themselves to the SNAPSHOTTED manager, so an HR
 * or Admin user without that role receives 403 — which is why the route guard
 * and the sidebar both treat this as manager-only rather than
 * administrator-visible.
 */
export function ApprovalsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('queue') === 'expenses' ? 'expenses' : 'leave';

  // Counts come from the panels that already fetched them, so the tab and the
  // table can never disagree about how much is waiting.
  const [leaveTotal, setLeaveTotal] = useState<number>();
  const [expenseTotal, setExpenseTotal] = useState<number>();
  const onLeaveTotal = useCallback((value: number) => setLeaveTotal(value), []);
  const onExpenseTotal = useCallback((value: number) => setExpenseTotal(value), []);

  return (
    <PageContainer>
      <PageHeader
        title="Approvals"
        description="Requests from your direct reports, waiting on your decision."
      />
      <Tabs
        value={tab}
        onValueChange={(value) =>
          setParams(
            (current) => {
              const next = new URLSearchParams(current);
              next.set('queue', value);
              return next;
            },
            { replace: true },
          )
        }
      >
        <TabsList aria-label="Approval queues">
          <TabsTrigger value="leave">
            Leave{leaveTotal === undefined ? '' : ` (${leaveTotal})`}
          </TabsTrigger>
          <TabsTrigger value="expenses">
            Expenses{expenseTotal === undefined ? '' : ` (${expenseTotal})`}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="leave">
          <LeaveInboxPanel onTotalChange={onLeaveTotal} />
        </TabsContent>
        <TabsContent value="expenses">
          <ExpenseQueuePanel onTotalChange={onExpenseTotal} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
