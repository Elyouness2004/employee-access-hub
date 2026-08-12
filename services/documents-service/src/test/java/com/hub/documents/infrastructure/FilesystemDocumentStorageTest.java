package com.hub.documents.infrastructure;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

import com.hub.documents.domain.storage.DocumentStorageException;
import com.hub.documents.domain.storage.StoredBlob;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The volume-backed blob store on its own: key generation, the round trip, and
 * the two containment rules that make it safe to point at client-supplied input.
 */
class FilesystemDocumentStorageTest {

    private static final byte[] CONTENT = "contract body".getBytes(StandardCharsets.UTF_8);

    @TempDir
    Path root;

    private FilesystemDocumentStorage storage() {
        return new FilesystemDocumentStorage(root.toString());
    }

    @Test
    void storesAndReadsBackTheSameBytes() throws IOException {
        FilesystemDocumentStorage storage = storage();

        StoredBlob blob = storage.store("contract.pdf", new ByteArrayInputStream(CONTENT));

        assertEquals(CONTENT.length, blob.sizeBytes(), "the store reports what it actually wrote");
        try (InputStream stream = storage.open(blob.storageKey()).orElseThrow()) {
            assertArrayEquals(CONTENT, stream.readAllBytes());
        }
    }

    /** The key is random and sharded — never the caller's filename. */
    @Test
    void generatesAShardedKeyThatIgnoresTheClientFilename() {
        FilesystemDocumentStorage storage = storage();

        StoredBlob first = storage.store("payslip.pdf", new ByteArrayInputStream(CONTENT));
        StoredBlob second = storage.store("payslip.pdf", new ByteArrayInputStream(CONTENT));

        assertTrue(first.storageKey().matches("[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f-]{36}\\.pdf"),
                "unexpected key shape: " + first.storageKey());
        assertFalse(first.storageKey().equals(second.storageKey()), "keys must not collide");
        assertFalse(first.storageKey().contains("payslip"), "the client filename must not become a path");
    }

    /** Only a short alphanumeric suffix survives; anything path-shaped is dropped entirely. */
    @Test
    void keepsOnlyAPlausibleExtension() {
        FilesystemDocumentStorage storage = storage();

        assertFalse(storage.store("../../etc/passwd", new ByteArrayInputStream(CONTENT))
                .storageKey().contains("passwd"));
        assertFalse(storage.store("weird.name with spaces", new ByteArrayInputStream(CONTENT))
                .storageKey().contains(" "));
        assertFalse(storage.store("noextension", new ByteArrayInputStream(CONTENT))
                .storageKey().contains("noextension"));
        assertTrue(storage.store("report.CSV", new ByteArrayInputStream(CONTENT))
                .storageKey().endsWith(".csv"), "the extension is normalised to lower case");
    }

    @Test
    void refusesAKeyThatEscapesTheRoot() {
        FilesystemDocumentStorage storage = storage();

        assertThrows(DocumentStorageException.class, () -> storage.open("../../../etc/passwd"));
        assertThrows(DocumentStorageException.class, () -> storage.delete("../outside.bin"));
    }

    /** Legacy pointers ("blob://…") and unknown keys are absent content, not an error. */
    @Test
    void unknownOrNonFilesystemKeyReadsAsEmpty() {
        FilesystemDocumentStorage storage = storage();

        assertEquals(Optional.empty(), storage.open("blob://docs/handbook"));
        assertEquals(Optional.empty(), storage.open("ab/cd/does-not-exist.pdf"));
        assertEquals(Optional.empty(), storage.open("  "));
        assertFalse(storage.delete("ab/cd/does-not-exist.pdf"));
    }

    @Test
    void deleteRemovesTheFileAndIsIdempotent() throws IOException {
        FilesystemDocumentStorage storage = storage();
        StoredBlob blob = storage.store("contract.pdf", new ByteArrayInputStream(CONTENT));

        assertTrue(storage.delete(blob.storageKey()));
        assertFalse(storage.delete(blob.storageKey()), "deleting twice is not an error");
        try (var paths = Files.walk(root)) {
            assertEquals(0, paths.filter(Files::isRegularFile).count());
        }
    }
}
