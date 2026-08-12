package com.hub.hr.application;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.hub.hr.api.dto.EmployeeProfileResponse;
import com.hub.hr.api.dto.EmployeeRequest;
import com.hub.hr.api.dto.EmployeeResponse;
import com.hub.hr.api.dto.HrStatsResponse;
import com.hub.hr.api.dto.InternalEmployeeResponse;
import com.hub.hr.api.dto.PageResponse;
import com.hub.hr.domain.Department;
import com.hub.hr.domain.Employee;
import com.hub.hr.domain.EmployeeStatus;
import com.hub.hr.domain.Position;
import com.hub.hr.infrastructure.DepartmentRepository;
import com.hub.hr.infrastructure.EmployeeRepository;
import com.hub.hr.infrastructure.EmployeeSpecifications;
import com.hub.hr.infrastructure.PositionRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class EmployeeService {

    private final EmployeeRepository employees;
    private final DepartmentRepository departments;
    private final PositionRepository positions;
    private final ApplicationEventPublisher lifecycle;

    public EmployeeService(EmployeeRepository employees,
                           DepartmentRepository departments,
                           PositionRepository positions,
                           ApplicationEventPublisher lifecycle) {
        this.employees = employees;
        this.departments = departments;
        this.positions = positions;
        this.lifecycle = lifecycle;
    }

    /** HR directory: paged, sorted, filtered and searchable over the whole workforce. */
    @Transactional(readOnly = true)
    public PageResponse<EmployeeResponse> page(EmployeeFilter filter, Pageable pageable) {
        return PageResponse.from(employees.findAll(EmployeeSpecifications.matching(filter), pageable),
                EmployeeResponse::from);
    }

    @Transactional(readOnly = true)
    public EmployeeResponse get(UUID id) {
        return EmployeeResponse.from(require(id));
    }

    /**
     * Self-service own profile (P2.4). The record is resolved from the caller's
     * own Keycloak subject, never from a client-supplied id, so an employee can
     * only ever read themselves. A caller whose identity is not linked to an
     * employee record (identity onboarding has not run) gets a 404.
     */
    @Transactional(readOnly = true)
    public EmployeeProfileResponse myProfile(UUID keycloakId) {
        Employee self = requireByKeycloakId(keycloakId);
        return resolve(List.of(self)).get(0);
    }

    /**
     * Manager team view (P2.5): the direct reports of the caller. The manager is
     * resolved from their own token and pinned into the filter (layer 3), so the
     * scope cannot be widened by a request parameter.
     */
    @Transactional(readOnly = true)
    public PageResponse<EmployeeProfileResponse> team(UUID managerKeycloakId, EmployeeFilter filter,
                                                      Pageable pageable) {
        Employee manager = requireByKeycloakId(managerKeycloakId);
        Page<Employee> page = employees.findAll(
                EmployeeSpecifications.matching(filter.forManager(manager.getId())), pageable);
        return PageResponse.of(page, resolve(page.getContent()));
    }

    public EmployeeResponse create(EmployeeRequest request) {
        requireUnique(request, null);
        requireValidReferences(request, null);
        Employee employee = new Employee();
        apply(employee, request);
        Employee saved = employees.save(employee);
        // auto-onboarding (P3.2): a new ACTIVE employee is provisioned into
        // Keycloak once this transaction commits (see EmployeeLifecycleListener)
        if (saved.getStatus() == EmployeeStatus.ACTIVE) {
            lifecycle.publishEvent(new EmployeeProvisioningRequested(saved.getId(), Correlation.currentOrNew()));
        }
        // the new hire's manager may have just acquired their first direct report,
        // which is what MANAGER is derived from (RealmRoleResolver)
        requestRoleSync(saved.getManagerId());
        return EmployeeResponse.from(saved);
    }

    public EmployeeResponse update(UUID id, EmployeeRequest request) {
        Employee employee = require(id);
        requireUnique(request, id);
        requireValidReferences(request, id);
        boolean wasProvisioned = employee.isProvisioned();
        boolean identityFieldsChanged = !request.email().equalsIgnoreCase(employee.getEmail())
                || !request.firstName().equals(employee.getFirstName())
                || !request.lastName().equals(employee.getLastName())
                || request.status() != employee.getStatus();
        UUID previousManagerId = employee.getManagerId();
        apply(employee, request);
        Employee saved = employees.save(employee);
        if (wasProvisioned) {
            // identity synchronization (Part 2): push profile/status to Keycloak
            if (identityFieldsChanged) {
                lifecycle.publishEvent(new EmployeeSyncRequested(id, Correlation.currentOrNew()));
            }
        } else if (saved.getStatus() == EmployeeStatus.ACTIVE) {
            // an inactive employee reactivated (or first activation) → onboard
            lifecycle.publishEvent(new EmployeeProvisioningRequested(id, Correlation.currentOrNew()));
        }
        // A reporting-line move changes the DERIVED role of two OTHER people: the
        // manager who lost this report may no longer be a manager at all, and the
        // one who gained them now is. Nothing else in the system notices that, so
        // without these two syncs a former manager keeps MANAGER — and every
        // approval capability that comes with it — indefinitely.
        if (!Objects.equals(previousManagerId, saved.getManagerId())) {
            requestRoleSync(previousManagerId);
            requestRoleSync(saved.getManagerId());
        }
        return EmployeeResponse.from(saved);
    }

    /**
     * Ask for a manager's derived role to be recomputed after this transaction
     * commits. Silent when there is no manager, or when their identity was never
     * linked — {@link IdentitySyncService} re-checks both anyway.
     */
    private void requestRoleSync(UUID managerId) {
        if (managerId != null) {
            lifecycle.publishEvent(new EmployeeSyncRequested(managerId, Correlation.currentOrNew()));
        }
    }

    public void delete(UUID id) {
        Employee employee = require(id);
        if (employees.existsByManagerId(id)) {
            throw new ResourceInUseException("employee still manages direct reports: " + id);
        }
        UUID managerId = employee.getManagerId();
        employees.delete(employee);
        // deleting somebody's last report demotes that manager
        requestRoleSync(managerId);
    }

    @Transactional(readOnly = true)
    public InternalEmployeeResponse internalGet(UUID id) {
        return toInternal(require(id));
    }

    @Transactional(readOnly = true)
    public InternalEmployeeResponse internalGetByKeycloakId(UUID keycloakId) {
        return toInternal(requireByKeycloakId(keycloakId));
    }

    /** Aggregate HR KPIs for the analytics context (P6.2). */
    @Transactional(readOnly = true)
    public HrStatsResponse stats() {
        long total = employees.count();
        long active = employees.countByStatus(EmployeeStatus.ACTIVE);
        long disabled = employees.countByStatus(EmployeeStatus.DISABLED);
        return new HrStatsResponse(total, active, disabled, departments.count(), positions.count());
    }

    private InternalEmployeeResponse toInternal(Employee employee) {
        Employee manager = employee.getManagerId() == null
                ? null
                : employees.findById(employee.getManagerId()).orElse(null);
        return InternalEmployeeResponse.from(employee, manager);
    }

    private Employee require(UUID id) {
        return employees.findById(id).orElseThrow(() -> new ResourceNotFoundException("employee", id));
    }

    private Employee requireByKeycloakId(UUID keycloakId) {
        return employees.findByKeycloakId(keycloakId)
                .orElseThrow(() -> new ResourceNotFoundException("employee", keycloakId));
    }

    /**
     * Resolves a whole page of employees into self-service profiles with three
     * batch lookups (departments, positions, managers) instead of three per row —
     * the read model the profile and team views need without an N+1.
     */
    private List<EmployeeProfileResponse> resolve(List<Employee> page) {
        Map<UUID, Department> departmentsById = byId(
                departments.findAllById(ids(page, Employee::getDepartmentId)), Department::getId);
        Map<UUID, Position> positionsById = byId(
                positions.findAllById(ids(page, Employee::getPositionId)), Position::getId);
        Map<UUID, Employee> managersById = byId(
                employees.findAllById(ids(page, Employee::getManagerId)), Employee::getId);

        return page.stream()
                .map(employee -> EmployeeProfileResponse.from(employee,
                        departmentsById.get(employee.getDepartmentId()),
                        positionsById.get(employee.getPositionId()),
                        managersById.get(employee.getManagerId())))
                .toList();
    }

    private static Set<UUID> ids(List<Employee> page, Function<Employee, UUID> reference) {
        return page.stream().map(reference).filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private static <T> Map<UUID, T> byId(List<T> loaded, Function<T, UUID> id) {
        return loaded.stream().collect(Collectors.toMap(id, Function.identity()));
    }

    private void requireUnique(EmployeeRequest request, UUID selfId) {
        boolean matriculeTaken = selfId == null
                ? employees.existsByMatricule(request.matricule())
                : employees.existsByMatriculeAndIdNot(request.matricule(), selfId);
        if (matriculeTaken) {
            throw new DuplicateResourceException("matricule already exists: " + request.matricule());
        }
        boolean emailTaken = selfId == null
                ? employees.existsByEmailIgnoreCase(request.email())
                : employees.existsByEmailIgnoreCaseAndIdNot(request.email(), selfId);
        if (emailTaken) {
            throw new DuplicateResourceException("email already exists: " + request.email());
        }
    }

    private void requireValidReferences(EmployeeRequest request, UUID selfId) {
        if (!departments.existsById(request.departmentId())) {
            throw new InvalidReferenceException("department " + request.departmentId() + " does not exist");
        }
        if (!positions.existsById(request.positionId())) {
            throw new InvalidReferenceException("position " + request.positionId() + " does not exist");
        }
        if (request.managerId() != null) {
            if (request.managerId().equals(selfId)) {
                throw new InvalidReferenceException("an employee cannot be their own manager");
            }
            if (!employees.existsById(request.managerId())) {
                throw new InvalidReferenceException("manager " + request.managerId() + " does not exist");
            }
        }
    }

    private void apply(Employee employee, EmployeeRequest request) {
        employee.setMatricule(request.matricule());
        employee.setFirstName(request.firstName());
        employee.setLastName(request.lastName());
        employee.setEmail(request.email());
        employee.setHireDate(request.hireDate());
        employee.setStatus(request.status());
        employee.setManagerId(request.managerId());
        employee.setDepartmentId(request.departmentId());
        employee.setPositionId(request.positionId());
    }
}
