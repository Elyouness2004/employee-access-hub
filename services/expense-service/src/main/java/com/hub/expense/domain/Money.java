package com.hub.expense.domain;

import java.math.BigDecimal;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/**
 * Amount + ISO-4217 currency value object (@Embeddable). Immutable once built;
 * arithmetic and comparison refuse to mix currencies so a threshold check can
 * never silently compare apples to pears (BR-03).
 */
@Embeddable
public record Money(
        @Column(name = "amount", nullable = false, precision = 12, scale = 2) BigDecimal amount,
        @Column(name = "currency", nullable = false, length = 3) String currency) {

    public Money {
        Objects.requireNonNull(amount, "amount");
        Objects.requireNonNull(currency, "currency");
        if (amount.signum() < 0) {
            throw new InvalidExpenseException("amount must not be negative: " + amount);
        }
        if (currency.length() != 3) {
            throw new InvalidExpenseException("currency must be a 3-letter ISO-4217 code: " + currency);
        }
        amount = amount.setScale(2, java.math.RoundingMode.HALF_UP);
        currency = currency.toUpperCase();
    }

    public static Money of(BigDecimal amount, String currency) {
        return new Money(amount, currency);
    }

    /** True when this amount is strictly greater than {@code other} (BR-03). */
    public boolean isGreaterThan(Money other) {
        requireSameCurrency(other);
        return amount.compareTo(other.amount) > 0;
    }

    public Money add(Money other) {
        requireSameCurrency(other);
        return new Money(amount.add(other.amount), currency);
    }

    private void requireSameCurrency(Money other) {
        if (!currency.equals(other.currency)) {
            throw new CurrencyMismatchException(currency, other.currency);
        }
    }
}
