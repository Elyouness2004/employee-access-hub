import { useSearchParams } from 'react-router-dom';

import { Alert, PageContainer, PageHeader } from '@/shared/components';
import { Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui';
import { formatMoney } from '@/shared/lib/format';

import { useThresholdQuery } from '../api/expenses-api';
import { ExpenseAdminQueue } from '../components/ExpenseAdminQueue';
import { ThresholdPanel } from '../components/ThresholdPanel';

/**
 * P21 — Expense administration.
 *
 * Four surfaces, all of them backed: the BR-02 escalation queue, the BR-03
 * second-approval queue, the all-claims search, and the threshold that decides
 * which claims reach the second queue at all.
 *
 * Unlike P20 this page needs no other feature, so it lives inside the expenses
 * feature. The active tab and each tab's list state live in the URL, namespaced
 * per tab so the three queues cannot send each other's parameters.
 */
const TABS = ['escalated', 'second-approval', 'search', 'threshold'] as const;
type TabValue = (typeof TABS)[number];

function isTab(value: string | null): value is TabValue {
  return TABS.includes(value as TabValue);
}

export function ExpenseAdminPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('view');
  const tab: TabValue = isTab(raw) ? raw : 'escalated';

  return (
    <PageContainer>
      <PageHeader
        title="Expense administration"
        description="The claims that reached HR, the second-level sign-offs, and the threshold that routes them."
      />

      <Tabs
        value={tab}
        onValueChange={(value) =>
          setParams(
            (current) => {
              const next = new URLSearchParams(current);
              next.set('view', value);
              return next;
            },
            { replace: true },
          )
        }
      >
        <TabsList aria-label="Expense administration">
          <TabsTrigger value="escalated">Escalated</TabsTrigger>
          <TabsTrigger value="second-approval">Second approval</TabsTrigger>
          <TabsTrigger value="search">All claims</TabsTrigger>
          <TabsTrigger value="threshold">Threshold</TabsTrigger>
        </TabsList>

        <TabsContent value="escalated">
          <ExpenseAdminQueue
            scope="escalated"
            namespace="e"
            caption="Expense claims escalated to HR"
            emptyTitle="Nothing escalated to HR"
            emptyDescription="A claim lands here when its owner has no manager who can decide it (BR-02). There is nothing waiting."
          />
        </TabsContent>

        <TabsContent value="second-approval">
          <div className="flex flex-col gap-4">
            <SecondApprovalContext />
            <ExpenseAdminQueue
              scope="second-approval"
              namespace="s"
              caption="Claims awaiting a second-level approval"
              emptyTitle="No claims awaiting a second approval"
              emptyDescription="A claim reaches this queue when its first approval put it above the threshold (BR-03). Nothing is waiting."
            />
          </div>
        </TabsContent>

        <TabsContent value="search">
          <div className="flex flex-col gap-4">
            <Alert tone="info" live={false} title="Every claim, in every state">
              This is the only expense list that spans decided claims, so it is a record rather than
              a queue: rows link to their detail and carry no decision buttons. A decided claim is
              immutable (BR-04) — the server answers 409 to any attempt to change one.
            </Alert>
            <ExpenseAdminQueue
              scope="search"
              namespace="a"
              caption="All expense claims"
              emptyTitle="No claims on record"
              emptyDescription="Nobody has submitted an expense claim yet."
            />
          </div>
        </TabsContent>

        <TabsContent value="threshold">
          <ThresholdPanel />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

/**
 * The one line that explains why the second-approval queue holds what it holds.
 * It reads the same cached threshold the Threshold tab does — one request, one
 * value, so the two tabs cannot disagree.
 *
 * It has all three states rather than collapsing them into "render nothing":
 * a shaped placeholder while it loads (so the queue below does not jump when it
 * arrives), and, if the read fails, the queue's own explanation minus the figure
 * it could not get — the rule is still true and worth stating even when the
 * number is not available.
 */
function SecondApprovalContext() {
  const query = useThresholdQuery();

  if (query.isPending) {
    return <Skeleton className="h-16 w-full rounded-lg" />;
  }

  if (query.error || !query.data) {
    return (
      <Alert tone="info" live={false} title="These claims are above the threshold">
        A first approver signed each of them off and each is above the company threshold, so BR-03
        holds it for a second HR or Admin decision. The threshold itself could not be read just now
        — the Threshold tab reports why.
      </Alert>
    );
  }

  return (
    <Alert tone="info" live={false} title="These claims are above the threshold">
      A first approver signed each of them off, and each is above{' '}
      {formatMoney(query.data.amount, query.data.currency)}, so BR-03 holds it for a second HR or
      Admin decision. Approving finalises it; rejecting is still available and is terminal.
    </Alert>
  );
}
