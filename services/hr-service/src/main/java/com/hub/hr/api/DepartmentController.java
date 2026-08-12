package com.hub.hr.api;

import java.net.URI;
import java.util.Set;
import java.util.UUID;

import com.hub.hr.api.dto.DepartmentRequest;
import com.hub.hr.api.dto.DepartmentResponse;
import com.hub.hr.api.dto.PageResponse;
import com.hub.hr.application.DepartmentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
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

/** Org-data management is HR/Admin only — coarse RBAC per E03-S02. */
@RestController
@RequestMapping("/api/hr/departments")
@PreAuthorize("hasAnyRole('HR', 'ADMIN')")
@Tag(name = "Departments")
public class DepartmentController {

    /** Sortable columns; anything else falls back to the default to avoid a 500 on a bad sort. */
    private static final Set<String> SORTABLE = Set.of("name", "createdAt", "updatedAt");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.ASC, "name");
    private static final int MAX_PAGE_SIZE = 200;

    private final DepartmentService departmentService;

    public DepartmentController(DepartmentService departmentService) {
        this.departmentService = departmentService;
    }

    @GetMapping
    @Operation(summary = "List departments (paged, sorted, search on name and description)")
    public PageResponse<DepartmentResponse> list(
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20, sort = "name") Pageable pageable) {
        return departmentService.page(search, Pageables.sanitize(pageable, SORTABLE, DEFAULT_SORT, MAX_PAGE_SIZE));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get a department by id")
    public DepartmentResponse get(@PathVariable UUID id) {
        return departmentService.get(id);
    }

    @PostMapping
    @Operation(summary = "Create a department")
    public ResponseEntity<DepartmentResponse> create(@Valid @RequestBody DepartmentRequest request) {
        DepartmentResponse created = departmentService.create(request);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}").buildAndExpand(created.id()).toUri();
        return ResponseEntity.created(location).body(created);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a department")
    public DepartmentResponse update(@PathVariable UUID id, @Valid @RequestBody DepartmentRequest request) {
        return departmentService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete a department (409 while employees are assigned)")
    public void delete(@PathVariable UUID id) {
        departmentService.delete(id);
    }
}
