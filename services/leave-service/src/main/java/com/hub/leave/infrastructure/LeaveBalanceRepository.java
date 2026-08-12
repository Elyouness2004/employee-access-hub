package com.hub.leave.infrastructure;

import java.util.Optional;
import java.util.UUID;

import com.hub.leave.domain.LeaveBalance;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

public interface LeaveBalanceRepository extends JpaRepository<LeaveBalance, UUID> {

    Optional<LeaveBalance> findByEmployeeKeycloakIdAndYear(UUID employeeKeycloakId, int year);

    /**
     * Row lock for the atomic approve-and-debit path (FR-22): two concurrent
     * approvals serialize here, so BR-01 cannot be raced past.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<LeaveBalance> findWithLockByEmployeeKeycloakIdAndYear(UUID employeeKeycloakId, int year);

    Optional<LeaveBalance> findByEmployeeIdAndYear(UUID employeeId, int year);
}
