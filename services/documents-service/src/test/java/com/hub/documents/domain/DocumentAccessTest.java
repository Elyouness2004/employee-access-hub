package com.hub.documents.domain;

import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** FR-41 access rule as a pure domain rule: category role gate AND ownership. */
class DocumentAccessTest {

    private static final UUID ALICE = UUID.randomUUID();
    private static final UUID BOB = UUID.randomUUID();

    private Document doc(AccessRole minRole, UUID owner) {
        DocumentCategory category = new DocumentCategory("cat", "d", minRole);
        return new Document("t", "d", category, owner, "blob://x", "application/pdf", 1L, "hana");
    }

    @Test
    void companyWideGeneralDocumentIsReadableByAnyEmployee() {
        Document document = doc(AccessRole.EMPLOYEE, null);
        assertTrue(document.isAccessibleBy(ALICE, AccessRole.EMPLOYEE));
    }

    @Test
    void sensitiveDocumentNeedsHrOrAdmin() {
        Document document = doc(AccessRole.HR, null);
        assertFalse(document.isAccessibleBy(ALICE, AccessRole.EMPLOYEE));
        assertFalse(document.isAccessibleBy(ALICE, AccessRole.MANAGER));
        assertTrue(document.isAccessibleBy(ALICE, AccessRole.HR));
        assertTrue(document.isAccessibleBy(ALICE, AccessRole.ADMIN));
        assertTrue(document.isSensitive());
    }

    @Test
    void ownerScopedDocumentIsPrivateToOwnerAndSensitiveTier() {
        Document document = doc(AccessRole.EMPLOYEE, ALICE);
        assertTrue(document.isAccessibleBy(ALICE, AccessRole.EMPLOYEE));
        assertFalse(document.isAccessibleBy(BOB, AccessRole.EMPLOYEE));
        // HR/Admin administer and read everything
        assertTrue(document.isAccessibleBy(BOB, AccessRole.HR));
    }
}
