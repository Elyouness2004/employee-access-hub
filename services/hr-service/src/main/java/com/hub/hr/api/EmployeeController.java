package com.hub.hr.api;

import java.net.URI;
import java.util.Set;
import java.util.UUID;

import com.hub.hr.api.dto.EmployeeRequest;
import com.hub.hr.api.dto.EmployeeResponse;
import com.hub.hr.api.dto.PageResponse;
import com.hub.hr.application.EmployeeFilter;
import com.hub.hr.application.EmployeeService;
import com.hub.hr.domain.EmployeeStatus;
import com.hub.hr.domain.ProvisioningStatus;
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

/**
 * Org-data management is HR/Admin only — coarse RBAC per E03-S02. Employees read
 * their own record through {@link MeController} instead; a manager reads their
 * direct reports there too.
 */
@RestController
@RequestMapping("/api/hr/employees")
@PreAuthorize("hasAnyRole('HR', 'ADMIN')")
@Tag(name = "Employees")
public class EmployeeController {

    /** Sortable columns; anything else falls back to the default to avoid a 500 on a bad sort. */
    private static final Set<String> SORTABLE =
            Set.of("matricule", "firstName", "lastName", "email", "hireDate", "status",
                    "provisioningStatus", "createdAt", "updatedAt");
    private static final Sort DEFAULT_SORT = Sort.by(Sort.Direction.ASC, "matricule");
    private static final int MAX_PAGE_SIZE = 200;

    private final EmployeeService employeeService;

    public EmployeeController(EmployeeService employeeService) {
        this.employeeService = employeeService;
    }

    @GetMapping
    @Operation(summary = "List employees (paged, sorted, filtered, full-text search on "
            + "matricule, name and email)")
    public PageResponse<EmployeeResponse> list(
            @RequestParam(required = false) EmployeeStatus status,
            @RequestParam(required = false) ProvisioningStatus provisioningStatus,
            @RequestParam(required = false) UUID departmentId,
            @RequestParam(required = false) UUID positionId,
            @RequestParam(required = false) UUID managerId,
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20, sort = "matricule") Pageable pageable) {
        return employeeService.page(
                EmployeeFilter.of(status, provisioningStatus, departmentId, positionId, managerId, search),
                Pageables.sanitize(pageable, SORTABLE, DEFAULT_SORT, MAX_PAGE_SIZE));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get an employee by id")
    public EmployeeResponse get(@PathVariable UUID id) {
        return employeeService.get(id);
    }

    @PostMapping
    @Operation(summary = "Create an employee (422 on unknown department/position/manager)")
    public ResponseEntity<EmployeeResponse> create(@Valid @RequestBody EmployeeRequest request) {
        EmployeeResponse created = employeeService.create(request);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}").buildAndExpand(created.id()).toUri();
        return ResponseEntity.created(location).body(created);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update an employee")
    public EmployeeResponse update(@PathVariable UUID id, @Valid @RequestBody EmployeeRequest request) {
        return employeeService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete an employee (409 while they manage direct reports)")
    public void delete(@PathVariable UUID id) {
        employeeService.delete(id);
    }
}
