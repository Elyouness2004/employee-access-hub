package com.hub.leave.application;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.hub.leave.api.dto.LeaveRequestResponse;
import com.hub.leave.api.dto.LeaveStatsResponse;
import com.hub.leave.api.dto.OffboardingResult;
import com.hub.leave.api.dto.PageResponse;
import com.hub.leave.api.dto.SubmitLeaveRequest;
import com.hub.leave.domain.DateRange;
import com.hub.leave.domain.EmployeeDirectory;
import com.hub.leave.domain.EmployeeSnapshot;
import com.hub.leave.domain.InsufficientBalanceException;
import com.hub.leave.domain.LeaveBalance;
import com.hub.leave.domain.LeaveRequest;
import com.hub.leave.domain.LeaveStatus;
import com.hub.leave.domain.OverlappingApprovedLeaveException;
import com.hub.leave.infrastructure.LeaveRequestRepository;
import com.hub.leave.infrastructure.LeaveRequestSpecifications;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Leave lifecycle use cases. Layer-3 authorization (ownership rules RBAC
 * cannot express, §2.7) is enforced here with AccessDeniedException → 403;
 * the BR-xx invariants themselves live in the domain.
 */
@Service
@Transactional
public class LeaveRequestService {

    private final LeaveRequestRepository requests;
    private final LeaveBalanceService balanceService;
    private final EmployeeDirectory directory;
    private final AuditTrail audit;

    public LeaveRequestService(LeaveRequestRepository requests,
                               LeaveBalanceService balanceService,
                               EmployeeDirectory directory,
                               AuditTrail audit) {
        this.requests = requests;
        this.balanceService = balanceService;
        this.directory = directory;
        this.audit = audit;
    }

    /** FR-20: BR-01 (balance) and BR-03 (overlap) checked before SUBMITTED. */
    public LeaveRequestResponse submit(Actor actor, SubmitLeaveRequest dto) {
        EmployeeSnapshot employee = directory.findByKeycloakId(actor.keycloakId())
                .orElseThrow(() -> new EmployeeNotEligibleException(
                        "no employee record is linked to identity " + actor.keycloakId()
                                + "; identity onboarding must run first"));
        if (!employee.active()) {
            throw new EmployeeNotEligibleException("employee is not active");
        }

        DateRange period = DateRange.of(dto.startDate(), dto.endDate());
        LeaveRequest request = LeaveRequest.submit(employee.id(), actor.keycloakId(),
                employee.managerKeycloakId(), dto.type(), period, dto.reason());

        if (dto.type().isBalanceTracked()) {
            LeaveBalance balance = balanceService.getOrProvision(employee, period.year());
            if (request.getBusinessDays() > balance.availableDays()) {
                throw new InsufficientBalanceException(request.getBusinessDays(), balance.availableDays());
            }
        }
        requireNoApprovedOverlap(actor.keycloakId(), period, null);

        requests.save(request);
        audit.record(actor.username(), "LEAVE_REQUEST_SUBMITTED", "leave_request:" + request.getId(),
                "type=" + dto.type() + " period=" + period
                        + " businessDays=" + request.getBusinessDays()
                        + (request.isHrEscalated() ? " escalated=HR" : ""));
        return LeaveRequestResponse.from(request);
    }

    /**
     * FR-21/22: direct manager (or HR for escalated requests) approves; BR-03
     * is re-checked at decision time and the balance debit is atomic with the
     * status change — same transaction, row-locked balance.
     */
    public LeaveRequestResponse approve(Actor actor, UUID id, String comment) {
        LeaveRequest request = require(id);
        authorizeDecision(actor, request);
        requireNoApprovedOverlap(request.getEmployeeKeycloakId(), request.getPeriod(), request.getId());

        request.approve(actor.keycloakId(), comment);
        if (request.getType().isBalanceTracked()) {
            LeaveBalance balance = balanceService.getOrProvisionLocked(
                    request.getEmployeeId(), request.getEmployeeKeycloakId(), request.getPeriod().year());
            balance.debit(request.getBusinessDays());
        }
        audit.record(actor.username(), "LEAVE_REQUEST_APPROVED", "leave_request:" + request.getId(),
                "businessDays=" + request.getBusinessDays());
        return LeaveRequestResponse.from(request);
    }

    public LeaveRequestResponse reject(Actor actor, UUID id, String comment) {
        LeaveRequest request = require(id);
        authorizeDecision(actor, request);
        request.reject(actor.keycloakId(), comment);
        audit.record(actor.username(), "LEAVE_REQUEST_REJECTED", "leave_request:" + request.getId(), null);
        return LeaveRequestResponse.from(request);
    }

    /** Owner-only, before any decision (D19). */
    public LeaveRequestResponse cancel(Actor actor, UUID id) {
        LeaveRequest request = require(id);
        if (!request.getEmployeeKeycloakId().equals(actor.keycloakId())) {
            throw new AccessDeniedException("only the owner may cancel a leave request");
        }
        request.cancel();
        audit.record(actor.username(), "LEAVE_REQUEST_CANCELLED", "leave_request:" + request.getId(), null);
        return LeaveRequestResponse.from(request);
    }

    @Transactional(readOnly = true)
    public LeaveRequestResponse get(Actor actor, UUID id) {
        LeaveRequest request = require(id);
        boolean owner = request.getEmployeeKeycloakId().equals(actor.keycloakId());
        boolean addressedManager = actor.keycloakId().equals(request.getManagerKeycloakId());
        if (!owner && !addressedManager && !actor.hrOrAdmin()) {
            throw new AccessDeniedException("not allowed to view this leave request");
        }
        return LeaveRequestResponse.from(request);
    }

    @Transactional(readOnly = true)
    public PageResponse<LeaveRequestResponse> myRequests(Actor actor, LeaveRequestFilter filter, Pageable pageable) {
        return page(LeaveRequestSpecifications.ownedBy(actor.keycloakId()), filter, pageable);
    }

    /** Manager approval inbox: pending requests addressed to the caller. */
    @Transactional(readOnly = true)
    public PageResponse<LeaveRequestResponse> inbox(Actor actor, LeaveRequestFilter filter, Pageable pageable) {
        return page(LeaveRequestSpecifications.addressedTo(actor.keycloakId()), filter, pageable);
    }

    /** HR inbox for BR-02 escalations. */
    @Transactional(readOnly = true)
    public PageResponse<LeaveRequestResponse> escalated(LeaveRequestFilter filter, Pageable pageable) {
        return page(LeaveRequestSpecifications.escalated(), filter, pageable);
    }

    /** One scope (layer 3) AND the caller's filters, paged by the database. */
    private PageResponse<LeaveRequestResponse> page(Specification<LeaveRequest> scope,
                                                    LeaveRequestFilter filter, Pageable pageable) {
        return PageResponse.from(
                requests.findAll(scope.and(LeaveRequestSpecifications.matching(filter)), pageable),
                LeaveRequestResponse::from);
    }

    /**
     * BR-05 consumer: offboarding cancels pending requests outright and
     * not-yet-started approved leave with a balance re-credit; approved leave
     * already taken stays on record.
     */
    public OffboardingResult offboard(Actor actor, UUID employeeKeycloakId) {
        List<LeaveRequest> toCancel = new ArrayList<>(
                requests.findAllByEmployeeKeycloakIdAndStatus(employeeKeycloakId, LeaveStatus.SUBMITTED));
        LocalDate today = LocalDate.now();
        requests.findAllByEmployeeKeycloakIdAndStatus(employeeKeycloakId, LeaveStatus.APPROVED).stream()
                .filter(request -> !request.getPeriod().getStart().isBefore(today))
                .forEach(toCancel::add);

        int recreditedDays = 0;
        for (LeaveRequest request : toCancel) {
            boolean recredit = request.cancelForOffboarding();
            if (recredit) {
                int year = request.getPeriod().year();
                balanceService.findLocked(employeeKeycloakId, year)
                        .ifPresent(balance -> balance.credit(request.getBusinessDays()));
                recreditedDays += request.getBusinessDays();
            }
        }
        audit.record(actor.username(), "LEAVE_OFFBOARDING_CANCELLATION", "employee:" + employeeKeycloakId,
                "cancelledRequests=" + toCancel.size() + " recreditedDays=" + recreditedDays);
        return new OffboardingResult(toCancel.size(), recreditedDays);
    }

    /** Aggregate leave KPIs for the analytics context (P6.2). */
    @Transactional(readOnly = true)
    public LeaveStatsResponse stats() {
        long submitted = requests.countByStatus(LeaveStatus.SUBMITTED);
        long approved = requests.countByStatus(LeaveStatus.APPROVED);
        long rejected = requests.countByStatus(LeaveStatus.REJECTED);
        long cancelled = requests.countByStatus(LeaveStatus.CANCELLED);
        return new LeaveStatsResponse(submitted, approved, rejected, cancelled,
                submitted + approved + rejected + cancelled);
    }

    private LeaveRequest require(UUID id) {
        return requests.findById(id).orElseThrow(() -> new ResourceNotFoundException("leave request", id));
    }

    /** Fine-grained decision authorization: `managerKeycloakId == jwt.sub`, or HR when escalated. */
    private void authorizeDecision(Actor actor, LeaveRequest request) {
        if (request.isHrEscalated()) {
            if (!actor.hrOrAdmin()) {
                throw new AccessDeniedException("this request is escalated to HR");
            }
        } else if (!actor.keycloakId().equals(request.getManagerKeycloakId())) {
            throw new AccessDeniedException("only the direct manager may decide this request");
        }
    }

    /** BR-03 against the approved set, at submit AND at approval time. */
    private void requireNoApprovedOverlap(UUID employeeKeycloakId, DateRange period, UUID excludedId) {
        requests.findAllByEmployeeKeycloakIdAndStatus(employeeKeycloakId, LeaveStatus.APPROVED).stream()
                .filter(approved -> !approved.getId().equals(excludedId))
                .filter(approved -> approved.getPeriod().overlaps(period))
                .findFirst()
                .ifPresent(approved -> {
                    throw new OverlappingApprovedLeaveException(period, approved.getPeriod());
                });
    }
}
