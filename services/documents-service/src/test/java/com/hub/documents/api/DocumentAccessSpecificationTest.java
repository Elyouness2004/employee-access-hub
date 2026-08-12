package com.hub.documents.api;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import com.hub.documents.domain.AccessRole;
import com.hub.documents.domain.Document;
import com.hub.documents.infrastructure.DocumentRepository;
import com.hub.documents.infrastructure.DocumentSpecifications;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The list query and the domain rule must answer the same question. The access
 * rule now exists twice — once as {@code Document.isAccessibleBy} (authority,
 * guards every single-document operation) and once as
 * {@code DocumentSpecifications.accessibleBy} (its SQL projection, so a page is
 * really a page). This test pins them together across every role and ownership
 * combination, so the two cannot drift apart unnoticed.
 */
class DocumentAccessSpecificationTest extends DocumentsWebTestSupport {

    @Autowired
    private DocumentRepository documents;

    @BeforeEach
    void seedEveryCombination() throws Exception {
        for (String category : List.of(GENERAL_CAT, HR_CAT, PAYROLL_CAT)) {
            upload(asAdam(), "company-" + category, category, null);
            upload(asAdam(), "alice-" + category, category, ALICE_KC);
            upload(asAdam(), "bob-" + category, category, BOB_KC);
        }
    }

    @Test
    void queryAndDomainRuleAgreeForEveryRoleAndOwnership() {
        assertAgreement(ALICE_KC, AccessRole.EMPLOYEE);
        assertAgreement(BOB_KC, AccessRole.EMPLOYEE);
        assertAgreement(MARK_KC, AccessRole.MANAGER);
        assertAgreement(HANA_KC, AccessRole.HR);
        assertAgreement(ADAM_KC, AccessRole.ADMIN);
        // a caller who owns nothing still sees the company-wide documents of their tier
        assertAgreement(UUID.randomUUID(), AccessRole.EMPLOYEE);
    }

    private void assertAgreement(UUID callerKeycloakId, AccessRole role) {
        Set<UUID> fromQuery = documents.findAll(DocumentSpecifications.accessibleBy(callerKeycloakId, role))
                .stream().map(Document::getId).collect(Collectors.toSet());
        Set<UUID> fromDomain = documents.findAll().stream()
                .filter(document -> document.isAccessibleBy(callerKeycloakId, role))
                .map(Document::getId)
                .collect(Collectors.toSet());

        assertEquals(fromDomain, fromQuery, "SQL access rule disagrees with the domain for " + role);
    }
}
