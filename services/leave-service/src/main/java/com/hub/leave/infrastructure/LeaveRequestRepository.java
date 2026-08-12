package com.hub.leave.infrastructure;

import java.util.List;
import java.util.UUID;

import com.hub.leave.domain.LeaveRequest;
import com.hub.leave.domain.LeaveStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

/**
 * {@link JpaSpecificationExecutor} backs the paged/filtered/searchable lists
 * through {@link LeaveRequestSpecifications}; the derived queries below serve
 * the fixed-scope reads (BR-03 overlap check, BR-05 offboarding) that need the
 * whole set rather than a page.
 */
public interface LeaveRequestRepository
        extends JpaRepository<LeaveRequest, UUID>, JpaSpecificationExecutor<LeaveRequest> {

    List<LeaveRequest> findAllByEmployeeKeycloakIdAndStatus(UUID employeeKeycloakId, LeaveStatus status);

    long countByStatus(LeaveStatus status);
}
