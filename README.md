# Employee Access Hub

Enterprise multi-application SSO and Identity & Access Management platform — Keycloak
(OIDC/OAuth2) in front of Spring Boot 3 microservices behind a Spring Cloud Gateway, with
JWT + RBAC enforced end to end and a React SPA on top. Delivered as Docker Compose.

<!-- CI publishes JaCoCo coverage badges as the `badges` artifact (see .github/workflows/ci.yml).
     Once the repo has a GitHub remote, wire a `?branch=main` status badge here:
     ![CI](https://github.com/<owner>/<repo>/actions/workflows/ci.yml/badge.svg) -->

**Build status (verified locally 2026-08-12):** backend `./mvnw test` — **486 tests, 0 failures,
0 skipped** across 7 modules. Frontend — **659 tests in 54 files**, typecheck, lint and production
build all green.

**CI/CD:** [`ci.yml`](.github/workflows/ci.yml) (build · test · JaCoCo ratchet · SpotBugs ·
Checkstyle · image build · badges) · [`cd.yml`](.github/workflows/cd.yml) (tag → GHCR → SSH deploy:
staging auto, production gated) · [`frontend-ci.yml`](.github/workflows/frontend-ci.yml) ·
[`security.yml`](.github/workflows/security.yml) (Gitleaks, full history).

---

## Overview

Employee Access Hub centralizes **who an employee is** and **what they may reach**. An employee
signs in once against Keycloak and reaches every business application without re-authenticating,
while HR keeps a single source of truth for the employee record.

The problem it solves is the drift between the HR system and the identity provider. In most
organizations an employee is hired, transferred or terminated in the HR system, and the matching
login account is created, re-roled or disabled by hand — late, inconsistently, or not at all. A
terminated employee keeping a working account is the failure mode that matters.

Here the two are bound together: **the HR record drives the Keycloak account.** Making an employee
`ACTIVE` provisions their account, changing their profile or reporting line synchronizes it,
and terminating them disables it and revokes their sessions.

**Who uses it**

| Role | What they do |
|---|---|
| `EMPLOYEE` | Sign in once; view their own HR record; request leave; submit expenses; read documents; manage their sessions and notifications |
| `MANAGER` | Everything above, plus approval queues for their direct reports and a team view |
| `HR` | Employee directory, departments and positions, the identity lifecycle actions, leave and expense administration |
| `ADMIN` | Everything above, plus the Audit Center, security events and document category management |

Roles are Keycloak **composite realm roles** (`MANAGER`/`HR`/`ADMIN` ⊃ `EMPLOYEE`), so the token
carries the expanded set and every layer reads the same authority list.

**Golden rule: the business services never see a password.** Credentials exist only inside
Keycloak. No password is ever generated for, returned by, or logged by the HR API.

---

## Main Features

Everything listed here is implemented and test-covered.

### Identity & access

- **Single sign-on** — Keycloak realm `employee-hub` as code
  ([keycloak-config/](keycloak-config/)): composite realm roles, an SPA client with
  **Authorization Code + PKCE (S256 enforced)**, a `hub-api` audience mapper, 5-minute access
  tokens, refresh **rotation with reuse detection**, brute-force lockout, auth event logging and
  no self-registration.
- **Three-layer authorization** — the gateway validates the JWT first (signature via cached JWKS,
  issuer, audience, expiry), each service **re-validates it in full** (zero trust), and
  `@PreAuthorize` plus ownership checks decide the request.
- **Employee identity lifecycle** (hr-service) — a new `ACTIVE` employee is auto-provisioned into
  Keycloak with **no credential created**: the account carries Keycloak's `UPDATE_PASSWORD`
  required action, and Keycloak e-mails the employee an action token so they set their own
  password. An account that already exists for that username is **adopted**, never duplicated.
- **Identity synchronization** — profile, status and reporting-line changes sync the account,
  including the derived realm role, applied as a *replacement* so a former manager actually loses
  `MANAGER`.
- **Offboarding** — termination disables the account, revokes sessions and refresh tokens, and
  fans the BR-05 signal out to leave/expense/documents both synchronously and over the event
  fabric.
- **Admin identity actions** — provision, re-provision, reset password, require MFA, disable,
  reactivate, lock/unlock, role sync, revoke sessions, offboard, and per-employee history, under
  `/api/hr/admin/**`.
- **Session management** — users see and revoke their own sessions; revoking the current one
  requires an explicit confirmation.

### Business services

- **HR** — employees, departments, positions; self-service `GET /api/hr/me` and
  `GET /api/hr/me/team`, both scoped from `jwt.sub` so there is no id parameter to tamper with.
- **Leave** — balances (BR-01), no self-approval with HR escalation (BR-02), overlap rejection
  (BR-03), offboarding auto-cancel with re-credit (BR-05), and a full state machine.
- **Expense** — owner-only access, direct-manager approval with HR escalation, and a configurable
  threshold that forces **second-level approval** (BR-03/BR-04).
- **Documents** — real file storage behind a `DocumentStorage` port (volume-backed filesystem
  adapter): multipart upload, streamed download, size and MIME policy, server-generated storage
  keys, and category-plus-ownership access rules with **every download audited**.
- **Analytics** — a read-only REST aggregator with no database of its own, a Resilience4j circuit
  breaker, timeout and two-tier snapshot cache per source, graceful per-source degradation, and a
  Power BI facade.

### Platform

- **Event fabric** — lifecycle events (`EmployeeProvisioned`/`Updated`/`Offboarded`) go through a
  `DomainEventPublisher` port into a **transactional outbox** (at-least-once). A config-gated relay
  forwards them to RabbitMQ (topic exchange + DLX/DLQ + retry + idempotent consumer). Off by
  default — the outbox is an inspectable trail that needs no broker.
- **Uniform collection API** — every list endpoint is paged, sorted, filtered and searchable with
  the same `?page&size&sort&search` parameters and the same response envelope. See
  [docs/api/api-conventions.md](docs/api/api-conventions.md).
- **Append-only trails** — audit log, security events, provisioning records and notifications are
  append-only by design; nothing in the product can edit or delete them.
- **Web portal** — the React + TypeScript SPA ("Identity Control Plane") is feature-complete: real
  OIDC sign-in with tokens **in memory only** and cross-tab-coordinated renewal, every approved page
  behind it, server-driven tables throughout, WCAG 2.2 AA, light and dark themes.
- **Observability** — Micrometer → Prometheus → Grafana, Promtail → Loki structured JSON logs with
  correlation ids, OpenTelemetry tracing to Tempo.

---

## Architecture

```text
                    Browser (React SPA)
                            │
                    ┌───────┴────────┐
                    │                │  OIDC Authorization Code + PKCE (S256)
                    │                ▼
                    │        ┌───────────────┐
                    │        │   Keycloak    │  realm employee-hub
                    │        │    :8081      │  composite roles · token rotation
                    │        └───────┬───────┘
                    │ Bearer JWT     │ Admin REST (hr-provisioner)
                    ▼                │
          ┌──────────────────┐       │
          │  Spring Cloud    │       │   layer 1: validate JWT, CORS,
          │    Gateway :8080 │       │            X-Correlation-Id, token relay
          └─────────┬────────┘       │
                    │ relayed Bearer │
     ┌──────────┬───┴───┬────────────┼──────────┐
     ▼          ▼       ▼            ▼          ▼
  hr :9001  leave    expense    documents   analytics   layer 2: re-validate JWT
            :9002     :9003       :9004       :9005     layer 3: @PreAuthorize
     │          │       │            │          │                + ownership
     └──────────┴───┬───┴────────────┘          └── aggregates over REST only
                    ▼                               (no database)
            ┌───────────────┐        ┌──────────────┐
            │  PostgreSQL   │        │   RabbitMQ   │  gated event relay
            │     :5432     │        │    :5672     │  (outbox is the default)
            └───────────────┘        └──────────────┘
             one schema per service
```

Only the gateway (`:8080`) and Keycloak (`:8081`) are published to the host. The five business
services are reachable **only** through the gateway. In staging and production an nginx TLS edge
sits in front, and the stack runs on three networks (edge / backend / observability).

Full detail: [docs/architecture/Architecture.md](docs/architecture/Architecture.md) ·
[docs/architecture/infrastructure.md](docs/architecture/infrastructure.md) · rendered UML under
[docs/diagrams/](docs/diagrams/README.md).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | Java 21 · TypeScript |
| Backend | Spring Boot 3.5.16 · Spring Security (OAuth2 resource server) · Spring Cloud Gateway (Spring Cloud 2025.0.3) · Spring Data JPA · Resilience4j · Flyway |
| Identity | Keycloak 26.3 (OIDC / OAuth2, Admin REST) |
| Database | PostgreSQL 16 — one schema per service |
| Messaging | RabbitMQ 3.13 (config-gated; transactional outbox is the default) |
| Frontend | React · TypeScript · Vite · TanStack Query · TanStack Table · Tailwind CSS · Radix UI · react-hook-form + Zod · Recharts |
| Testing | JUnit 5 · Spring Boot Test · Testcontainers · Vitest · React Testing Library · MSW · vitest-axe |
| Build | Maven (wrapper) · npm (Node ≥ 20) |
| Quality | JaCoCo (ratchet) · SpotBugs · Checkstyle · ESLint · Prettier · Gitleaks |
| Observability | Micrometer · Prometheus · Grafana · Loki · Promtail · Tempo · OpenTelemetry |
| Delivery | Docker · Docker Compose · nginx · GitHub Actions · GHCR |

---

## Project Structure

```text
.
├── gateway/                  Spring Cloud Gateway — routing, first-line JWT validation
├── services/
│   ├── hr-service/           employees, identity lifecycle, sessions, audit, notifications
│   ├── leave-service/        leave requests and balances
│   ├── expense-service/      expense claims and two-level approval
│   ├── documents-service/    document metadata and file storage
│   └── analytics-service/    read-only REST aggregator + Power BI facade
├── web-portal/               React + TypeScript + Vite SPA
├── keycloak-config/          realm employee-hub as code
├── docker/                   compose files, initdb, nginx, observability, scripts, demo seeder
├── quality/                  checkstyle.xml, spotbugs-exclude.xml (shared by all modules)
├── docs/                     ALL documentation — see docs/README.md
├── .github/workflows/        ci · cd · frontend-ci · security
├── pom.xml                   Maven aggregator (convenience only — modules deploy independently)
├── Makefile                  developer shims: up, down, test, smoke, seed, e2e-local, …
└── .env.example              environment contract (placeholders only)
```

Each backend module is an independently deployable Spring Boot application with its own pipeline;
the root `pom.xml` exists so one command builds and tests everything.

---

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| JDK | 21 | backend build and tests |
| Node.js | ≥ 20 | web portal |
| Docker Engine + Compose v2 | recent | the full stack, Testcontainers e2e |
| `make` | any | the developer shims (optional — every target is a plain command) |
| `python3` | 3.9+ | realm reconciliation and the demo seeder |
| `jq`, `curl` | any | smoke test and IAM verification scripts |

Maven is **not** required — the repository ships the Maven wrapper (`./mvnw`).

---

## Installation

```bash
git clone <repository-url>
cd employee-access-hub

# Backend — builds all 7 modules
./mvnw -DskipTests package

# Frontend
cd web-portal && npm ci && cd ..
```

---

## Configuration

All runtime configuration comes from environment variables. The repository ships **contracts, not
values**:

| File | Purpose |
|---|---|
| [`.env.example`](.env.example) | local / dev contract — copy to `.env` |
| [`.env.staging.example`](.env.staging.example) | staging contract — copy to `.env.staging` |
| [`.env.production.example`](.env.production.example) | production contract — copy to `.env.production` |
| [`web-portal/.env.example`](web-portal/.env.example) | SPA configuration (public by definition) |

```bash
cp .env.example .env
# then fill every `change-me` with a real value
```

`make up` and `docker/scripts/deploy.sh` both run
[`docker/scripts/validate-env.sh`](docker/scripts/validate-env.sh) first, which **refuses**
placeholder, missing or inconsistent values. Compose additionally uses `${VAR:?set in .env}`
interpolation, so the stack will not start with a required variable unset.

Generate secrets with `openssl rand -base64 32`. `KEYCLOAK_ADMIN_CLIENT_SECRET` has **one value
and two consumers** — the Keycloak realm import and hr-service — so it must match on both sides.

Full reference: [docs/operations/environment-variables.md](docs/operations/environment-variables.md).

> **Never put a secret in a `VITE_*` variable.** Everything under `web-portal/.env*` ships to the
> browser and is public by definition.

---

## Running the Application

### Full stack with Docker

```bash
cp .env.example .env   # fill passwords first
make up                # validate env → build → start → reconcile realm
make smoke             # executable RBAC matrix against the running stack
make logs              # follow logs
make down              # stop the stack
```

| Service | URL | Notes |
|---|---|---|
| API gateway | http://localhost:8080 | the only API entry point |
| Keycloak | http://localhost:8081 | realm `employee-hub` |
| Mailpit (dev SMTP sink) | http://localhost:8025 | **browser inbox**; SMTP is `mailpit:1025` inside the network |
| Grafana (observability overlay) | http://localhost:3000 | `GRAFANA_PORT` |

The five business services (`:9001`–`:9005`), PostgreSQL and RabbitMQ are **not** published to the
host — they are reachable only inside the compose network.

### Without Docker

```bash
make e2e-local         # downloads a Keycloak distribution to .local/, runs services as jars, smokes them
```

### Web portal alone

```bash
cd web-portal
npm run dev            # http://localhost:5173
```

With `VITE_DEV_AUTH=mock` (the default) the SPA needs no backend, Docker or Keycloak — it runs on a
fixture identity with a role switcher. Real sign-in needs Keycloak on `:8081` and the gateway on
`:8080`. Details: [web-portal/README.md](web-portal/README.md).

### Demo dataset (dev only)

```bash
make up
make seed-reset        # ~300 accounts + matching HR, leave, expense and document data
```

Loads "Atlas Numeris", a synthetic company: 16 departments, ~88 job titles, one reporting tree, and
~500 leave requests / ~850 expenses / ~400 documents. The seeder verifies its own output (no
orphans, no duplicates, BR-01/02/03 respected) before exiting, and never touches the four realm
fixtures, so `make smoke` is unaffected. See [docker/seed/README.md](docker/seed/README.md).

---

## Testing

```bash
# Backend — 486 tests across 7 modules
./mvnw test                    # or: make test

# Frontend — 659 tests
cd web-portal
npm run check                  # format · typecheck · lint · contrast · tests · build
npm test                       # tests only
```

Coverage:

- **Unit tests** — domain rules, role converter, correlation filter, log masking.
- **Signed-JWT integration tests** — real RS256 tokens against the production decoder path via an
  in-test JWKS server: 401 for missing / garbage / expired / forged / wrong-audience / wrong-issuer
  tokens, 200 + relay for valid ones, and the full RBAC matrix.
- **Testcontainers end-to-end** — against a real Keycloak importing
  [the same realm file](keycloak-config/realm-employee-hub.json) the stack ships. Runs when Docker
  is available and skips cleanly when it is not.
- **Frontend** — every page state (loading, data, empty, error, forbidden, unavailable, degraded),
  role-conditional rendering, contract behaviors against MSW handlers that speak the real API, and a
  `vitest-axe` accessibility smoke assertion on every page.

Against a running stack:

```bash
make smoke             # RBAC matrix over HTTP
make iam-verify        # end-to-end identity lifecycle (read-write: creates and offboards records)
```

---

## Docker

Compose files live under [docker/](docker/) and are layered — a base plus environment overlays:

| File | Role |
|---|---|
| `docker-compose.yml` | base dev stack: postgres → keycloak (realm import) → rabbitmq → 5 services → gateway, plus the `mail` profile (Mailpit) |
| `docker-compose.staging.yml` | staging overlay — pulls tagged images instead of building |
| `docker-compose.production.yml` | production overlay — requires `IMAGE_REGISTRY` and `IMAGE_TAG` |
| `docker-compose.observability.yml` | Prometheus, Grafana, Loki, Promtail, Tempo |
| `docker-compose.edge.yml` | nginx TLS edge (the only public entry in staging/production) |

```bash
# dev
make up   /  make down   /  make logs

# production — overlays compose onto the base, never used alone
docker compose -f docker/docker-compose.yml \
  -f docker/docker-compose.production.yml \
  -f docker/docker-compose.observability.yml \
  -f docker/docker-compose.edge.yml \
  --env-file .env.production up -d --no-build
```

**Volumes:** `pgdata` (PostgreSQL), `documentsdata` (uploaded document bytes, mounted at
`/var/lib/hub/documents`), plus Grafana/Loki/Tempo volumes with the observability overlay.
`make down` stops containers and **keeps** volumes. Backup and restore procedures:
[docs/operations/backup-recovery.md](docs/operations/backup-recovery.md).

Images are multi-stage (Maven → JRE 21 slim) and run as a **non-root** user, with healthchecks and
restart policies on every container.

---

## Authentication & Security

Keycloak is the **only** identity provider and the only component that ever handles a credential.

**Where authentication happens.** The SPA redirects the browser to Keycloak and gets back an
authorization code via **Authorization Code + PKCE (S256 enforced by the realm)**, which it
exchanges for tokens. The SPA is a **public client** — it holds no secret. Access tokens live **in
memory only**, never in `localStorage`, and renewal runs behind a cross-tab single-refresh lock
because a concurrent refresh from two tabs would trip reuse detection and revoke the session.

**Where authorization happens — three layers, all server-side:**

1. **Gateway** — validates the JWT signature against cached JWKS, plus issuer, audience and expiry;
   injects `X-Correlation-Id`; relays the Bearer token downstream.
2. **Service** — re-validates the token in full. The gateway is not trusted (zero trust), so a
   request that somehow reaches a service directly is rejected on its own merits.
3. **Method and record** — `@PreAuthorize` on realm roles, then ownership checks comparing the JWT
   `sub` against the record's `*KeycloakId` field.

Frontend route guards are **UX only** — they hide what a user cannot use. The server is the sole
authority.

**HR → Keycloak provisioning** uses a confidential service account (`hr-provisioner`) inside the
realm, calling the Keycloak Admin REST API. It creates accounts **without credentials**; the
employee sets their own password through a Keycloak action-token e-mail.

**Secrets are externalized** — none are committed. Runtime secrets live in git-ignored `.env`,
`.env.staging` and `.env.production` files filled from the `*.example` contracts; CI/CD credentials
live in GitHub Actions secrets, with production deploys gated by a GitHub environment requiring
reviewers. Gitleaks scans the full history on every push.

The realm export contains four documented **dev-only fixture users** whose sole purpose is proving
the RBAC matrix in tests and smoke runs. They are seeds for a local realm, not credentials to any
deployed system, and are explicitly allowlisted in [`.gitleaks.toml`](.gitleaks.toml) by path and
literal so a genuine secret anywhere else still trips the gate. **Do not deploy the committed realm
export to a public environment without replacing them.**

Full posture and vulnerability reporting: [SECURITY.md](SECURITY.md) ·
[docs/security/supply-chain.md](docs/security/supply-chain.md).

---

## API

All traffic enters through the gateway at `http://localhost:8080`. Every request carries
`Authorization: Bearer <token>`; every response echoes `X-Correlation-Id`.

| Route prefix | Service |
|---|---|
| `/api/hr/**` | hr-service — employees, departments, positions, identity admin, sessions, audit, notifications |
| `/api/leave/**` | leave-service — requests, balances, approvals |
| `/api/expenses/**` | expense-service — claims, approvals |
| `/api/documents/**` | documents-service — metadata, upload, download |
| `/api/analytics/**` | analytics-service — aggregates, Power BI facade |

Representative calls:

```bash
# Your own HR record — scoped from the token, no id to tamper with
curl -H "Authorization: Bearer $TOKEN" http://localhost:8080/api/hr/me

# Any collection: paged, sorted, filtered, searchable — one envelope everywhere
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/hr/employees?page=0&size=20&sort=lastName,asc&search=alaoui"
```

```jsonc
// Collection envelope
{ "content": [ /* … */ ], "page": 0, "size": 20,
  "totalElements": 137, "totalPages": 7, "first": true, "last": false }
```

Errors are **RFC 7807** problem documents throughout, carrying a `detail`, the correlation id, and —
for business-rule violations — the `rule` identifier (`BR-xx`) so the client can give specific
guidance instead of a generic message.

Each service also publishes OpenAPI at `/v3/api-docs`. Endpoints under `/internal/**` are
service-to-service only and are not routed through the gateway.

Conventions in full — paging, sort whitelists, upload limits, every error status and its meaning:
[docs/api/api-conventions.md](docs/api/api-conventions.md).

---

## Documentation

Everything lives under [docs/](docs/README.md), indexed by
[docs/README.md](docs/README.md).

| Area | Entry point |
|---|---|
| **Start here** | [docs/development/LOCAL-DEVELOPMENT-GUIDE.md](docs/development/LOCAL-DEVELOPMENT-GUIDE.md) — run, configure, verify and manually test the platform from scratch |
| Architecture | [docs/architecture/](docs/architecture/Architecture.md) — architecture, infrastructure, technical book |
| API | [docs/api/api-conventions.md](docs/api/api-conventions.md) |
| Frontend | [docs/frontend/](docs/frontend/FRONTEND-ARCHITECTURE.md) — architecture, specification, design system, discovery, roadmap |
| Deployment | [docs/deployment/ci-cd.md](docs/deployment/ci-cd.md) · [docs/deployment/blue-green.md](docs/deployment/blue-green.md) · [docs/operations/deployment-guide.md](docs/operations/deployment-guide.md) |
| Operations | [docs/operations/](docs/operations/runbook.md) — runbook, monitoring, backup/DR, incident response, env vars |
| Observability | [docs/observability/logging-and-tracing.md](docs/observability/logging-and-tracing.md) |
| Security | [SECURITY.md](SECURITY.md) · [docs/security/supply-chain.md](docs/security/supply-chain.md) |
| Diagrams | [docs/diagrams/](docs/diagrams/README.md) — UML sources (PlantUML) + rendered SVG |
| Keycloak | [keycloak-config/README.md](keycloak-config/README.md) — realm as code, roles, clients, token policy |

---

## Development

```bash
./mvnw test                              # backend, all modules
./mvnw -pl services/hr-service test      # one module
cd web-portal && npm run check           # frontend gate: format · typecheck · lint · contrast · test · build
```

Working rules that keep the codebase coherent:

- **The backend is the source of truth.** Never invent an endpoint, field, role or error shape —
  verify it against [docs/api/api-conventions.md](docs/api/api-conventions.md) or the controller
  source. A missing capability is "requires backend work", not a client-side workaround.
- **When documents and code disagree, the code wins** — and the gap gets flagged.
- **Additive changes over rewrites.** When a task reveals a blocker or a contradiction, stop and
  report rather than improvise.
- `employeeId` (HR record) and `keycloakId`/`sub` (login account) are **distinct concepts**.
  Ownership checks compare `sub` against `*KeycloakId`; HR navigation uses `employeeId`.
- Frontend specifics — feature-first layout, import boundaries, token-only styling, WCAG 2.2 AA,
  and the testing contract — are in [docs/frontend/](docs/frontend/FRONTEND-ARCHITECTURE.md) and
  enforced in review.

Quality gates run in CI on every push: JaCoCo coverage ratchet, SpotBugs, Checkstyle, ESLint,
Prettier and Gitleaks. `lint`, `typecheck` and `test` must pass before any hand-off.

---

## Git Workflow

```bash
git checkout -b feature/short-description
# … make changes …
./mvnw test && (cd web-portal && npm run check)   # both gates green before committing
git status
git add .
git commit -m "Add X"
git push -u origin feature/short-description
```

Open a pull request against `main`. CI runs build, tests, the coverage ratchet, static analysis and
the secret scan. Deployment is tag-driven: pushing a tag builds images to GHCR and deploys — staging
automatically, production behind a gated GitHub environment.

---

## License

No license is currently declared. All rights reserved by the author. Contact the author before
reuse or redistribution.

---

## Author

**Elyouness2004**

Built as an enterprise IAM platform demonstrating Keycloak-based single sign-on and a
code-driven employee identity lifecycle across Spring Boot microservices.
