package com.hub.documents.infrastructure;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import com.hub.documents.domain.storage.DocumentStorage;
import com.hub.documents.domain.storage.DocumentStorageException;
import com.hub.documents.domain.storage.StoredBlob;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Volume-backed blob store — the adapter the migration always assumed
 * ("pointer to the blob in volume-backed storage"). Bytes live under
 * {@code hub.documents.storage.root}, a Docker volume in compose and a host
 * directory on the VM; nothing but the pointer reaches the database.
 *
 * <p>Two properties make it safe to expose to uploads:
 * <ul>
 *   <li><b>Generated names.</b> The key is a random UUID plus a sanitised
 *       extension, sharded over two levels so no directory grows unbounded. The
 *       client's filename never becomes a path, so {@code ../../etc/passwd} and
 *       friends are structurally impossible.</li>
 *   <li><b>Root containment.</b> Every key — including legacy pointers written
 *       before this service stored bytes — is resolved and normalised against
 *       the root and rejected if it escapes it.</li>
 * </ul>
 */
@Component
public class FilesystemDocumentStorage implements DocumentStorage {

    /** Extension kept only when it is short and alphanumeric; anything else is dropped. */
    private static final int MAX_EXTENSION_LENGTH = 10;

    private final Path root;

    public FilesystemDocumentStorage(
            @Value("${hub.documents.storage.root:${java.io.tmpdir}/employee-hub-documents}") String root) {
        this.root = Path.of(root).toAbsolutePath().normalize();
    }

    @Override
    public StoredBlob store(String originalFilename, InputStream content) {
        String storageKey = newStorageKey(originalFilename);
        Path target = resolve(storageKey)
                .orElseThrow(() -> new DocumentStorageException("generated storage key is not usable"));
        Path shard = target.getParent();
        if (shard == null) {
            throw new DocumentStorageException("generated storage key has no shard directory: " + storageKey);
        }
        try {
            Files.createDirectories(shard);
            long written = Files.copy(content, target, StandardCopyOption.REPLACE_EXISTING);
            return new StoredBlob(storageKey, written);
        } catch (IOException e) {
            throw new DocumentStorageException("cannot write document content to " + root, e);
        }
    }

    @Override
    public Optional<InputStream> open(String storageKey) {
        Optional<Path> source = resolve(storageKey).filter(Files::isRegularFile);
        if (source.isEmpty()) {
            return Optional.empty();
        }
        try {
            return Optional.of(Files.newInputStream(source.get()));
        } catch (IOException e) {
            throw new DocumentStorageException("cannot read document content for key " + storageKey, e);
        }
    }

    @Override
    public boolean delete(String storageKey) {
        Optional<Path> target = resolve(storageKey);
        if (target.isEmpty()) {
            return false;
        }
        try {
            return Files.deleteIfExists(target.get());
        } catch (IOException e) {
            throw new DocumentStorageException("cannot delete document content for key " + storageKey, e);
        }
    }

    /** {@code a1/b2/a1b2c3d4-….pdf} — random, sharded, and never derived from client input. */
    private static String newStorageKey(String originalFilename) {
        String id = UUID.randomUUID().toString();
        String extension = extensionOf(originalFilename);
        return id.substring(0, 2) + "/" + id.substring(2, 4) + "/" + id + extension;
    }

    private static String extensionOf(String originalFilename) {
        if (originalFilename == null) {
            return "";
        }
        int dot = originalFilename.lastIndexOf('.');
        if (dot < 0 || dot == originalFilename.length() - 1) {
            return "";
        }
        String candidate = originalFilename.substring(dot + 1).toLowerCase(Locale.ROOT);
        return candidate.length() <= MAX_EXTENSION_LENGTH && candidate.chars().allMatch(Character::isLetterOrDigit)
                ? "." + candidate
                : "";
    }

    /**
     * Resolves a key inside the root, or empty when it is not a usable path.
     * A key that escapes the root is a probe, not a mistake, so it is refused
     * outright rather than silently treated as missing.
     */
    private Optional<Path> resolve(String storageKey) {
        if (storageKey == null || storageKey.isBlank()) {
            return Optional.empty();
        }
        Path candidate;
        try {
            candidate = root.resolve(storageKey).normalize();
        } catch (InvalidPathException e) {
            // legacy pointers such as "blob://docs/handbook" are not filesystem paths
            return Optional.empty();
        }
        if (!candidate.startsWith(root)) {
            throw new DocumentStorageException("storage key escapes the storage root: " + storageKey);
        }
        return Optional.of(candidate);
    }
}
