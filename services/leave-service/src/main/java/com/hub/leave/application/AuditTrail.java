package com.hub.leave.application;

/**
 * Append-only audit port (BR-06): one entry per sensitive action, recorded in
 * the same transaction as the action itself.
 */
public interface AuditTrail {

    void record(String actor, String action, String resource, String details);
}
