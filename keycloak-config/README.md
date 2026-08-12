# keycloak-config

Identity configuration as code for realm **employee-hub**. This export is the source of truth for roles, clients, token policy, brute-force settings, SMTP and the OTP policy. Environment-specific values (hostnames, secrets) come from `.env` — never from this file.

## What the export encodes

| Concern | Setting | Source requirement |
|---|---|---|
| Roles | `EMPLOYEE`, and composites `MANAGER`/`HR`/`ADMIN` (each ⊃ EMPLOYEE) | §1.5 permission matrix |
| SPA login | `web-portal` public client, Authorization Code + **PKCE S256 enforced** | FR-01 |
| Audience | `hub-api` client scope adds `aud: hub-api` to access tokens; gateway + services validate it | NFR-security |
| Access token | 300 s lifespan, validated statelessly via JWKS | FR-04, §2.8 |
| Refresh token | 1800 s SSO idle / 28800 s max; **rotation with reuse detection** (`revokeRefreshToken` + `refreshTokenMaxReuse: 0`) | FR-04, §2.8 |
| Brute force | 5 failures → incremental temporary lockout | Diagram 23 |
| Audit | Login/admin events enabled → feeds the audit pipeline | FR-07 |
| No self-registration | `registrationAllowed: false` | §1.7 |
| **Provisioning service account** | `hr-provisioner` — confidential, client-credentials only | FR-12 |
| **Account e-mail** | `smtpServer` block, all values from `KC_SMTP_*` | FR-12 activation |
| **MFA policy** | TOTP / SHA1 / 6 digits / 30 s, codes not reusable | FR-03 |

Roles land in the **access** token under `realm_access.roles`, pre-expanded, so a flat membership check is correct.

## `hr-provisioner` — the identity provisioning service account

hr-service drives the Keycloak Admin REST API as this client. It is declared in the **`employee-hub`** realm (not `master`), so `KEYCLOAK_TOKEN_REALM=employee-hub`. The Keycloak master admin account is never used by any service.

**Least privilege.** Its service account holds exactly three `realm-management` client roles:

| Role | Why it is needed |
|---|---|
| `manage-users` | create/update/delete users, reset credentials, set required actions, send action e-mails, revoke sessions, clear brute-force lockouts |
| `view-users` | look an account up by username — the duplicate guard that makes provisioning idempotent |
| `view-realm` | read a realm role's representation before mapping it to a user |

Verified against Keycloak 26.3 with only these three: every provisioning operation succeeds, while creating clients, updating the realm and reaching any other realm are refused with **403**. The client also has **no `hub-api` scope**, so its token cannot call this platform's own APIs, and no browser or direct-grant flow, so it can only authenticate as itself with the secret.

**The secret is never committed.** The export carries the placeholder `${KEYCLOAK_ADMIN_CLIENT_SECRET}`, which Keycloak resolves from the *keycloak container's* environment at import time. Compose passes the same `.env` value to both Keycloak and hr-service, so one variable keeps them in step. Verified on 26.3: `${VAR}` and `${VAR:default}` resolve; `${env.VAR}` and `$(env:VAR)` do **not** — do not "fix" the placeholders to those forms, the literal string would silently become the secret.

Rotation: change `KEYCLOAK_ADMIN_CLIENT_SECRET` in `.env`, then either re-import the realm or update the client secret in the admin console. Both sides must move together.

## Account e-mail (password setup and reset)

`smtpServer` is fully parameterised through `KC_SMTP_*` with dev defaults pointing at the `mailpit` sink (`docker compose --profile mail up -d mailpit`, inbox on <http://localhost:8025>). Keycloak sends the mail; **the platform has no mail code and no password ever leaves hr-service** — provisioning creates the account with no credential and an `UPDATE_PASSWORD` required action, then asks Keycloak to e-mail an action token.

An account that already exists for the same username is **adopted** instead: it is linked and realigned, but its credential is left alone and no e-mail is sent — Keycloak will not authenticate an account with a pending required action, so forcing one during a link would lock out a working user.

With SMTP unreachable a newly created account is still correct and the required action is still set; the API response reports `activationEmailSent: false` so the operator knows to reach the person another way. `resetPasswordAllowed` is on, so Keycloak's own "Forgot password" is the fallback.

## MFA

The realm ships the TOTP policy as code. `CONFIGURE_TOTP` and `CONFIGURE_RECOVERY_AUTHN_CODES` are Keycloak built-in required actions and are registered and enabled automatically — the export deliberately declares **no** `requiredActions` array, because supplying one replaces the built-in set rather than adding to it (the same trap the `clientScopes` note below describes).

- **Per-user enrolment is implemented**: `POST /api/hr/admin/employees/{id}/require-mfa` adds the `CONFIGURE_TOTP` required action and e-mails the enrolment link. The employee enrols an authenticator app at next sign-in.
- **Realm-wide enforcement for HR/ADMIN is not enabled**, and needs a browser-flow change rather than code: copy the `browser` flow, add a **Conditional OTP** subflow with a *Condition - user role* execution set to `HR` (and a second to `ADMIN`), set OTP Form to `Required` inside it, and bind the copy as the realm's Browser flow. It is left unbound on purpose — binding it would break the `test-cli` direct-grant tests and `smoke-test.sh`, which authenticate the seeded users with a password only.

## Dev/test-only content — strip for production

- Client `test-cli` (direct-access grant for automated tests and smoke scripts).
- The four seeded users (`alice.employee`, `mark.manager`, `hana.hr`, `adam.admin`, password `Test1234!`). In production, accounts exist only via HR/Admin provisioning (FR-12); a production realm export contains **no** human users.
- The `service-account-hr-provisioner` user entry is **not** dev-only: it carries the role mapping that makes provisioning work, and must stay.
- The `mailpit` compose profile. Point `KC_SMTP_*` at a real relay instead.

## Import / export

- Compose and tests import this file automatically (`--import-realm` / Testcontainers realm import).
- Keep every `description` and `name` under **255 characters** — Keycloak's `CLIENT.DESCRIPTION` column is `varchar(255)` and a longer value fails the whole import with `Value too long for column "DESCRIPTION"`, taking the realm (and therefore every test) with it.
- The `clientScopes` array replaces the built-ins rather than adding to them, which is why `roles`, `profile`, `basic` are re-declared here explicitly.
- After changing the realm in a running Keycloak, re-export and commit:
  `kc.sh export --realm employee-hub --file realm-employee-hub.json --users realm_file`
  then restore the `${KEYCLOAK_ADMIN_CLIENT_SECRET}` / `${KC_SMTP_*}` placeholders, which an export replaces with the resolved values.
