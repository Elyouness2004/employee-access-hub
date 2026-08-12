package com.hub.leave.domain;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * DateRange is the arithmetic behind BR-01 (businessDays = the debit amount)
 * and BR-03 (overlaps). 2026-07-20 is a Monday.
 */
class DateRangeTest {

    private static final LocalDate MON = LocalDate.of(2026, 7, 20);
    private static final LocalDate FRI = LocalDate.of(2026, 7, 24);
    private static final LocalDate SAT = LocalDate.of(2026, 7, 25);
    private static final LocalDate SUN = LocalDate.of(2026, 7, 26);

    @Test
    void endBeforeStartIsRejected() {
        assertThatThrownBy(() -> DateRange.of(FRI, MON))
                .isInstanceOf(InvalidLeavePeriodException.class);
    }

    @ParameterizedTest(name = "{0}..{1} -> {2} business days")
    @CsvSource({
        "2026-07-20, 2026-07-24, 5",   // full working week
        "2026-07-22, 2026-07-22, 1",   // single Wednesday
        "2026-07-25, 2026-07-26, 0",   // weekend only
        "2026-07-23, 2026-07-28, 4",   // Thu..Tue spanning a weekend
        "2026-07-20, 2026-07-31, 10",  // two full weeks
        "2026-07-18, 2026-07-26, 5"    // Sat..Sun bracketing one working week
    })
    void businessDaysExcludeWeekends(LocalDate start, LocalDate end, int expected) {
        assertThat(DateRange.of(start, end).businessDays()).isEqualTo(expected);
    }

    @Test
    void overlapsMatrix() {
        DateRange week = DateRange.of(MON, FRI);

        assertThat(week.overlaps(DateRange.of(MON, FRI))).isTrue();                       // identical
        assertThat(week.overlaps(DateRange.of(MON.plusDays(1), FRI.minusDays(1)))).isTrue(); // contained
        assertThat(week.overlaps(DateRange.of(FRI, SUN))).isTrue();                       // touches last day
        assertThat(week.overlaps(DateRange.of(MON.minusDays(3), MON))).isTrue();          // touches first day
        assertThat(week.overlaps(DateRange.of(SAT, SUN))).isFalse();                      // adjacent after
        assertThat(week.overlaps(DateRange.of(MON.minusDays(2), MON.minusDays(1)))).isFalse(); // adjacent before
    }

    @Test
    void singleYearSpanIsDetected() {
        assertThat(DateRange.of(MON, FRI).spansSingleYear()).isTrue();
        assertThat(DateRange.of(LocalDate.of(2026, 12, 28), LocalDate.of(2027, 1, 2)).spansSingleYear()).isFalse();
        assertThat(DateRange.of(MON, FRI).year()).isEqualTo(2026);
    }
}
