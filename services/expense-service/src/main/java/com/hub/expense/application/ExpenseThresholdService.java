package com.hub.expense.application;

import java.math.BigDecimal;

import com.hub.expense.api.dto.ThresholdRequest;
import com.hub.expense.api.dto.ThresholdResponse;
import com.hub.expense.domain.ApprovalThreshold;
import com.hub.expense.domain.Money;
import com.hub.expense.infrastructure.ApprovalThresholdRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reads and updates the single BR-03 second-level approval threshold. The row is
 * seeded by Flyway, so this service only ever reads or mutates it — the settings
 * currency is the single source of truth for the deployment currency.
 */
@Service
@Transactional
public class ExpenseThresholdService {

    private final ApprovalThresholdRepository thresholds;
    private final AuditTrail audit;

    public ExpenseThresholdService(ApprovalThresholdRepository thresholds, AuditTrail audit) {
        this.thresholds = thresholds;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public Money currentThreshold() {
        return require().getThreshold();
    }

    @Transactional(readOnly = true)
    public ThresholdResponse get() {
        return ThresholdResponse.from(require());
    }

    /** HR/Admin adjustment (BR-03), audited. Currency defaults to the settings currency. */
    public ThresholdResponse update(Actor actor, ThresholdRequest request) {
        ApprovalThreshold setting = require();
        String currency = request.currency() != null ? request.currency()
                : setting.getThreshold().currency();
        Money newThreshold = Money.of(request.amount(), currency);
        setting.adjust(newThreshold, actor.username());
        audit.record(actor.username(), "EXPENSE_THRESHOLD_UPDATED", "expense_settings:" + setting.getSettingKey(),
                "threshold=" + newThreshold.amount() + " " + newThreshold.currency());
        return ThresholdResponse.from(setting);
    }

    private ApprovalThreshold require() {
        return thresholds.findById(ApprovalThreshold.KEY)
                .orElseThrow(() -> new IllegalStateException(
                        "approval threshold row is missing; Flyway seed did not run"));
    }

    /** Convenience for tests/diagnostics: the raw threshold amount. */
    @Transactional(readOnly = true)
    public BigDecimal currentAmount() {
        return currentThreshold().amount();
    }
}
