package com.hub.documents.domain.storage;

/**
 * The outcome of a successful {@link DocumentStorage#store} call: the generated
 * pointer to keep on the aggregate, and the byte count the store actually
 * wrote — which is what the metadata records, never a client-declared size.
 */
public record StoredBlob(String storageKey, long sizeBytes) {
}
