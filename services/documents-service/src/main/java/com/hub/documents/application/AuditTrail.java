package com.hub.documents.application;

/**
 * Append-only audit port: one entry per sensitive action. Every download is
 * recorded (FR-41), in the same transaction as the read.
 */
public interface AuditTrail {

    void record(String actor, String action, String resource, String details);
}
