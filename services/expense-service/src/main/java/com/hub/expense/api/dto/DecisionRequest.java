package com.hub.expense.api.dto;

import jakarta.validation.constraints.Size;

/** Optional free-text comment attached to an approve/reject decision. */
public record DecisionRequest(@Size(max = 500) String comment) {
}
