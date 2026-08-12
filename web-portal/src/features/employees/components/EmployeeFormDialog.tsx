import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { applyServerErrors, isApiError, type SubmissionFailure } from '@/shared/api';
import { useDepartmentCatalogueQuery, usePositionCatalogueQuery } from '@/shared/catalogues';
import { Alert, FormField } from '@/shared/components';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Input,
  Select,
} from '@/shared/components/ui';
import { todayIso } from '@/shared/lib/format';
import type { EmployeeResponse } from '@/shared/types/hr';

import {
  EMPLOYEE_EMAIL_MAX,
  EMPLOYEE_MATRICULE_MAX,
  useSaveEmployeeMutation,
} from '../api/employees-api';
import { employeeSchema, EMPLOYEE_FORM_FIELDS, type EmployeeFormValues } from '../schemas';
import { EmployeePicker } from './EmployeePicker';

/**
 * Create or edit an employee record (P16).
 *
 * The form is the front door to the identity lifecycle, so it says what saving
 * will actually do rather than leaving the user to discover it:
 *
 *  - **Saving an ACTIVE record with no linked account requests provisioning.**
 *    `EmployeeService.create/update` publishes `EmployeeProvisioningRequested`,
 *    and `EmployeeLifecycleListener` handles it AFTER_COMMIT — catching and
 *    logging any failure. The save therefore always succeeds; the account may
 *    not. The dialog states that up front and the directory says where the
 *    outcome is recorded.
 *  - **Editing name, email or status on a LINKED record pushes to Keycloak.**
 *    That is `IdentitySyncService`, best-effort, and the email doubles as the
 *    account username — which is exactly the sort of change someone should be
 *    told about before they make it, not after.
 *
 * Failures never wipe input, and the dialog stays open so the answer sits next
 * to the field that caused it.
 */
export interface EmployeeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent = create. Present = edit that record. */
  employee?: EmployeeResponse | undefined;
  onSaved?: (employee: EmployeeResponse, created: boolean) => void;
}

/**
 * `DuplicateResourceException` answers 409 with a sentence, not an `errors`
 * map — so nothing tells the form WHICH field collided. The two messages
 * `EmployeeService` can produce start with the field name, so the field is
 * flagged when the sentence still starts that way and simply is not flagged
 * when it does not. The server's own words are shown either way: this only ever
 * adds a marker, and can never invent or suppress a message.
 */
const CONFLICT_FIELDS = [
  { prefix: 'matricule already exists', field: 'matricule', marker: 'This matricule is taken.' },
  { prefix: 'email already exists', field: 'email', marker: 'This email is already in use.' },
] as const;

export function EmployeeFormDialog({
  open,
  onOpenChange,
  employee,
  onSaved,
}: EmployeeFormDialogProps) {
  const save = useSaveEmployeeMutation();
  const [failure, setFailure] = useState<SubmissionFailure | null>(null);
  const departments = useDepartmentCatalogueQuery();
  const positions = usePositionCatalogueQuery();
  const isEdit = Boolean(employee);

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    mode: 'onBlur',
    defaultValues: {
      matricule: '',
      firstName: '',
      lastName: '',
      email: '',
      hireDate: '',
      status: 'ACTIVE',
      departmentId: '',
      positionId: '',
      managerId: null,
    },
  });

  const { reset } = form;
  useEffect(() => {
    if (!open) return;
    setFailure(null);
    reset({
      matricule: employee?.matricule ?? '',
      firstName: employee?.firstName ?? '',
      lastName: employee?.lastName ?? '',
      email: employee?.email ?? '',
      hireDate: employee?.hireDate ?? '',
      status: employee?.status ?? 'ACTIVE',
      departmentId: employee?.departmentId ?? '',
      positionId: employee?.positionId ?? '',
      managerId: employee?.managerId ?? null,
    });
  }, [open, employee, reset]);

  const close = () => {
    setFailure(null);
    onOpenChange(false);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      const saved = await save.mutateAsync({
        ...(employee ? { id: employee.id } : {}),
        matricule: values.matricule.trim(),
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim(),
        hireDate: values.hireDate,
        status: values.status,
        departmentId: values.departmentId,
        positionId: values.positionId,
        managerId: values.managerId,
      });
      onSaved?.(saved, !employee);
      close();
    } catch (error) {
      const submission = applyServerErrors(error, form.setError, EMPLOYEE_FORM_FIELDS);
      if (isApiError(error) && error.kind === 'conflict') {
        const match = CONFLICT_FIELDS.find((candidate) =>
          error.detail.toLowerCase().startsWith(candidate.prefix),
        );
        // A short marker on the field; the alert above already carries the
        // server's own sentence, and printing it twice makes the form look
        // like it hit two different problems.
        if (match) form.setError(match.field, { type: 'server', message: match.marker });
      }
      setFailure(submission);
    }
  });

  const status = form.watch('status');
  const willRequestProvisioning = status === 'ACTIVE' && !employee?.keycloakId;
  const willSyncIdentity = Boolean(employee?.keycloakId);
  const catalogueBroken = Boolean(departments.error || positions.error);
  const catalogueEmpty = departments.data?.items.length === 0 || positions.data?.items.length === 0;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent size="lg">
        <div className="flex flex-col gap-1">
          <DialogTitle>{isEdit ? 'Edit employee' : 'New employee'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'The HR record. Identity actions — provisioning, lock, offboarding — are on the employee’s Identity tab.'
              : 'Creating the HR record. The login account is a separate step that the record’s status decides.'}
          </DialogDescription>
        </div>

        {failure?.formMessage ? (
          <Alert tone="danger" live="assertive" title="This employee was not saved">
            <p>{failure.formMessage}</p>
            {failure.rule || failure.correlationId ? (
              <p className="mt-1 font-mono text-mono-sm">
                {failure.rule ? `Rule ${failure.rule}` : null}
                {failure.rule && failure.correlationId ? ' · ' : null}
                {failure.correlationId ? `Correlation id: ${failure.correlationId}` : null}
              </p>
            ) : null}
          </Alert>
        ) : null}

        {catalogueBroken ? (
          <Alert tone="warning" title="The catalogues could not be loaded">
            Departments and positions are required on a record, so this form cannot be completed
            until they load. Close the dialog and retry from the directory.
          </Alert>
        ) : catalogueEmpty ? (
          <Alert tone="warning" title="A catalogue is empty">
            Every employee needs a department and a position. Create them under{' '}
            <Link className="text-link underline" to="/hr/departments">
              Departments
            </Link>{' '}
            and{' '}
            <Link className="text-link underline" to="/hr/positions">
              Positions
            </Link>{' '}
            first.
          </Alert>
        ) : null}

        <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="Matricule"
              required
              helper={`Payroll identifier, up to ${EMPLOYEE_MATRICULE_MAX} characters. Must be unique.`}
              {...(form.formState.errors.matricule?.message
                ? { error: form.formState.errors.matricule.message }
                : {})}
            >
              {(props) => <Input mono {...props} {...form.register('matricule')} />}
            </FormField>

            <FormField
              label="Hire date"
              required
              helper="Today or earlier — the server rejects a future date."
              {...(form.formState.errors.hireDate?.message
                ? { error: form.formState.errors.hireDate.message }
                : {})}
            >
              {(props) => (
                <Input type="date" max={todayIso()} {...props} {...form.register('hireDate')} />
              )}
            </FormField>

            <FormField
              label="First name"
              required
              {...(form.formState.errors.firstName?.message
                ? { error: form.formState.errors.firstName.message }
                : {})}
            >
              {(props) => <Input {...props} {...form.register('firstName')} />}
            </FormField>

            <FormField
              label="Last name"
              required
              {...(form.formState.errors.lastName?.message
                ? { error: form.formState.errors.lastName.message }
                : {})}
            >
              {(props) => <Input {...props} {...form.register('lastName')} />}
            </FormField>
          </div>

          <FormField
            label="Work email"
            required
            helper={`Up to ${EMPLOYEE_EMAIL_MAX} characters. This also becomes the Keycloak username when the account is provisioned.`}
            {...(form.formState.errors.email?.message
              ? { error: form.formState.errors.email.message }
              : {})}
          >
            {(props) => <Input type="email" {...props} {...form.register('email')} />}
          </FormField>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="Department"
              required
              {...(form.formState.errors.departmentId?.message
                ? { error: form.formState.errors.departmentId.message }
                : {})}
            >
              {(props) => (
                <Select {...props} {...form.register('departmentId')}>
                  <option value="">Choose a department</option>
                  {departments.data?.items.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>

            <FormField
              label="Position"
              required
              {...(form.formState.errors.positionId?.message
                ? { error: form.formState.errors.positionId.message }
                : {})}
            >
              {(props) => (
                <Select {...props} {...form.register('positionId')}>
                  <option value="">Choose a position</option>
                  {positions.data?.items.map((position) => (
                    <option key={position.id} value={position.id}>
                      {position.title}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          </div>

          <FormField
            label="Reports to"
            helper="Optional. The manager on the record is who receives this person’s leave and expense requests."
            {...(form.formState.errors.managerId?.message
              ? { error: form.formState.errors.managerId.message }
              : {})}
          >
            {(props) => (
              <Controller
                control={form.control}
                name="managerId"
                render={({ field }) => (
                  <EmployeePicker
                    noun="manager"
                    value={field.value}
                    onChange={field.onChange}
                    id={props.id}
                    describedBy={props['aria-describedby']}
                    invalid={Boolean(props['aria-invalid'])}
                    {...(employee ? { excludeEmployeeId: employee.id } : {})}
                  />
                )}
              />
            )}
          </FormField>

          <FormField
            label="Record status"
            required
            helper="Only ACTIVE keeps a linked Keycloak account enabled."
            {...(form.formState.errors.status?.message
              ? { error: form.formState.errors.status.message }
              : {})}
          >
            {(props) => (
              <Select {...props} {...form.register('status')}>
                <option value="ACTIVE">Active</option>
                <option value="DISABLED">Disabled</option>
                <option value="TERMINATED">Terminated</option>
              </Select>
            )}
          </FormField>

          {willRequestProvisioning ? (
            <Alert tone="info" title="Saving this will request a login account">
              An ACTIVE record with no linked account triggers provisioning in Keycloak. That runs
              after the save and can fail on its own — the save still succeeds, and the outcome is
              recorded on the employee’s Identity tab, where it can be retried.
            </Alert>
          ) : null}

          {willSyncIdentity ? (
            <Alert tone="info" title="This record has a linked login account">
              Changing the name, work email or status pushes the change to Keycloak. Setting the
              status to Disabled or Terminated disables the account.
            </Alert>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={close} disabled={save.isPending}>
              Cancel
            </Button>
            {/* Enabled while invalid on purpose: clicking reveals what is wrong
                and focuses it, which a disabled button cannot do. */}
            <Button type="submit" loading={save.isPending}>
              {isEdit ? 'Save changes' : 'Create employee'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
