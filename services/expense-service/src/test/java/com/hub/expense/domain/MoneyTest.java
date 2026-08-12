package com.hub.expense.domain;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MoneyTest {

    @Test
    void normalisesScaleAndCurrencyCase() {
        Money money = Money.of(new BigDecimal("10.5"), "eur");
        assertEquals(new BigDecimal("10.50"), money.amount());
        assertEquals("EUR", money.currency());
    }

    @Test
    void comparesAmountsOfSameCurrency() {
        Money threshold = Money.of(new BigDecimal("1000.00"), "EUR");
        assertTrue(Money.of(new BigDecimal("1500.00"), "EUR").isGreaterThan(threshold));
        assertFalse(Money.of(new BigDecimal("1000.00"), "EUR").isGreaterThan(threshold));
    }

    @Test
    void refusesToMixCurrencies() {
        Money euros = Money.of(new BigDecimal("10.00"), "EUR");
        Money dollars = Money.of(new BigDecimal("10.00"), "USD");
        assertThrows(CurrencyMismatchException.class, () -> euros.isGreaterThan(dollars));
    }

    @Test
    void rejectsNegativeAmount() {
        assertThrows(InvalidExpenseException.class, () -> Money.of(new BigDecimal("-1.00"), "EUR"));
    }
}
