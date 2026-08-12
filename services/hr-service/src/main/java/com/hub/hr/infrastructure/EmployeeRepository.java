package com.hub.hr.infrastructure;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.hub.hr.domain.Employee;
import com.hub.hr.domain.EmployeeStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * {@link JpaSpecificationExecutor} backs the paged/filtered/searchable directory
 * and team views through {@link EmployeeSpecifications} — same approach as the
 * Audit Center over {@code AuditLogRepository}.
 */
public interface EmployeeRepository extends JpaRepository<Employee, UUID>, JpaSpecificationExecutor<Employee> {

    Optional<Employee> findByKeycloakId(UUID keycloakId);

    long countByStatus(EmployeeStatus status);

    boolean existsByMatricule(String matricule);

    boolean existsByMatriculeAndIdNot(String matricule, UUID id);

    boolean existsByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCaseAndIdNot(String email, UUID id);

    boolean existsByManagerId(UUID managerId);

    boolean existsByDepartmentId(UUID departmentId);

    boolean existsByPositionId(UUID positionId);

    /** Identity links for the internal users API (E04): provisioned employees only. */
    List<Employee> findAllByKeycloakIdIsNotNullOrderByMatriculeAsc();

    /** Batch identity-link resolution for the people directory (display names for stored UUIDs). */
    List<Employee> findAllByKeycloakIdIn(Collection<UUID> keycloakIds);

    /**
     * Batch resolution by Keycloak username. One query answers both conventions
     * in use: hr-service provisions accounts with the work e-mail as the
     * username, while accounts created outside it (the demo seeder, an LDAP
     * import) carry the short login — the e-mail's local part. Terms must
     * already be lower-cased; equality on the whole address covers the first,
     * equality on the local part covers the second.
     */
    @Query("""
            select e from Employee e
            where lower(e.email) in :terms
               or (locate('@', e.email) > 1
                   and lower(substring(e.email, 1, locate('@', e.email) - 1)) in :terms)
            """)
    List<Employee> findAllByUsername(@Param("terms") Collection<String> terms);
}
