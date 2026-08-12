import { z } from 'zod';

import { CATALOGUE_DESCRIPTION_MAX, CATALOGUE_LABEL_MAX } from './api/organization-api';

/**
 * Catalogue form rules, each mirroring a Bean Validation annotation on
 * `DepartmentRequest` / `PositionRequest` so drift is visible in review. They
 * exist to save a round trip, never to make a decision — the server is the
 * authority, and uniqueness (the 409) cannot be evaluated here at all because
 * this client does not hold every existing name.
 */
export function catalogueSchema(singular: string, labelNoun: string) {
  return z.object({
    // `@NotBlank @Size(max = 100)`
    label: z
      .string()
      .trim()
      .min(1, `Enter a ${singular} ${labelNoun}.`)
      .max(CATALOGUE_LABEL_MAX, `Keep it under ${CATALOGUE_LABEL_MAX} characters.`),
    // `@Size(max = 500)` — optional on the record, so blank is valid.
    description: z
      .string()
      .max(CATALOGUE_DESCRIPTION_MAX, `Keep it under ${CATALOGUE_DESCRIPTION_MAX} characters.`),
  });
}

export type CatalogueFormValues = z.infer<ReturnType<typeof catalogueSchema>>;

/** Field names this form owns; a server `errors` key outside them goes to the alert. */
export const CATALOGUE_FORM_FIELDS = ['label', 'description'] as const;
