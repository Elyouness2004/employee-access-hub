package com.hub.documents.application;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.unit.DataSize;

/**
 * What this deployment accepts as an uploaded document: a size ceiling and a
 * MIME allowlist, both configurable under {@code hub.documents.storage}. Kept
 * out of {@link DocumentService} so the use case stays about documents and the
 * policy can be asserted on its own.
 *
 * <p>The declared content type is client input and is only trusted as far as
 * the allowlist: content is always served back as an attachment with
 * {@code nosniff}, so a file that lies about its type still cannot be rendered
 * in the browser's context.
 */
@Component
public class DocumentUploadPolicy {

    private static final String DEFAULT_ALLOWED_TYPES =
            "application/pdf,image/png,image/jpeg,image/gif,text/plain,text/csv,"
                    + "application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,"
                    + "application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    private final DataSize maxFileSize;
    private final Set<String> allowedContentTypes;

    public DocumentUploadPolicy(
            @Value("${hub.documents.storage.max-file-size:10MB}") DataSize maxFileSize,
            @Value("${hub.documents.storage.allowed-content-types:" + DEFAULT_ALLOWED_TYPES + "}")
            List<String> allowedContentTypes) {
        this.maxFileSize = maxFileSize;
        this.allowedContentTypes = allowedContentTypes.stream()
                .map(DocumentUploadPolicy::normalise)
                .filter(type -> !type.isEmpty())
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    /**
     * Checks an upload before a single byte is stored.
     *
     * @return the normalised content type to record on the document
     * @throws EmptyUploadException          when there is nothing to store
     * @throws DocumentTooLargeException     when the file exceeds the ceiling (413)
     * @throws UnsupportedDocumentTypeException when the type is not allowlisted (415)
     */
    public String validate(String contentType, long sizeBytes) {
        if (sizeBytes <= 0) {
            throw new EmptyUploadException("the uploaded file is empty");
        }
        if (sizeBytes > maxFileSize.toBytes()) {
            throw new DocumentTooLargeException(sizeBytes, maxFileSize.toBytes());
        }
        String normalised = normalise(contentType);
        if (!allowedContentTypes.contains(normalised)) {
            throw new UnsupportedDocumentTypeException(contentType, allowedContentTypes);
        }
        return normalised;
    }

    public long maxFileSizeBytes() {
        return maxFileSize.toBytes();
    }

    public Set<String> allowedContentTypes() {
        return Set.copyOf(allowedContentTypes);
    }

    /** Lower-cased media type without parameters, e.g. {@code text/csv; charset=utf-8} → {@code text/csv}. */
    private static String normalise(String contentType) {
        if (contentType == null) {
            return "";
        }
        int parameters = contentType.indexOf(';');
        String type = parameters < 0 ? contentType : contentType.substring(0, parameters);
        return type.trim().toLowerCase(Locale.ROOT);
    }
}
