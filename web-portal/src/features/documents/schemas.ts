import { z } from 'zod';

import {
  CATEGORY_DESCRIPTION_MAX,
  CATEGORY_NAME_MAX,
  DOCUMENT_DESCRIPTION_MAX,
  DOCUMENT_TITLE_MAX,
} from './api/documents-api';

/**
 * Form rules mirroring the Bean Validation annotations on
 * `DocumentMetadataRequest` and `CategoryRequest`, one comment per rule so
 * drift is visible in review. They save a round trip; they never make the
 * decision. Uniqueness (the category 409) cannot be evaluated here at all —
 * this client does not hold every existing name.
 */

export const documentMetadataSchema = z.object({
  // `@NotBlank @Size(max = 200)`
  title: z
    .string()
    .trim()
    .min(1, 'Give the document a title.')
    .max(DOCUMENT_TITLE_MAX, `Keep the title under ${DOCUMENT_TITLE_MAX} characters.`),
  // `@Size(max = 500)` — optional on the record, so blank is valid.
  description: z
    .string()
    .max(DOCUMENT_DESCRIPTION_MAX, `Keep it under ${DOCUMENT_DESCRIPTION_MAX} characters.`),
  // `@NotNull UUID categoryId` — the category decides who may read the document.
  categoryId: z.string().min(1, 'Choose a category — it decides who can read this document.'),
  /**
   * `ownerKeycloakId` is optional on the record: omitted means company-wide.
   * The form models the choice explicitly rather than leaving a blank field to
   * be interpreted, because "nobody owns it" and "I forgot to fill this in"
   * must not look the same.
   */
  audience: z.enum(['COMPANY', 'PERSON']),
  /**
   * A Keycloak subject, NEVER an employeeId. Required only when the document is
   * assigned to a person; the shape check is here because a malformed value
   * would be a 400 from the server after a pointless round trip.
   */
  ownerKeycloakId: z.string().trim(),
});

export type DocumentMetadataFormValues = z.infer<typeof documentMetadataSchema>;

// Character classes are written letters-first (`a-f0-9`) deliberately: the
// token-contract test scans source for Tailwind arbitrary utility values, whose
// shape is a hyphen followed by a bracket and a digit — which a hex class
// written digits-first matches by accident. Same regex, no false positive.
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/**
 * The owner field is conditionally required, which Zod expresses as a refine on
 * the object rather than on the field — the rule is about the pair.
 */
export const documentMetadataFormSchema = documentMetadataSchema
  .refine((values) => values.audience === 'COMPANY' || values.ownerKeycloakId.length > 0, {
    path: ['ownerKeycloakId'],
    message: "Enter the owner's Keycloak subject, or make the document company-wide.",
  })
  .refine(
    (values) =>
      values.audience === 'COMPANY' ||
      values.ownerKeycloakId.length === 0 ||
      UUID_PATTERN.test(values.ownerKeycloakId),
    {
      path: ['ownerKeycloakId'],
      message: 'That is not a Keycloak subject — it is the UUID from the employee’s Identity tab.',
    },
  );

/** Field names this form owns; a server `errors` key outside them goes to the alert. */
export const DOCUMENT_FORM_FIELDS = [
  'title',
  'description',
  'categoryId',
  'ownerKeycloakId',
] as const;

export const categorySchema = z.object({
  // `@NotBlank @Size(max = 100)`
  name: z
    .string()
    .trim()
    .min(1, 'Give the category a name.')
    .max(CATEGORY_NAME_MAX, `Keep it under ${CATEGORY_NAME_MAX} characters.`),
  // `@Size(max = 500)`
  description: z
    .string()
    .max(CATEGORY_DESCRIPTION_MAX, `Keep it under ${CATEGORY_DESCRIPTION_MAX} characters.`),
  // `@NotNull AccessRole minRole`
  minRole: z.enum(['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN']),
});

export type CategoryFormValues = z.infer<typeof categorySchema>;

export const CATEGORY_FORM_FIELDS = ['name', 'description', 'minRole'] as const;
