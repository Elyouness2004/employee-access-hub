package com.hub.documents.api;

import java.net.URI;
import java.util.Set;
import java.util.UUID;

import com.hub.documents.api.dto.CategoryRequest;
import com.hub.documents.api.dto.CategoryResponse;
import com.hub.documents.api.dto.PageResponse;
import com.hub.documents.application.DocumentCategoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

/**
 * Category management is Admin-only (they define the access tiers); HR may read
 * the list to choose a category when uploading.
 */
@RestController
@RequestMapping("/api/documents/categories")
@Tag(name = "Document categories")
public class DocumentCategoryController {

    /** Sortable columns; anything else falls back to the default to avoid a 500 on a bad sort. */
    private static final Set<String> SORTABLE = Set.of("name", "minRole", "createdAt", "updatedAt");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.ASC, "name");
    private static final int MAX_PAGE_SIZE = 200;

    private final DocumentCategoryService categoryService;

    public DocumentCategoryController(DocumentCategoryService categoryService) {
        this.categoryService = categoryService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('HR', 'ADMIN')")
    @Operation(summary = "List document categories (paged, sorted, search on name and description)")
    public PageResponse<CategoryResponse> list(
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20, sort = "name") Pageable pageable) {
        return categoryService.page(search, Pageables.sanitize(pageable, SORTABLE, DEFAULT_SORT, MAX_PAGE_SIZE));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('HR', 'ADMIN')")
    @Operation(summary = "Get a document category")
    public CategoryResponse get(@PathVariable UUID id) {
        return categoryService.get(id);
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Create a document category (409 on duplicate name)")
    public ResponseEntity<CategoryResponse> create(@AuthenticationPrincipal Jwt jwt, Authentication authentication,
                                                   @Valid @RequestBody CategoryRequest request) {
        CategoryResponse created = categoryService.create(Actors.from(jwt, authentication), request);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}").buildAndExpand(created.id()).toUri();
        return ResponseEntity.created(location).body(created);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Update a document category")
    public CategoryResponse update(@AuthenticationPrincipal Jwt jwt, Authentication authentication,
                                   @PathVariable UUID id, @Valid @RequestBody CategoryRequest request) {
        return categoryService.update(Actors.from(jwt, authentication), id, request);
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a category (409 while it still has documents)")
    public void delete(@AuthenticationPrincipal Jwt jwt, Authentication authentication, @PathVariable UUID id) {
        categoryService.delete(Actors.from(jwt, authentication), id);
    }
}
