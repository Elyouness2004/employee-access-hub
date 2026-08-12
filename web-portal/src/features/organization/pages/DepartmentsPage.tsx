import { DEPARTMENTS } from '../api/organization-api';
import { CataloguePage } from '../components/CataloguePage';

/** P18 — Departments (`/hr/departments`). HR + ADMIN. */
export function DepartmentsPage() {
  return (
    <CataloguePage
      catalogue={DEPARTMENTS}
      title="Departments"
      description="The department catalogue every employee record is assigned from."
      emptyDescription="Departments are required on an employee record, so this catalogue needs at least one entry before anyone can be created."
    />
  );
}
