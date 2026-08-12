import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

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
  Select,
  Textarea,
} from '@/shared/components/ui';
import type { DocumentCategoryResponse, DocumentResponse } from '@/shared/types/documents';

import {
  DOCUMENT_DESCRIPTION_MAX,
  DOCUMENT_TITLE_MAX,
  precheckFile,
  useUpdateDocumentMetadataMutation,
  useUploadDocumentMutation,
} from '../api/documents-api';
import {
  DOCUMENT_FORM_FIELDS,
  documentMetadataFormSchema,
  type DocumentMetadataFormValues,
} from '../schemas';
import { FileUploader } from './FileUploader';

/**
 * Upload a document, or edit the metadata of one already stored (P22).
 *
 * One dialog for both, because they carry the *same* `DocumentMetadataRequest`
 * — the only difference is whether bytes travel with it. Splitting them would
 * duplicate the category picker, the audience choice and the whole error map.
 *
 * What the edit mode is careful about: `PUT /{id}/metadata` leaves the stored
 * file untouched, and the dialog says so rather than showing a file field that
 * would imply the bytes can be swapped here. (Replacing bytes needs
 * `PUT /{id}` with a client-supplied storage key — a route this SPA does not
 * use, because a client must never construct a storage key.)
 *
 * A failed submit never wipes input: a 415 is answered by choosing a different
 * file, and re-typing the description would be a punishment for the server's
 * opinion.
 */

export interface DocumentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent = upload a new document. Present = edit that document's metadata. */
  document?: DocumentResponse | undefined;
  categories: DocumentCategoryResponse[];
  categoriesError?: unknown;
}

export function DocumentFormDialog({
  open,
  onOpenChange,
  document,
  categories,
  categoriesError,
}: DocumentFormDialogProps) {
  const isEdit = Boolean(document);
  const upload = useUploadDocumentMutation();
  const updateMetadata = useUpdateDocumentMetadataMutation();

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null | undefined>(null);
  const [failure, setFailure] = useState<SubmissionFailure | null>(null);

  const form = useForm<DocumentMetadataFormValues>({
    resolver: zodResolver(documentMetadataFormSchema),
    mode: 'onBlur',
    defaultValues: {
      title: '',
      description: '',
      categoryId: '',
      audience: 'COMPANY',
      ownerKeycloakId: '',
    },
  });
  const { reset, watch } = form;
  const audience = watch('audience');

  // Opening on a different row must load that row, not the last one.
  useEffect(() => {
    if (!open) return;
    setFailure(null);
    setFile(null);
    setFileError(null);
    setProgress(null);
    reset({
      title: document?.title ?? '',
      description: document?.description ?? '',
      categoryId: document?.categoryId ?? '',
      audience: document?.ownerKeycloakId ? 'PERSON' : 'COMPANY',
      ownerKeycloakId: document?.ownerKeycloakId ?? '',
    });
  }, [open, document, reset]);

  const isPending = upload.isPending || updateMetadata.isPending;

  const close = () => {
    if (isPending) return;
    setFailure(null);
    onOpenChange(false);
  };

  const chooseFile = (next: File | null) => {
    setFile(next);
    setFileError(next ? precheckFile(next) : null);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null);
    const metadata = {
      title: values.title.trim(),
      description: values.description.trim() ? values.description.trim() : null,
      categoryId: values.categoryId,
      ownerKeycloakId: values.audience === 'PERSON' ? values.ownerKeycloakId.trim() : null,
    };

    try {
      if (document) {
        await updateMetadata.mutateAsync({ id: document.id, metadata });
      } else {
        if (!file) {
          setFileError('Choose a file to upload.');
          return;
        }
        const precheck = precheckFile(file);
        if (precheck) {
          setFileError(precheck);
          return;
        }
        setProgress(0);
        await upload.mutateAsync({ metadata, file, onProgress: setProgress });
      }
      close();
    } catch (error) {
      setProgress(null);
      // 413 and 415 are about the FILE, not about a form field, so they belong
      // on the uploader where the file was chosen — the server states the limit
      // it applied, which may differ from the mirrored config we advertised.
      if (
        isApiError(error) &&
        (error.kind === 'payloadTooLarge' || error.kind === 'unsupportedMediaType')
      ) {
        setFileError(
          error.detail ??
            (error.kind === 'payloadTooLarge'
              ? 'The server refused that file as too large.'
              : 'The server refused that file type.'),
        );
        setFailure({
          formMessage: null,
          ...(error.correlationId ? { correlationId: error.correlationId } : {}),
        });
        return;
      }
      setFailure(applyServerErrors(error, form.setError, DOCUMENT_FORM_FIELDS));
    }
  });

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent size="md">
        <div className="flex flex-col gap-1">
          <DialogTitle>{isEdit ? 'Edit document details' : 'Upload a document'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'This updates the description and access of the record. The stored file itself is left exactly as it is.'
              : 'The file is stored by the platform under a key it generates; the category you choose decides who can read it.'}
          </DialogDescription>
        </div>

        {failure?.formMessage ? (
          <Alert
            tone="danger"
            live="assertive"
            title={isEdit ? 'These details were not saved' : 'This document was not uploaded'}
          >
            <p>{failure.formMessage}</p>
            {failure.correlationId ? (
              <p className="mt-1 font-mono text-mono-sm">Correlation id: {failure.correlationId}</p>
            ) : null}
          </Alert>
        ) : null}

        <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-5">
          {isEdit ? null : (
            <FileUploader
              file={file}
              onFileChange={chooseFile}
              progress={progress}
              isUploading={upload.isPending}
              error={fileError}
            />
          )}

          <FormField
            label="Title"
            required
            helper={`Up to ${DOCUMENT_TITLE_MAX} characters. Searchable alongside the description and the stored filename.`}
            {...(form.formState.errors.title?.message
              ? { error: form.formState.errors.title.message }
              : {})}
          >
            {(props) => <Input {...props} {...form.register('title')} />}
          </FormField>

          <FormField
            label="Description"
            helper={`Optional — up to ${DOCUMENT_DESCRIPTION_MAX} characters.`}
            {...(form.formState.errors.description?.message
              ? { error: form.formState.errors.description.message }
              : {})}
          >
            {(props) => <Textarea {...props} {...form.register('description')} />}
          </FormField>

          <FormField
            label="Category"
            required
            helper="The category's minimum role is the access gate: an HR or admin category marks its documents sensitive."
            {...(form.formState.errors.categoryId?.message
              ? { error: form.formState.errors.categoryId.message }
              : {})}
          >
            {(props) => (
              <Select {...props} {...form.register('categoryId')}>
                <option value="">Choose a category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                    {category.sensitive ? ' (sensitive)' : ''}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          {categoriesError ? (
            <Alert tone="warning" title="The category list could not be loaded">
              <p>
                Without it there is nothing to choose from, so the upload cannot be completed right
                now. This is the catalogue failing to load — not a sign that the categories are
                gone.
              </p>
            </Alert>
          ) : null}

          <FormField
            label="Who it belongs to"
            helper="Company-wide documents have no owner; a personal document is reachable only by that account and by HR/admin."
          >
            {(props) => (
              <Select {...props} {...form.register('audience')}>
                <option value="COMPANY">Company-wide — no individual owner</option>
                <option value="PERSON">A specific person</option>
              </Select>
            )}
          </FormField>

          {audience === 'PERSON' ? (
            <FormField
              label="Owner — Keycloak subject"
              required
              helper="The login account id (the UUID on the employee's Identity tab), not the HR record id. The two are different identifiers and the server compares this one."
              {...(form.formState.errors.ownerKeycloakId?.message
                ? { error: form.formState.errors.ownerKeycloakId.message }
                : {})}
            >
              {(props) => (
                <Input {...props} className="font-mono" {...form.register('ownerKeycloakId')} />
              )}
            </FormField>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={close} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={isPending}>
              {isEdit ? 'Save details' : 'Upload document'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
