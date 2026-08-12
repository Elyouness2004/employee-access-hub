/** Public surface of the employees feature (P16 directory, P17 profile tab). */
export { EmployeeDirectoryPage } from './pages/EmployeeDirectoryPage';
export { EmployeeFormDialog } from './components/EmployeeFormDialog';
export { EmployeePicker } from './components/EmployeePicker';
export { EmployeeProfileHeader } from './components/EmployeeProfileHeader';
export { EmployeeProfilePanel } from './components/EmployeeProfilePanel';
export {
  employeeKeys,
  employeeName,
  useDeleteEmployeeMutation,
  useEmployeeListQuery,
  useEmployeeQuery,
  useEmployeeSearchQuery,
  useSaveEmployeeMutation,
  EMPLOYEE_DEFAULT_SORT,
  EMPLOYEE_PAGE_SIZE,
  EMPLOYEE_SORTABLE,
} from './api/employees-api';
export type { EmployeeListParams, EmployeeWrite } from './api/employees-api';
