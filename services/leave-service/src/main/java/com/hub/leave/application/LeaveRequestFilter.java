package com.hub.leave.application;

import java.time.LocalDate;

import com.hub.leave.domain.LeaveStatus;
import com.hub.leave.domain.LeaveType;

/**
 * Query criteria shared by the three request lists (own requests, manager inbox,
 * HR escalation queue). Each list pins its own scope — the owner, the addressed
 * manager, the escalation flag — and these criteria only narrow within it, so no
 * filter can ever widen what a caller sees. Blank inputs are normalised to
 * {@code null} (ignored).
 *
 * <p>{@code from}/{@code to} bound the leave period, not the submission date:
 * "who is off in August" is the question a leave list is actually asked.
 */
public record LeaveRequestFilter(
        LeaveStatus status,
        LeaveType type,
        LocalDate from,
        LocalDate to,
        String search) {

    public static LeaveRequestFilter of(LeaveStatus status, LeaveType type,
                                        LocalDate from, LocalDate to, String search) {
        return new LeaveRequestFilter(status, type, from, to, blankToNull(search));
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
