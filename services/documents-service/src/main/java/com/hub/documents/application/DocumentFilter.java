package com.hub.documents.application;

import java.util.UUID;

/**
 * Query criteria for the document list. These narrow what the caller is
 * <em>already</em> allowed to see — the FR-41 access rule is applied separately
 * and always, so no combination of filters can widen the result set. Blank
 * inputs are normalised to {@code null} (ignored).
 */
public record DocumentFilter(UUID categoryId, UUID ownerKeycloakId, String search) {

    public static DocumentFilter of(UUID categoryId, UUID ownerKeycloakId, String search) {
        return new DocumentFilter(categoryId, ownerKeycloakId, blankToNull(search));
    }

    static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
