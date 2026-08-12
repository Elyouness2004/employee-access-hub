-- Identity lifecycle completion.
--
-- The provisioning journal gains three outcomes that the lifecycle could not
-- record before:
--   LINKED       an account that already existed in Keycloak was adopted rather
--                than created a second time (idempotent re-provisioning, and the
--                only correct answer for a pre-seeded account)
--   REACTIVATED  a deactivation was reversed — distinct from UNLOCKED, which
--                clears a security hold without touching employment status
--   MFA_REQUIRED MFA enrolment was required of the account (Keycloak
--                CONFIGURE_TOTP required action)
--
-- Only the check constraint changes; no data is rewritten and every existing
-- status stays valid.
alter table provisioning_record drop constraint ck_provisioning_status;
alter table provisioning_record add constraint ck_provisioning_status
    check (status in ('PROVISIONED', 'LINKED', 'FAILED', 'SYNCED', 'DISABLED', 'REACTIVATED',
        'LOCKED', 'UNLOCKED', 'PASSWORD_RESET', 'ROLES_SYNCED', 'SESSIONS_REVOKED', 'MFA_REQUIRED'));
