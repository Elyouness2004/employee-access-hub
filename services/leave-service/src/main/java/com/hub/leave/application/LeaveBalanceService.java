package com.hub.leave.application;

import java.util.UUID;

import com.hub.leave.api.dto.BalanceAdjustmentRequest;
import com.hub.leave.api.dto.LeaveBalanceResponse;
import com.hub.leave.domain.EmployeeDirectory;
import com.hub.leave.domain.EmployeeSnapshot;
import com.hub.leave.domain.LeaveBalance;
import com.hub.leave.infrastructure.LeaveBalanceRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class LeaveBalanceService {

    private final LeaveBalanceRepository balances;
    private final EmployeeDirectory directory;
    private final AuditTrail audit;
    private final int defaultAnnualDays;

    public LeaveBalanceService(LeaveBalanceRepository balances,
                               EmployeeDirectory directory,
                               AuditTrail audit,
                               @Value("${hub.leave.default-annual-days}") int defaultAnnualDays) {
        this.balances = balances;
        this.directory = directory;
        this.audit = audit;
        this.defaultAnnualDays = defaultAnnualDays;
    }

    /** Lazily provisions the configured default allocation on first use. */
    LeaveBalance getOrProvision(EmployeeSnapshot employee, int year) {
        return balances.findByEmployeeKeycloakIdAndYear(employee.keycloakId(), year)
                .orElseGet(() -> balances.save(
                        LeaveBalance.provision(employee.id(), employee.keycloakId(), year, defaultAnnualDays)));
    }

    /** Locked variant for the atomic approve-and-debit path. */
    LeaveBalance getOrProvisionLocked(UUID employeeId, UUID employeeKeycloakId, int year) {
        return balances.findWithLockByEmployeeKeycloakIdAndYear(employeeKeycloakId, year)
                .orElseGet(() -> balances.save(
                        LeaveBalance.provision(employeeId, employeeKeycloakId, year, defaultAnnualDays)));
    }

    /** Locked lookup for offboarding re-credit; absent when never provisioned. */
    java.util.Optional<LeaveBalance> findLocked(UUID employeeKeycloakId, int year) {
        return balances.findWithLockByEmployeeKeycloakIdAndYear(employeeKeycloakId, year);
    }

    public LeaveBalanceResponse myBalance(Actor actor, int year) {
        EmployeeSnapshot employee = directory.findByKeycloakId(actor.keycloakId())
                .orElseThrow(() -> new EmployeeNotEligibleException(
                        "no employee record is linked to identity " + actor.keycloakId()
                                + "; identity onboarding must run first"));
        return LeaveBalanceResponse.from(getOrProvision(employee, year));
    }

    public LeaveBalanceResponse byEmployeeId(UUID employeeId, int year) {
        return LeaveBalanceResponse.from(requireByEmployeeId(employeeId, year));
    }

    public LeaveBalanceResponse adjust(Actor actor, UUID employeeId, int year, BalanceAdjustmentRequest request) {
        LeaveBalance balance = requireByEmployeeId(employeeId, year);
        int before = balance.getTotalDays();
        balance.adjustTotal(request.totalDays());
        audit.record(actor.username(), "LEAVE_BALANCE_ADJUSTED", "leave_balance:" + balance.getId(),
                "employee=" + employeeId + " year=" + year
                        + " totalDays " + before + " -> " + request.totalDays()
                        + (request.reason() == null ? "" : " reason=" + request.reason()));
        return LeaveBalanceResponse.from(balance);
    }

    private LeaveBalance requireByEmployeeId(UUID employeeId, int year) {
        return balances.findByEmployeeIdAndYear(employeeId, year)
                .orElseGet(() -> {
                    EmployeeSnapshot employee = directory.findById(employeeId)
                            .orElseThrow(() -> new ResourceNotFoundException("employee", employeeId));
                    if (employee.keycloakId() == null) {
                        throw new EmployeeNotEligibleException("employee " + employeeId
                                + " has no identity link yet; identity onboarding must run first");
                    }
                    return getOrProvision(employee, year);
                });
    }
}
