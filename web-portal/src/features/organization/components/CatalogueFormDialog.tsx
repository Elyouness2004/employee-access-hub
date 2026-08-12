import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm, type UseFormSetError } from 'react-hook-form';

import { applyServerErrors, isApiError, type SubmissionFailure } from '@/shared/api';
import { Alert, FormField } from '@/shared/components';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Input,
  Textarea,
} from '@/shared/components/ui';

import {
  CATALOGUE_DESCRIPTION_MAX,
  CATALOGUE_LABEL_MAX,
  useSaveCatalogueEntryMutation,
  type CatalogueDescriptor,
  type CatalogueEntryView,
} from '../api/organization-api';
import { catalogueSchema, CATALOGUE_FORM_FIELDS, type CatalogueFormValues } from '../schemas';

/**
 * Create or rename a catalogue entry (P18, P19).
 *
 * One dialog serves both catalogues. The only thing that genuinely differs is
 * the name of the label field — `name` on a department, `title` on a position —
 * and that difference is confined to `applyCatalogueErrors` below, so a 400
 * still lands on the field the user is looking at.
 *
 * The dialog stays open on failure and never wipes input: a 409 ("that name is
 * taken") is answered by editing one field, and re-typing a description because
 * the name collided would be a punishment for the server's opinion.
 */
export interface CatalogueFormDialogProps {
  catalogue: CatalogueDescriptor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent = create. Present = edit that entry. */
  entry?: CatalogueEntryView | undefined;
}

/**
 * The shared mapper keyed by form-field name; the server keys by DTO-field name.
 * Everything except that translation — 409, 422, 503, network, the correlation
 * id — stays with `applyServerErrors`, which owns those rules for the whole app.
 */
function applyCatalogueErrors(
  error: unknown,
  setError: UseFormSetError<CatalogueFormValues>,
  labelField: 'name' | 'title',
): SubmissionFailure {
  if (isApiError(error) && error.kind === 'validation') {
    const unmatched: string[] = [];
    for (const [field, message] of Object.entries(error.errors)) {
      if (field === labelField) setError('label', { type: 'server', message });
      else if (field === 'description') setError('description', { type: 'server', message });
      else unmatched.push(`${field}: ${message}`);
    }
    return {
      formMessage: unmatched.length
        ? unmatched.join(' · ')
        : Object.keys(error.errors).length === 0
          ? (error.detail ?? 'One or more fields are invalid.')
          : null,
      ...(error.correlationId ? { correlationId: error.correlationId } : {}),
    };
  }
  return applyServerErrors(error, setError, CATALOGUE_FORM_FIELDS);
}

export function CatalogueFormDialog({
  catalogue,
  open,
  onOpenChange,
  entry,
}: CatalogueFormDialogProps) {
  const save = useSaveCatalogueEntryMutation(catalogue);
  const [failure, setFailure] = useState<SubmissionFailure | null>(null);
  const isEdit = Boolean(entry);

  const form = useForm<CatalogueFormValues>({
    resolver: zodResolver(
      catalogueSchema(catalogue.singular, catalogue.labelHeading.toLowerCase()),
    ),
    mode: 'onBlur',
    defaultValues: { label: '', description: '' },
  });

  const { reset } = form;
  // Opening the dialog on a different row must load that row, not the last one.
  useEffect(() => {
    if (!open) return;
    setFailure(null);
    reset({ label: entry?.label ?? '', description: entry?.description ?? '' });
  }, [open, entry, reset]);

  const close = () => {
    setFailure(null);
    onOpenChange(false);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      await save.mutateAsync({
        ...(entry ? { id: entry.id } : {}),
        label: values.label.trim(),
        description: values.description.trim() ? values.description.trim() : null,
      });
      close();
    } catch (error) {
      setFailure(applyCatalogueErrors(error, form.setError, catalogue.labelField));
    }
  });

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent size="md">
        <div className="flex flex-col gap-1">
          <DialogTitle>
            {isEdit ? `Edit ${catalogue.singular}` : `New ${catalogue.singular}`}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Renaming a ${catalogue.singular} updates it everywhere it is referenced — employees keep their assignment.`
              : `Employees are assigned to a ${catalogue.singular} on their record. Creating one here makes it available in the employee form.`}
          </DialogDescription>
        </div>

        {failure?.formMessage ? (
          <Alert tone="danger" live="assertive" title={`This ${catalogue.singular} was not saved`}>
            <p>{failure.formMessage}</p>
            {failure.correlationId ? (
              <p className="mt-1 font-mono text-mono-sm">Correlation id: {failure.correlationId}</p>
            ) : null}
          </Alert>
        ) : null}

        <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5">
          <FormField
            label={catalogue.labelHeading}
            required
            helper={`Up to ${CATALOGUE_LABEL_MAX} characters. Must be unique — the server rejects a duplicate.`}
            {...(form.formState.errors.label?.message
              ? { error: form.formState.errors.label.message }
              : {})}
          >
            {(props) => <Input {...props} {...form.register('label')} />}
          </FormField>

          <FormField
            label="Description"
            helper={`Optional — up to ${CATALOGUE_DESCRIPTION_MAX} characters. Searchable alongside the ${catalogue.labelHeading.toLowerCase()}.`}
            {...(form.formState.errors.description?.message
              ? { error: form.formState.errors.description.message }
              : {})}
          >
            {(props) => <Textarea {...props} {...form.register('description')} />}
          </FormField>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={close} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {isEdit ? 'Save changes' : `Create ${catalogue.singular}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
