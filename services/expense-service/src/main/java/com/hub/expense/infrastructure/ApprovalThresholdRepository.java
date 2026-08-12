package com.hub.expense.infrastructure;

import com.hub.expense.domain.ApprovalThreshold;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ApprovalThresholdRepository extends JpaRepository<ApprovalThreshold, String> {
}
