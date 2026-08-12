package com.hub.documents.application;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.util.unit.DataSize;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** What this deployment accepts as an uploaded file, asserted without a web layer. */
class DocumentUploadPolicyTest {

    private final DocumentUploadPolicy policy = new DocumentUploadPolicy(
            DataSize.ofKilobytes(10), List.of("application/pdf", "text/csv"));

    @Test
    void acceptsAnAllowlistedTypeWithinTheCeiling() {
        assertEquals("application/pdf", policy.validate("application/pdf", 1_024));
    }

    /** Parameters are not part of the identity of a media type. */
    @Test
    void normalisesCaseAndParameters() {
        assertEquals("text/csv", policy.validate("TEXT/CSV; charset=UTF-8", 10));
    }

    @Test
    void rejectsAFileAboveTheCeiling() {
        assertThrows(DocumentTooLargeException.class,
                () -> policy.validate("application/pdf", DataSize.ofKilobytes(11).toBytes()));
    }

    @Test
    void acceptsExactlyTheCeiling() {
        assertEquals("application/pdf",
                policy.validate("application/pdf", DataSize.ofKilobytes(10).toBytes()));
    }

    @Test
    void rejectsATypeOutsideTheAllowlist() {
        assertThrows(UnsupportedDocumentTypeException.class,
                () -> policy.validate("application/x-sh", 10));
    }

    /** A missing content type is refused rather than defaulted to something permissive. */
    @Test
    void rejectsAMissingContentType() {
        assertThrows(UnsupportedDocumentTypeException.class, () -> policy.validate(null, 10));
    }

    @Test
    void rejectsAnEmptyFileBeforeAnythingElse() {
        assertThrows(EmptyUploadException.class, () -> policy.validate("application/pdf", 0));
    }

    @Test
    void exposesItsLimitsForDiagnostics() {
        assertEquals(DataSize.ofKilobytes(10).toBytes(), policy.maxFileSizeBytes());
        assertEquals(2, policy.allowedContentTypes().size());
    }
}
