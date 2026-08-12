import { useCallback, useId } from 'react';
import { useSearchParams } from 'react-router-dom';

import { EmployeePicker } from '@/features/employees';
import { balanceYearOptions, BalanceAdminPanel, EscalatedLeavePanel } from '@/features/leave';
import { Alert, PageContainer, PageHeader } from '@/shared/components';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui';

/**
 * P20 — Leave administration.
 *
 * Two surfaces, because two are what leave-service gives HR:
 * `GET /api/leave/requests/escalated` and `GET|PUT /api/leave/balances/{employeeId}`.
 *
 * The page lives in `app/` rather than in `features/leave` because it composes
 * two features — the balance tab needs `EmployeePicker`, which belongs to
 * `features/employees`, and a feature may not import another feature
 * (FRONTEND-ARCHITECTURE §14). Same reason `ApprovalsPage` lives here.
 *
 * **What HR cannot do here, and why it is said out loud.** There is no endpoint
 * that lists every leave request: `LeaveRequestController` exposes own,
 * addressed-to-me and escalated-to-HR, and each pins its scope in SQL. HR can
 * open any single request by id (the escalated rows link to it), but browsing
 * the whole trail is not a capability this backend has. Building it out of the
 * escalation queue would be client-side filtering wearing a server filter's
 * clothes; the note below states the gap instead.
 */
export function LeaveAdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('view') === 'balances' ? 'balances' : 'escalated';
  const pickerLabelId = useId();

  /*
   * The whole view lives in the URL: the tab, the employee being looked at and
   * the leave year. That makes "Amina's 2025 allocation" a link somebody can
   * send, survives a reload, and keeps the back button honest — the same rule
   * every list in the app follows.
   */
  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const employeeId = params.get('employee');
  // A hand-edited or stale year falls back to the current one rather than
  // sending the server something it will reject.
  const requestedYear = Number.parseInt(params.get('year') ?? '', 10);
  const years = balanceYearOptions();
  const year = years.includes(requestedYear) ? requestedYear : new Date().getFullYear();

  return (
    <PageContainer>
      <PageHeader
        title="Leave administration"
        description="Decide the requests that reached HR, and manage annual allocations."
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
        <TabsList aria-label="Leave administration">
          <TabsTrigger value="escalated">Escalated queue</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
        </TabsList>

        <TabsContent value="escalated">
          <div className="flex flex-col gap-4">
            <Alert tone="info" live={false} title="This queue is HR’s share of the approvals">
              It holds requests that reached HR under BR-02 — the requester has no manager who could
              decide them — and every one of them is still pending. leave-service publishes no
              all-requests list, so a request that went to a manager is readable here only by
              opening it directly.
            </Alert>
            <EscalatedLeavePanel />
          </div>
        </TabsContent>

        <TabsContent value="balances">
          <BalanceAdminPanel
            employeeId={employeeId}
            year={year}
            onYearChange={(next) => setParam('year', String(next))}
            pickerLabelId={pickerLabelId}
            picker={
              <EmployeePicker
                value={employeeId}
                onChange={(next) => setParam('employee', next)}
                noun="employee"
                labelledBy={pickerLabelId}
                emptyLabel="No employee chosen"
              />
            }
          />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
