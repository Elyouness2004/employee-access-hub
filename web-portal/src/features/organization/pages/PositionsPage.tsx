import { POSITIONS } from '../api/organization-api';
import { CataloguePage } from '../components/CataloguePage';

/**
 * P19 — Positions (`/hr/positions`). HR + ADMIN.
 *
 * Identical to P18 by construction, not by copy: `PositionController` is
 * `DepartmentController` with `title` where `name` is, so the same screen serves
 * both (see `organization-api.ts`).
 */
export function PositionsPage() {
  return (
    <CataloguePage
      catalogue={POSITIONS}
      title="Positions"
      description="The job-title catalogue every employee record is assigned from."
      emptyDescription="Positions are required on an employee record, so this catalogue needs at least one entry before anyone can be created."
    />
  );
}
