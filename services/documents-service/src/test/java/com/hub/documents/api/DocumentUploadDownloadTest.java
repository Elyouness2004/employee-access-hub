package com.hub.documents.api;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Real file storage: upload, download, delete, and the policy that guards them.
 * The FR-41 access rule is unchanged and is covered by {@link DocumentFlowTest};
 * what is asserted here is that the bytes make the round trip, that the download
 * is still audited, and that a rejected upload leaves nothing behind.
 */
class DocumentUploadDownloadTest extends DocumentsWebTestSupport {

    private static final byte[] PDF = "%PDF-1.7 minimal fixture".getBytes(StandardCharsets.UTF_8);

    @Test
    void hrUploadsAFileAndAnEmployeeDownloadsTheBytes() throws Exception {
        String id = uploadFile(asHana(), "handbook", GENERAL_CAT, null, PDF);

        mockMvc.perform(get("/api/documents/" + id).with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.contentType").value("application/pdf"))
                // the size recorded is what the store wrote, not what the client declared
                .andExpect(jsonPath("$.sizeBytes").value(PDF.length))
                .andExpect(jsonPath("$.uploadedBy").value("hana.hr"));

        byte[] downloaded = mockMvc.perform(get("/api/documents/" + id + "/content").with(asAlice()))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", "attachment; filename=\"handbook.pdf\""))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andReturn().getResponse().getContentAsByteArray();

        assertArrayEquals(PDF, downloaded, "the bytes must survive the round trip");
    }

    @Test
    void everyContentDownloadIsAudited() throws Exception {
        String id = uploadFile(asHana(), "policy", GENERAL_CAT, null, PDF);
        mockMvc.perform(get("/api/documents/" + id + "/content").with(asAlice()))
                .andExpect(status().isOk());

        boolean audited = auditLog.findAll().stream()
                .anyMatch(entry -> entry.getAction().equals("DOCUMENT_DOWNLOADED")
                        && entry.getResource().equals("document:" + id));
        assertTrue(audited, "streaming the bytes is a download and must be audited (FR-41)");
    }

    /** The access rule guards the bytes exactly as it guards the metadata. */
    @Test
    void anEmployeeCannotStreamSomeoneElsesDocument() throws Exception {
        String id = uploadFile(asHana(), "alice-contract", GENERAL_CAT, ALICE_KC, PDF);

        mockMvc.perform(get("/api/documents/" + id + "/content").with(asBob()))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/documents/" + id + "/content").with(asAlice()))
                .andExpect(status().isOk());
    }

    @Test
    void sensitiveContentStillRequiresTheCategoryTier() throws Exception {
        String id = uploadFile(asHana(), "salary-bands", HR_CAT, null, PDF);

        mockMvc.perform(get("/api/documents/" + id + "/content").with(asAlice()))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/documents/" + id + "/content").with(asHana()))
                .andExpect(status().isOk());
    }

    /** Metadata registered for a blob written elsewhere: the record exists, the bytes do not. */
    @Test
    void metadataOnlyRecordHasNoContent() throws Exception {
        String id = upload(asHana(), "external-doc", GENERAL_CAT, null);

        mockMvc.perform(get("/api/documents/" + id).with(asAlice()))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/documents/" + id + "/content").with(asAlice()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.title").value("Resource not found"));

        // ...and the failed content read must not be recorded as a download
        boolean audited = auditLog.findAll().stream()
                .anyMatch(entry -> entry.getAction().equals("DOCUMENT_DOWNLOADED")
                        && entry.getResource().equals("document:" + id));
        assertEquals(false, audited, "a 404 is not a download");
    }

    @Test
    void aFileAboveTheCeilingIsRejectedAndStoresNothing() throws Exception {
        byte[] tooBig = new byte[2048]; // the test ceiling is 1 KB

        mockMvc.perform(uploadOf("big.pdf", "application/pdf", tooBig, "big", GENERAL_CAT, null)
                        .with(asHana()))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.title").value("File too large"));

        mockMvc.perform(get("/api/documents").with(asHana()))
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void aTypeOutsideTheAllowlistIsRejected() throws Exception {
        mockMvc.perform(uploadOf("payload.sh", "application/x-sh", PDF, "script", GENERAL_CAT, null)
                        .with(asHana()))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.title").value("Unsupported file type"));
    }

    @Test
    void anEmptyFileIsRejected() throws Exception {
        mockMvc.perform(uploadOf("empty.pdf", "application/pdf", new byte[0], "empty", GENERAL_CAT, null)
                        .with(asHana()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void uploadIsHrOnly() throws Exception {
        mockMvc.perform(uploadOf("handbook.pdf", "application/pdf", PDF, "handbook", GENERAL_CAT, null)
                        .with(asAlice()))
                .andExpect(status().isForbidden());
    }

    @Test
    void invalidMetadataIsAFieldLevelValidationError() throws Exception {
        mockMvc.perform(uploadOf("handbook.pdf", "application/pdf", PDF, "", GENERAL_CAT, null)
                        .with(asHana()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.title").exists());
    }

    @Test
    void unknownCategoryIsUnprocessable() throws Exception {
        mockMvc.perform(uploadOf("handbook.pdf", "application/pdf", PDF, "handbook",
                        UUID.randomUUID().toString(), null).with(asHana()))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void metadataEditKeepsTheStoredFile() throws Exception {
        String id = uploadFile(asHana(), "handbook", GENERAL_CAT, null, PDF);

        mockMvc.perform(put("/api/documents/" + id + "/metadata").with(asHana())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\": \"handbook v2\", \"categoryId\": \"" + HR_CAT + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("handbook v2"))
                .andExpect(jsonPath("$.sensitive").value(true))
                .andExpect(jsonPath("$.sizeBytes").value(PDF.length));

        // still downloadable — by HR now that it sits in a sensitive category
        mockMvc.perform(get("/api/documents/" + id + "/content").with(asHana()))
                .andExpect(status().isOk())
                .andExpect(content().bytes(PDF));
    }

    @Test
    void deletingADocumentRemovesItsBytes() throws Exception {
        String id = uploadFile(asHana(), "temporary", GENERAL_CAT, null, PDF);
        long storedBefore = storedFileCount();

        mockMvc.perform(delete("/api/documents/" + id).with(asHana()))
                .andExpect(status().isNoContent());

        assertEquals(storedBefore - 1, storedFileCount(), "the blob must go with the record");
        mockMvc.perform(get("/api/documents/" + id + "/content").with(asHana()))
                .andExpect(status().isNotFound());
    }

    private static long storedFileCount() throws Exception {
        try (var paths = Files.walk(STORAGE_ROOT)) {
            return paths.filter(Files::isRegularFile).count();
        }
    }
}
