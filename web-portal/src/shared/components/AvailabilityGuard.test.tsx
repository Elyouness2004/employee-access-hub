import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AvailabilityGuard } from './AvailabilityGuard';
import { DataUnavailable } from './DataUnavailable';

/**
 * The analytics graceful-degradation contract, tested at its narrowest point.
 *
 * The hazard this component exists for is specific: `available: false` arrives
 * with every count set to zero by the `unavailable()` factory. So the assertion
 * that matters is not "the panel rendered" — it is that the children, and
 * therefore the zeros, were never rendered at all.
 */
describe('AvailabilityGuard', () => {
  it('renders children when the section reports itself available', () => {
    render(
      <AvailabilityGuard available source="hr-service" title="Workforce KPIs">
        <p>137 employees</p>
      </AvailabilityGuard>,
    );
    expect(screen.getByText('137 employees')).toBeVisible();
  });

  it('renders nothing of the payload when the section is unavailable', () => {
    render(
      <AvailabilityGuard available={false} source="hr-service" title="Workforce KPIs">
        {/* What the payload actually carries when available is false. */}
        <p>0 employees</p>
      </AvailabilityGuard>,
    );

    expect(screen.getByText('Workforce KPIs unavailable')).toBeVisible();
    expect(screen.getByText(/hr-service is unreachable/i)).toBeVisible();
    expect(screen.queryByText('0 employees')).toBeNull();
  });

  it('shows a busy skeleton before the flag is known, not an empty section', () => {
    const { container } = render(
      <AvailabilityGuard available={undefined} source="hr-service" title="Workforce KPIs">
        <p>137 employees</p>
      </AvailabilityGuard>,
    );

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByText(/loading workforce kpis/i)).toBeInTheDocument();
    expect(screen.queryByText('137 employees')).toBeNull();
  });

  it('routes a failed request through the error boundary, not the unavailable panel', () => {
    render(
      <AvailabilityGuard
        available={undefined}
        error={{ kind: 'network' }}
        source="hr-service"
        title="Workforce KPIs"
      >
        <p>137 employees</p>
      </AvailabilityGuard>,
    );

    // A request that failed is a different fact from a source that reported
    // itself absent, and it must not borrow the other one's panel.
    expect(screen.queryByText('Workforce KPIs unavailable')).toBeNull();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('DataUnavailable', () => {
  it('names the unreachable source and states that nothing here is a zero', () => {
    render(<DataUnavailable source="leave-service" title="Leave KPIs unavailable" />);

    expect(screen.getByText('Leave KPIs unavailable')).toBeVisible();
    expect(screen.getByText(/leave-service is unreachable/i)).toBeVisible();
    expect(screen.getByText(/nothing here is zero/i)).toBeVisible();
  });
});
