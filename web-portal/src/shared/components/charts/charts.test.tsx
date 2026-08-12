import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { CategoryBarChart } from './CategoryBarChart';
import { StatusDonut } from './StatusDonut';
import { TrendChart } from './TrendChart';

/**
 * The chart set's one non-negotiable: every chart ships an accessible
 * alternative carrying the SAME numbers (DESIGN-SYSTEM §10).
 *
 * `ChartFrame` derives that table from the very array the chart was handed, so
 * these tests are really asserting that no chart can be rendered without it —
 * the graphic itself is `aria-hidden`, so the table is the only representation
 * assistive technology ever meets.
 */

const DAYS = [
  { label: '29 Jul', value: 9 },
  { label: '31 Jul', value: 22 },
];

describe('TrendChart', () => {
  it('exposes the series as a table and hides the graphic from assistive tech', async () => {
    const { container } = render(
      <TrendChart
        title="Actions per day"
        description="Recorded actions."
        labelHeading="Day"
        valueHeading="Actions"
        rows={DAYS}
      />,
    );

    const table = screen.getByRole('table', { name: /actions per day/i });
    expect(within(table).getByRole('rowheader', { name: '31 Jul' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '22' })).toBeInTheDocument();
    expect(within(table).queryByRole('rowheader', { name: '30 Jul' })).toBeNull();

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('StatusDonut', () => {
  it('labels every slice in a visible legend and in the hidden table', async () => {
    const { container } = render(
      <StatusDonut
        title="Leave requests by status"
        valueHeading="Requests"
        slices={[
          { status: 'APPROVED', tone: 'success', value: 240 },
          { status: 'PENDING_SECOND_APPROVAL', tone: 'warning', value: 3 },
        ]}
      />,
    );

    // Once in the legend, once in the table: colour is never the only channel.
    expect(screen.getAllByText('Approved')).toHaveLength(2);
    expect(screen.getAllByText('Pending second approval')).toHaveLength(2);

    const table = screen.getByRole('table', { name: /leave requests by status/i });
    expect(within(table).getByRole('cell', { name: '240' })).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows shares rather than an undefined percentage when everything is zero', () => {
    render(
      <StatusDonut
        title="Leave requests by status"
        valueHeading="Requests"
        slices={[{ status: 'APPROVED', tone: 'success', value: 0 }]}
      />,
    );
    // 0/0 is not 0% — it is unknown, and the legend says so.
    expect(screen.getByText('(—)')).toBeInTheDocument();
  });
});

describe('CategoryBarChart', () => {
  it('exposes labelled counts as a table', async () => {
    const { container } = render(
      <CategoryBarChart
        title="Security events by type"
        labelHeading="Event type"
        valueHeading="Events"
        rows={[
          { label: 'ACCOUNT_LOCKED', value: 2 },
          { label: 'PASSWORD_RESET', value: 5 },
        ]}
      />,
    );

    const table = screen.getByRole('table', { name: /security events by type/i });
    expect(within(table).getByRole('rowheader', { name: 'PASSWORD_RESET' })).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '5' })).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });
});
