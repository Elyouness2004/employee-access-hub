package com.hub.expense.application;

/**
 * Append-only audit port (BR-05): one entry per sensitive action — every
 * approval or rejection — recorded in the same transaction as the action.
 */
public interface AuditTrail {

    void record(String actor, String action, String resource, String details);
}
