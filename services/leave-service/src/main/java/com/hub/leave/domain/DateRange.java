package com.hub.leave.domain;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/**
 * Inclusive calendar period — the value object behind BR-01 (businessDays is
 * the debited amount) and BR-03 (overlaps). Immutable; JPA embeds it into
 * leave_request.
 */
@Embeddable
public class DateRange {

    @Column(name = "start_date", nullable = false)
    private LocalDate start;

    @Column(name = "end_date", nullable = false)
    private LocalDate end;

    protected DateRange() {
        // JPA only
    }

    private DateRange(LocalDate start, LocalDate end) {
        this.start = start;
        this.end = end;
    }

    public static DateRange of(LocalDate start, LocalDate end) {
        Objects.requireNonNull(start, "start");
        Objects.requireNonNull(end, "end");
        if (end.isBefore(start)) {
            throw new InvalidLeavePeriodException("end date " + end + " is before start date " + start);
        }
        return new DateRange(start, end);
    }

    /** Monday–Friday days in the period, inclusive of both bounds. */
    public int businessDays() {
        int days = 0;
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            DayOfWeek dow = d.getDayOfWeek();
            if (dow != DayOfWeek.SATURDAY && dow != DayOfWeek.SUNDAY) {
                days++;
            }
        }
        return days;
    }

    /** Inclusive-bounds intersection test (BR-03). */
    public boolean overlaps(DateRange other) {
        return !start.isAfter(other.end) && !end.isBefore(other.start);
    }

    /** Balances are per calendar year; a request must not span two of them. */
    public boolean spansSingleYear() {
        return start.getYear() == end.getYear();
    }

    public int year() {
        return start.getYear();
    }

    public LocalDate getStart() {
        return start;
    }

    public LocalDate getEnd() {
        return end;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof DateRange other
                && start.equals(other.start) && end.equals(other.end);
    }

    @Override
    public int hashCode() {
        return Objects.hash(start, end);
    }

    @Override
    public String toString() {
        return start + ".." + end;
    }
}
