-- Session Management (Part 8): the local supplement to Keycloak SSO sessions.
-- Keycloak's Admin REST API stays the source of truth for the session list (id,
-- IP, login/last-activity, clients); this table only holds the attributes that
-- representation does not carry — browser, OS, device, whether MFA was used —
-- keyed by the Keycloak session id (the access token's `sid`).
-- Additive and backward compatible: a single CREATE TABLE + index, no change to
-- any existing table. Must run on PostgreSQL (compose) AND H2 in PostgreSQL mode
-- (local/tests): common SQL subset only; the session id is assigned by Keycloak.
create table session_detail (
    session_id       varchar(100) primary key,
    keycloak_id      uuid         not null,
    browser          varchar(100),
    operating_system varchar(100),
    device_name      varchar(120),
    user_agent       varchar(1024),
    mfa_used         boolean      not null default false,
    captured_at      timestamp with time zone not null,
    last_seen_at     timestamp with time zone not null
);
create index ix_session_detail_keycloak on session_detail (keycloak_id);
