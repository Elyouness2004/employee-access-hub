package com.hub.documents.domain.storage;

import java.io.InputStream;
import java.util.Optional;

/**
 * Port to the blob store that holds document bytes. The aggregate keeps only the
 * {@code storageKey} pointer (§2.4), so the storage technology stays outside the
 * domain: the shipped adapter is volume-backed
 * {@code FilesystemDocumentStorage}, and an object-store adapter can replace it
 * without touching a use case.
 *
 * <p>Implementations generate the storage key themselves. A caller never
 * supplies one, so a client-controlled filename can never decide where bytes
 * land.
 */
public interface DocumentStorage {

    /**
     * Persists {@code content} under a freshly generated, unguessable key.
     *
     * @param originalFilename the client's filename — used only to derive a file
     *                         extension, never as a path
     * @return the generated key and the number of bytes actually written
     * @throws DocumentStorageException when the blob store cannot be written to
     */
    StoredBlob store(String originalFilename, InputStream content);

    /**
     * Opens the stored bytes, or {@link Optional#empty()} when the key resolves
     * to nothing — the case for metadata-only records that point at a blob this
     * service never received.
     *
     * @throws DocumentStorageException when the blob store cannot be read
     */
    Optional<InputStream> open(String storageKey);

    /** Best-effort removal; returns whether bytes were actually deleted. */
    boolean delete(String storageKey);
}
