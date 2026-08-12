package com.hub.hr.application;

import java.util.UUID;

import com.hub.hr.api.dto.DepartmentRequest;
import com.hub.hr.api.dto.DepartmentResponse;
import com.hub.hr.api.dto.PageResponse;
import com.hub.hr.domain.Department;
import com.hub.hr.infrastructure.DepartmentRepository;
import com.hub.hr.infrastructure.EmployeeRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class DepartmentService {

    private final DepartmentRepository departments;
    private final EmployeeRepository employees;

    public DepartmentService(DepartmentRepository departments, EmployeeRepository employees) {
        this.departments = departments;
        this.employees = employees;
    }

    /** Catalogue page; {@code search} matches the name or the description (blank = no filter). */
    @Transactional(readOnly = true)
    public PageResponse<DepartmentResponse> page(String search, Pageable pageable) {
        String term = Filters.blankToNull(search);
        Page<Department> page = term == null
                ? departments.findAll(pageable)
                : departments.findAllByNameContainingIgnoreCaseOrDescriptionContainingIgnoreCase(
                        term, term, pageable);
        return PageResponse.from(page, DepartmentResponse::from);
    }

    @Transactional(readOnly = true)
    public DepartmentResponse get(UUID id) {
        return DepartmentResponse.from(require(id));
    }

    public DepartmentResponse create(DepartmentRequest request) {
        if (departments.existsByNameIgnoreCase(request.name())) {
            throw new DuplicateResourceException("department name already exists: " + request.name());
        }
        Department department = new Department();
        apply(department, request);
        return DepartmentResponse.from(departments.save(department));
    }

    public DepartmentResponse update(UUID id, DepartmentRequest request) {
        Department department = require(id);
        if (departments.existsByNameIgnoreCaseAndIdNot(request.name(), id)) {
            throw new DuplicateResourceException("department name already exists: " + request.name());
        }
        apply(department, request);
        return DepartmentResponse.from(departments.save(department));
    }

    public void delete(UUID id) {
        Department department = require(id);
        if (employees.existsByDepartmentId(id)) {
            throw new ResourceInUseException("department still has employees assigned: " + id);
        }
        departments.delete(department);
    }

    private Department require(UUID id) {
        return departments.findById(id).orElseThrow(() -> new ResourceNotFoundException("department", id));
    }

    private void apply(Department department, DepartmentRequest request) {
        department.setName(request.name());
        department.setDescription(request.description());
    }
}
