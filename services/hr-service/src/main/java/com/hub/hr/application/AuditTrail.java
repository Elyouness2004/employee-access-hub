package com.hub.hr.application;

/**
 * Append-only audit port (BR-06, P2.7): one entry per sensitive action, recorded
 * in the same transaction as the action itself. Same contract as the leave and
 * expense contexts.
 */
public interface AuditTrail {

    void record(String actor, String action, String resource, String details);
}
