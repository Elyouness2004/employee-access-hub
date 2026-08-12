import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { applyServerErrors, type SubmissionFailure } from '@/shared/api';
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
  Textarea,
} from '@/shared/components/ui';
import type { DocumentCategoryResponse } from '@/shared/types/documents';

import {
  CATEGORY_DESCRIPTION_MAX,
  CATEGORY_NAME_MAX,
  useSaveDocumentCategoryMutation,
} from '../api/documents-api';
import { CATEGORY_FORM_FIELDS, categorySchema, type CategoryFormValues } from '../schemas';
import { MIN_ROLE_OPTIONS } from './min-role';

/**
 * Create or re-tier a document category (P25, ADMIN only).
 *
 * The one field that matters is `minRole`, and it is not a preference: it is the
 * access gate. Setting it to HR or ADMIN is what makes the category — and every
 * document already filed under it — **sensitive**, retroactively. The form says
 * that in the helper text, before the choice is made, rather than leaving it to
 * be discovered.
 */
export interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent = create. Present = edit that category. */
  category?: DocumentCategoryResponse | undefined;
}

export function CategoryFormDialog({ open, onOpenChange, category }: CategoryFormDialogProps) {
  const save = useSaveDocumentCategoryMutation();
  const [failure, setFailure] = useState<SubmissionFailure | null>(null);
  const isEdit = Boolean(category);

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    mode: 'onBlur',
    defaultValues: { name: '', description: '', minRole: 'EMPLOYEE' },
  });
  const { reset, watch } = form;
  const minRole = watch('minRole');
  const becomesSensitive = minRole === 'HR' || minRole === 'ADMIN';

  useEffect(() => {
    if (!open) return;
    setFailure(null);
    reset({
      name: category?.name ?? '',
      description: category?.description ?? '',
      minRole: category?.minRole ?? 'EMPLOYEE',
    });
  }, [open, category, reset]);

  const close = () => {
    setFailure(null);
    onOpenChange(false);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      await save.mutateAsync({
        ...(category ? { id: category.id } : {}),
        body: {
          name: values.name.trim(),
          description: values.description.trim() ? values.description.trim() : null,
          minRole: values.minRole,
        },
      });
      close();
    } catch (error) {
      setFailure(applyServerErrors(error, form.setError, CATEGORY_FORM_FIELDS));
    }
  });

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent size="md">
        <div className="flex flex-col gap-1">
          <DialogTitle>{isEdit ? 'Edit category' : 'New document category'}</DialogTitle>
          <DialogDescription>
            A category is the access tier documents are filed into. Its minimum role decides who can
            read everything inside it.
          </DialogDescription>
        </div>

        {failure?.formMessage ? (
          <Alert tone="danger" live="assertive" title="This category was not saved">
            <p>{failure.formMessage}</p>
            {failure.correlationId ? (
              <p className="mt-1 font-mono text-mono-sm">Correlation id: {failure.correlationId}</p>
            ) : null}
          </Alert>
        ) : null}

        <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5">
          <FormField
            label="Name"
            required
            helper={`Up to ${CATEGORY_NAME_MAX} characters. Must be unique — the server rejects a duplicate.`}
            {...(form.formState.errors.name?.message
              ? { error: form.formState.errors.name.message }
              : {})}
          >
            {(props) => <Input {...props} {...form.register('name')} />}
          </FormField>

          <FormField
            label="Description"
            helper={`Optional — up to ${CATEGORY_DESCRIPTION_MAX} characters. Searchable alongside the name.`}
            {...(form.formState.errors.description?.message
              ? { error: form.formState.errors.description.message }
              : {})}
          >
            {(props) => <Textarea {...props} {...form.register('description')} />}
          </FormField>

          <FormField
            label="Minimum role"
            required
            helper="Nobody below this role can see any document in the category. HR and admin are the sensitive tier."
            {...(form.formState.errors.minRole?.message
              ? { error: form.formState.errors.minRole.message }
              : {})}
          >
            {(props) => (
              <Select {...props} {...form.register('minRole')}>
                {MIN_ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          {becomesSensitive ? (
            <Alert tone="warning" live={false} title="This marks the category sensitive">
              <p>
                {isEdit
                  ? 'Every document already filed here becomes sensitive too, and disappears for anyone below the HR tier — including its own owner.'
                  : 'Documents filed here will be marked sensitive and reachable only by HR and admin accounts.'}
              </p>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={close} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {isEdit ? 'Save category' : 'Create category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
