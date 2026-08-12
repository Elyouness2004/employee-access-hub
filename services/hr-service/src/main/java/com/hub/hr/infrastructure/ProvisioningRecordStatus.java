package com.hub.hr.infrastructure;

/** Outcome recorded for one identity action (mirrors the V2/V6 check constraint). */
public enum ProvisioningRecordStatus {
    PROVISIONED,
    /** An account that already existed in Keycloak was adopted, not created (V6). */
    LINKED,
    FAILED,
    SYNCED,
    DISABLED,
    /** Deactivation reversed: employment ACTIVE again and the account re-enabled (V6). */
    REACTIVATED,
    LOCKED,
    UNLOCKED,
    PASSWORD_RESET,
    ROLES_SYNCED,
    SESSIONS_REVOKED,
    /** MFA enrolment required of the account via a Keycloak required action (V6). */
    MFA_REQUIRED
}
