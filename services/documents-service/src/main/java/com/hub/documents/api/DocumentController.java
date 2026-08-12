package com.hub.documents.api;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.URI;
import java.util.Set;
import java.util.UUID;

import com.hub.documents.api.dto.DocumentDownloadResponse;
import com.hub.documents.api.dto.DocumentMetadataRequest;
import com.hub.documents.api.dto.DocumentResponse;
import com.hub.documents.api.dto.PageResponse;
import com.hub.documents.api.dto.UploadDocumentRequest;
import com.hub.documents.application.DocumentContent;
import com.hub.documents.application.DocumentFilter;
import com.hub.documents.application.DocumentService;
import com.hub.documents.application.UploadedFile;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.core.io.InputStreamResource;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * Coarse RBAC here (@PreAuthorize, layer 2); the FR-41 per-document access rule
 * (category role gate AND ownership) is layer 3 inside the application service.
 *
 * <p>Documents have two faces, and both are served here. {@code POST} accepts
 * either a multipart upload (the file plus a JSON {@code metadata} part — the
 * service stores the bytes) or the pre-existing JSON body registering metadata
 * for a blob written elsewhere; symmetrically {@code /{id}/content} streams the
 * bytes while {@code /{id}/download} returns the storage reference. Both
 * download routes are audited identically (FR-41).
 */
@RestController
@RequestMapping("/api/documents")
@Tag(name = "Documents")
public class DocumentController {

    /** Sortable columns; anything else falls back to the default to avoid a 500 on a bad sort. */
    private static final Set<String> SORTABLE = Set.of("title", "createdAt", "updatedAt", "sizeBytes");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.DESC, "createdAt");
    private static final int MAX_PAGE_SIZE = 200;

    private final DocumentService documentService;

    public DocumentController(DocumentService documentService) {
        this.documentService = documentService;
    }

    // ---- Employee -------------------------------------------------------

    @GetMapping
    @PreAuthorize("hasRole('EMPLOYEE')")
    @Operation(summary = "List the documents the caller is allowed to access "
            + "(paged, sorted, filtered, search on title, description and filename)")
    public PageResponse<DocumentResponse> list(
            @AuthenticationPrincipal Jwt jwt, Authentication authentication,
            @RequestParam(required = false) UUID categoryId,
            @RequestParam(required = false) UUID ownerKeycloakId,
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return documentService.page(Actors.from(jwt, authentication),
                DocumentFilter.of(categoryId, ownerKeycloakId, search),
                Pageables.sanitize(pageable, SORTABLE, DEFAULT_SORT, MAX_PAGE_SIZE));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('EMPLOYEE')")
    @Operation(summary = "Document metadata — subject to the FR-41 access rule")
    public DocumentResponse get(@AuthenticationPrincipal Jwt jwt, Authentication authentication,
                                @PathVariable UUID id) {
        return documentService.get(Actors.from(jwt, authentication), id);
    }

    @GetMapping("/{id}/download")
    @PreAuthorize("hasRole('EMPLOYEE')")
    @Operation(summary = "Resolve a download reference — access-checked and audit-logged (FR-41)")
    public DocumentDownloadResponse download(@AuthenticationPrincipal Jwt jwt, Authentication authentication,
                                             @PathVariable UUID id) {
        return documentService.download(Actors.from(jwt, authentication), id);
    }

    @GetMapping("/{id}/content")
    @PreAuthorize("hasRole('EMPLOYEE')")
    @Operation(summary = "Download the file itself — access-checked and audit-logged (FR-41); "
            + "404 when the record has no stored bytes")
    public ResponseEntity<InputStreamResource> content(@AuthenticationPrincipal Jwt jwt,
                                                       Authentication authentication,
                                                       @PathVariable UUID id) {
        DocumentContent content = documentService.content(Actors.from(jwt, authentication), id);
        ResponseEntity.BodyBuilder response = ResponseEntity.ok()
                // always an attachment, never inline, and never content-sniffed:
                // a file that lies about its type still cannot execute in the
                // browser's context
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(content.filename()).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .contentType(content.contentType() == null
                        ? MediaType.APPLICATION_OCTET_STREAM
                        : MediaType.parseMediaType(content.contentType()));
        if (content.sizeBytes() != null) {
            response.contentLength(content.sizeBytes());
        }
        return response.body(new InputStreamResource(content.stream()));
    }

    // ---- HR -------------------------------------------------------------

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyRole('HR', 'ADMIN')")
    @Operation(summary = "Upload a file with its metadata (413 above the size limit, "
            + "415 for a MIME type outside the allowlist, 422 on unknown category)")
    public ResponseEntity<DocumentResponse> upload(@AuthenticationPrincipal Jwt jwt, Authentication authentication,
                                                    @RequestPart("file") MultipartFile file,
                                                    @RequestPart("metadata")
                                                    @Valid DocumentMetadataRequest metadata) {
        DocumentResponse created = documentService.upload(Actors.from(jwt, authentication), metadata, adapt(file));
        return ResponseEntity.created(location(created)).body(created);
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasAnyRole('HR', 'ADMIN')")
    @Operation(summary = "Register metadata for a blob stored elsewhere (422 on unknown category)")
    public ResponseEntity<DocumentResponse> uploadMetadata(@AuthenticationPrincipal Jwt jwt,
                                                            Authentication authentication,
                                                            @Valid @RequestBody UploadDocumentRequest request) {
        DocumentResponse created = documentService.upload(Actors.from(jwt, authentication), request);
        return ResponseEntity.created(location(created)).body(created);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('HR', 'ADMIN')")
    @Operation(summary = "Update document metadata and its storage reference")
    public DocumentResponse update(@AuthenticationPrincipal Jwt jwt, Authentication authentication,
                                   @PathVariable UUID id, @Valid @RequestBody UploadDocumentRequest request) {
        return documentService.update(Actors.from(jwt, authentication), id, request);
    }

    @PutMapping("/{id}/metadata")
    @PreAuthorize("hasAnyRole('HR', 'ADMIN')")
    @Operation(summary = "Update document metadata only — the stored file is left untouched")
    public DocumentResponse updateMetadata(@AuthenticationPrincipal Jwt jwt, Authentication authentication,
                                           @PathVariable UUID id,
                                           @Valid @RequestBody DocumentMetadataRequest request) {
        return documentService.updateMetadata(Actors.from(jwt, authentication), id, request);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('HR', 'ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a document and the file it points at")
    public void delete(@AuthenticationPrincipal Jwt jwt, Authentication authentication, @PathVariable UUID id) {
        documentService.delete(Actors.from(jwt, authentication), id);
    }

    /** Adapts Spring's multipart type at the boundary so the use case never sees it. */
    private static UploadedFile adapt(MultipartFile file) {
        try {
            InputStream content = file.getInputStream();
            return new UploadedFile(file.getOriginalFilename(), file.getContentType(), file.getSize(), content);
        } catch (IOException e) {
            throw new UncheckedIOException("cannot read the uploaded file", e);
        }
    }

    private static URI location(DocumentResponse created) {
        return ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}").buildAndExpand(created.id()).toUri();
    }
}
