# Employee Access Hub — Web Portal

React SPA for the Employee Access Hub platform ("Identity Control Plane" design language).
The web portal is feature-complete: every approved page and flow is implemented.

> **Current scope — feature-complete.** Token-styled responsive shell with role-shaped
> navigation, driven by **real OIDC authentication** (Authorization Code + PKCE S256 against
> Keycloak) with in-memory tokens, cross-tab-coordinated renewal, guards and logout; and every
> approved page behind it — self-service, the manager queues, HR administration and the identity
> lifecycle, documents, notifications, the Audit Center, analytics, and leave/expense
> administration. **No placeholder route and no mock business data remain.** A development-only
> mock identity is still available for building UI without a running Keycloak — it cannot exist
> in a production build.

## Requirements

- Node.js ≥ 20 (CI uses 22) and npm.
- No backend, no Docker, and no Keycloak needed for development (with `VITE_DEV_AUTH=mock`),
  tests, or builds. Real sign-in needs Keycloak on `:8081` (see
  [Authentication](#authentication-phase-2)).

## Setup

```bash
cd web-portal
npm ci
npm run dev        # http://localhost:5173
```

Environment: `.env.development` ships working local defaults (public browser config only —
never secrets). `.env.example` documents every variable. `src/config/env.ts` validates them
with Zod at boot and is the **only** module allowed to read `import.meta.env`; a missing or
invalid variable fails fast with a readable error.

| Variable                             | Meaning                                     | Dev default                                 |
| ------------------------------------ | ------------------------------------------- | ------------------------------------------- |
| `VITE_API_BASE_URL`                  | Gateway origin                              | `http://localhost:8080`                     |
| `VITE_OIDC_AUTHORITY`                | Keycloak realm issuer                       | `http://localhost:8081/realms/employee-hub` |
| `VITE_OIDC_CLIENT_ID`                | Public SPA client                           | `web-portal`                                |
| `VITE_OIDC_REDIRECT_URI`             | Optional sign-in callback override          | `<origin>/auth/callback`                    |
| `VITE_OIDC_POST_LOGOUT_REDIRECT_URI` | Optional post-logout override               | `<origin>/login`                            |
| `VITE_SESSION_IDLE_TIMEOUT_SECONDS`  | Mirror of realm `ssoSessionIdleTimeout`     | `1800`                                      |
| `VITE_SESSION_MAX_LIFETIME_SECONDS`  | Mirror of realm `ssoSessionMaxLifespan`     | `28800`                                     |
| `VITE_SESSION_WARNING_SECONDS`       | Expiry-warning lead time (floor 60)         | `60`                                        |
| `VITE_DEV_AUTH`                      | Dev-only identity source (`mock` \| `oidc`) | `mock`                                      |
| `VITE_DEV_ROLE`                      | Dev-only initial mocked role                | `EMPLOYEE`                                  |

No secret belongs in any of these — everything shipped to the browser is public. The SPA is a
**public** OIDC client: it has no client secret by design (PKCE replaces it).

The dev server port **5173 is pre-authorized** in the Keycloak realm and the gateway CORS
default — keep it.

## Commands

| Command                                         | Purpose                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `npm run dev`                                   | Vite dev server (5173, strict port)                                 |
| `npm run build`                                 | Typecheck + production build to `dist/`                             |
| `npm run preview`                               | Serve the production build                                          |
| `npm run typecheck`                             | TypeScript strict, no emit                                          |
| `npm run lint` / `lint:fix`                     | ESLint incl. import-boundary rules                                  |
| `npm run format` / `format:check`               | Prettier                                                            |
| `npm run test` / `test:watch` / `test:coverage` | Vitest + RTL + MSW (+ vitest-axe)                                   |
| `npm run check:contrast`                        | WCAG contrast for every token pair, both themes (see below)         |
| `npm run check`                                 | format:check → typecheck → lint → check:contrast → test → build     |
| `npm run generate:api`                          | Generate DTO types from running services' OpenAPI (ports 9001–9005) |

`npm run check:contrast` exists because `vitest-axe` **cannot** run axe's colour-contrast rule:
jsdom has no layout and no canvas, so the rule is skipped and the axe smokes prove structure
only. [scripts/check-contrast.mjs](scripts/check-contrast.mjs) computes the WCAG ratios straight
from `src/styles/tokens.css` instead — 4.5:1 for text, 3:1 for interactive-control boundaries and
meaningful graphics — and fails the build on a regression. The pairs it deliberately exempts, and
why, are documented in the script.

`npm run check` must be green before any hand-off. CI (`.github/workflows/frontend-ci.yml`)
runs the same gates.

## Directory structure

```
src/
├── main.tsx              # entry: fonts, global styles, <App/>
├── app/                  # bootstrap — the only layer that sees everything
│   ├── App.tsx           # provider composition
│   ├── providers/        # QueryProvider
│   ├── router/           # route tree (approved sitemap), error boundaries
│   ├── layouts/          # AppShell (sidebar + header + outlet)
│   ├── navigation/       # THE typed nav config (roles per capability matrix)
│   ├── pages/            # cross-feature compositions (approvals, employee detail,
│   │                     #   leave admin), 403, 404
│   └── dev/              # ⚠ development-only identity adapter + role switcher
├── features/             # one folder per capability: analytics, audit, auth, dashboard,
│   │                     #   documents, employees, expenses, identity, leave,
│   │                     #   notifications, organization, profile, sessions, team
│   └── auth/             # OIDC provider, cross-tab coordinator, login/callback, guards
├── shared/
│   ├── api/              # THE HTTP boundary: axios client, RFC 7807 normalizer, paged
│   │                     #   envelope, downloads, token + renewal seams, query client
│   ├── auth/             # identity contract, roles, RouteGuard, session controls
│   ├── components/       # shell composites (sidebar, header, menus, states)
│   │   └── ui/           # wrapped primitives (Radix restyled to tokens)
│   ├── catalogues/       # department/position lookup (promoted: four consumers)
│   ├── hooks/            # useMediaQuery, usePreference, useUrlFilters
│   ├── lib/              # cn, navigation model, presentation formatting
│   ├── theme/            # ThemeProvider (light/dark via data-theme)
│   └── testing/          # renderWithProviders, MSW server + real-contract fixtures
├── styles/
│   ├── tokens.css        # ALL design tokens (light + dark) — the only place colors live
│   └── globals.css       # reset, typography, focus ring, reduced motion, motion utilities
└── config/
    └── env.ts            # the single import.meta.env reader (Zod-validated)
```

Import boundaries are ESLint-enforced: features never import each other; `shared/` never
imports `features/` or `app/`; only `shared/api` imports axios; only `shared/components/ui`
imports `@radix-ui/*`; only `config/env.ts` reads `import.meta.env`.

## Design system

Tokens: [src/styles/tokens.css](src/styles/tokens.css), authored from
[docs/frontend/DESIGN-SYSTEM.md](../docs/frontend/DESIGN-SYSTEM.md) — graphite primary (never blue), IBM Plex
Sans/Mono (self-hosted via @fontsource), 1px-border separation, 4/6/8px radii, both themes.
Tailwind's default palette/scale is **replaced** by token mappings, so `bg-blue-500` or
`p-[18px]` do not exist; a test (`src/shared/testing/token-contract.test.ts`) fails the suite
if raw hex, palette classes, or arbitrary values appear in components.

Theme: stored preference or OS setting, stamped as `data-theme` on `<html>` (pre-paint script
in `index.html`); toggle lives in the user menu.

## Authentication (Phase 2)

Real sign-in against Keycloak: **OIDC Authorization Code flow with PKCE S256**, using
`oidc-client-ts`. The SPA renders no credential form and never handles a password — it is a
controlled entry point that redirects to the organization's identity provider.

```
/login → Keycloak → /auth/callback (code + verifier) → identity → app shell
```

Configuration comes from the realm as it exists (`keycloak-config/realm-employee-hub.json`):
realm `employee-hub`, public client `web-portal`, PKCE S256 enforced, implicit flow and direct
grants disabled, redirect URIs `http://localhost:5173/*` and `http://localhost:3000/*`, scopes
`openid profile roles hub-api`, access token 300 s, refresh rotation with
`refreshTokenMaxReuse: 0`, SSO idle 30 min / max 8 h.

### Routes

| Route            | Access | Purpose                                                                                 |
| ---------------- | ------ | --------------------------------------------------------------------------------------- |
| `/login`         | public | Entry point; starts the redirect. Shows why you're here (signed out / expired / failed) |
| `/auth/callback` | public | P01 — code exchange, then back to the intended route                                    |
| `/auth/silent`   | public | Hidden renewal iframe; React never mounts here                                          |
| `/403`           | authed | Guard denial — authenticated, not permitted; names the path                             |
| everything else  | authed | Behind `RequireAuth`; role branches behind `RouteGuard`                                 |

### Identity and roles

The OIDC provider feeds the **same** `shared/auth` identity contract the Phase 1 mock fed —
navigation, guards, and the user menu cannot tell the two apart. Roles come from
`realm_access.roles` in the **access** token (the realm maps them there, not into the ID token),
filtered to the four product roles; realm-internal roles (`offline_access`, `uma_authorization`,
`default-roles-*`) are dropped. Composites are pre-expanded by Keycloak — MANAGER, HR, and ADMIN
each carry EMPLOYEE — so every check is a flat membership test.

Guards are **UX only**: the gateway and services authorize every request. Unauthorized nav items
are hidden, never disabled (Team/Approvals stay MANAGER-only — HR/ADMIN do not see them).

### Token lifecycle and browser storage

| Where                          | What                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| JS heap (`InMemoryWebStorage`) | Access **and** refresh tokens — never written to any persistent store                             |
| `sessionStorage`               | oidc-client-ts transaction state only: PKCE verifier, `state`, `nonce`, for an in-flight redirect |
| `localStorage`                 | UI preferences only (`eah:theme`, `eah:sidebarCollapsed`)                                         |
| IndexedDB / cookies (app-set)  | Nothing                                                                                           |

Tokens are never logged, never put in a URL, and never included in an error message. A reload
restores the session silently from the Keycloak SSO cookie; a newly opened tab first asks
already-open tabs to hand over the session, so the browser keeps one refresh-token lineage.

**Accepted risk:** that handoff (and the renewal fan-out) carries the serialized user —
refresh token included — over the same-origin `BroadcastChannel`, so a same-origin script could
subscribe and read it. Handing over only the access token would force each tab into its own
refresh-token lineage, which is precisely what the realm's zero-reuse rotation revokes; single
lineage was judged the larger risk reduction. Full rationale: FRONTEND-ARCHITECTURE §5.1.

Renewal runs ~60 s before expiry (`automaticSilentRenew` is deliberately off) — but **only while
the tab is visible**. A hidden tab lets the token lapse and renews on return, because every
refresh grant resets Keycloak's idle clock and a background tab renewing on a timer would keep
an abandoned session alive for the full 8 h max lifespan, cancelling the realm's 30-minute idle
timeout. A `401` from the API triggers **one** renewal and **one** replay of the original
request — concurrent 401s share that single renewal, a replayed request never renews again, and
a 403 never triggers renewal.

### Cross-tab single-refresh lock

The realm rotates refresh tokens with zero reuse, so two tabs refreshing at once revokes the
whole session. `CrossTabRefreshCoordinator` prevents that:

1. In-tab single-flight — the expiry timer and any 401s share one attempt.
2. An exclusive **Web Lock** (`eah:auth:refresh`) serializes tabs. Locks are browser-managed, so
   a crashed or closed tab releases its lock automatically.
3. Inside the lock, if a peer's `user-updated` broadcast replaced our user while we waited, that
   _is_ our renewal — adopt it, touch nothing. (A merely fresh-looking token does **not** skip a
   renewal: a 401-triggered renewal must proceed, because the server already rejected it.)
4. Otherwise perform one renewal and broadcast the new user; every tab adopts it.

Failure modes: `invalid_grant`/`login_required` → session-expired in every tab; network failure
→ transient, retried while the current token still lives; waiting >15 s for the lock → **fail**
rather than refresh unlocked (an unlocked refresh could revoke every tab; a failed one costs a
silent re-login). Without the Web Locks API, behavior degrades to in-tab single-flight only.

Logout and expiry propagate over the same `BroadcastChannel` (`eah:auth`), so signing out of one
tab signs out the rest.

### Session timeout UX

Keycloak publishes none of its session settings to a client, so the three `VITE_SESSION_*`
variables **mirror** the realm (idle 1800 s, max 28800 s) and drive a client-side clock. That
clock is a usability control, not a security boundary — the server still decides whether a
session is valid, and the copy never claims otherwise.

Four things are kept apart: token renewal (silent plumbing, ~every 4 min), user activity
(pointer/key/touch/form input/navigation — the only thing that resets the idle clock), the idle
timeout, and the absolute 8 h cap. The 300 s access-token lifespan is deliberately **not** a
warning trigger: it renews itself, so warning on it would fire every ~4 minutes about a
non-event.

A bar appears ≥60 s before the deadline with **Continue session** (which asks Keycloak through
the same cross-tab refresh lock — it never assumes) and **Sign in again**. When the deadline
passes, a modal `alertdialog` locks the page **without unmounting it**: route, scroll, filters
and half-typed forms all survive, and a request gate in `shared/api` blocks any call the mounted
page might still attempt. At the 8 h cap no extend action is offered, because none exists.

Activity is broadcast between tabs (throttled), so working in one keeps the others alive; a
successful continue unlocks all of them. A peer's _token renewal_ does not unlock a locked tab —
only a verified continue does.

### Six distinct states

Warning, session ended (three reasons: paused after inactivity · reached its time limit ·
expired), signed out, sign-in failed, and 403 are separate renders with separate copy — 403
explicitly says you _are_ signed in and that authorization policy denied the request. An
advisory idle lock never claims Keycloak ended the session.

### Development identity (not authentication)

`VITE_DEV_AUTH=mock` (dev builds only) keeps the Phase 1 fixture identity so UI work needs no
Keycloak: fixtures for the four composite roles, a header **DEV role switcher**, initial role
from `VITE_DEV_ROLE`. It creates no tokens and simulates no authorization. `VITE_DEV_AUTH=oidc`
switches a dev build to the real flow.

**Production cannot reach it.** `useMockIdentity` is `env.isDev && …`, and `env.isDev` is
statically `false` in production builds, so the dev branch — provider, fixtures, switcher — is
tree-shaken out. Verified against `dist/` (no fixture subjects, no switcher, no mock identity
strings) and asserted by a test.

## Manual two-tab renewal verification

Automated tests cover the coordinator deterministically, but the realm's revoke-on-reuse
behavior must also be seen against real Keycloak. **Status: not yet executed — Docker is
unusable on this machine.** Run this on a Docker-capable machine before building on Phase 2.

Setup: start the stack (`docker/scripts/e2e-local.sh` — Keycloak on `:8081`, gateway on `:8080`),
then `VITE_DEV_AUTH=oidc npm run dev`. Seeded users live in the realm export
(`alice.employee`, `mark.manager`, `hana.hr`, `adam.admin`). Never paste real tokens into notes
or commits.

1. Open Tab A at `http://localhost:5173`; you land on `/login`.
2. Sign in. Confirm you return to the route you started on and the sidebar matches the role.
3. Open Tab B in the same browser profile at the same origin.
4. Confirm Tab B is authenticated **without a second login** and shows the same user menu
   identity. In DevTools → Application, confirm no token appears in Local Storage, Session
   Storage, IndexedDB, or Cookies for the app origin.
5. In both tabs open DevTools → Network, filter on `token`.
6. Wait out the access token (300 s), or force it: in Keycloak set the realm's _Access Token
   Lifespan_ to 1 minute for the test (a safe, reversible development-only change).
7. Drive activity in both tabs at the same time (navigate, or refresh a page) around the renewal
   moment.
8. **Expect exactly one `POST …/protocol/openid-connect/token` with `grant_type=refresh_token`
   across BOTH tabs.** Two would mean the lock failed. In Application → Background Services you
   can also watch the `eah:auth:refresh` Web Lock being held by one tab only.
9. Confirm the other tab keeps working with no request of its own — it adopted the broadcast.
10. Confirm both tabs remain authenticated and no request returns 401.
11. Simulate refresh failure: in Keycloak, Sessions → sign out the user's session (or delete it),
    then trigger activity in both tabs.
12. **Expect both tabs to show "Your session has expired"** — not a blank shell, not a redirect
    loop, and not one tab still pretending to be signed in.
13. Sign in again, then sign out from Tab A's user menu.
14. **Expect Tab B to leave the protected UI too** ("You have signed out" on `/login`).
15. Sign in once more and confirm protected navigation, including a role-restricted route
    (`/approvals` as `mark.manager`) and a denial (`/approvals` as `alice.employee` → `/403`).
16. **Third-party cookies.** Reload a signed-in tab with third-party cookies blocked (Safari by
    default; Chrome DevTools → Settings → Preferences → "Block third-party cookies"). Silent
    restore runs in an iframe against the Keycloak origin, so it may return `login_required`
    even though the SSO session is alive — the honest outcome is `/login` with one click to
    continue, **not** an error or a redirect loop. Record what you observe: if the click-through
    is common in the target browsers, a top-level redirect fallback should be considered.
17. **Idle timeout.** Leave a tab hidden (switch to another tab/window) for >30 minutes, then
    return. Expect the locked page under the ended-session overlay — the SPA deliberately does
    **not** renew while hidden, so the realm's `ssoSessionIdleTimeout` actually applies. Confirm
    no refresh requests were made while the tab was hidden.
18. **Expiry warning + continue.** Set `VITE_SESSION_IDLE_TIMEOUT_SECONDS=120` and
    `VITE_SESSION_WARNING_SECONDS=60`, sign in, type into a form, then stop touching the page.
    **Expect** the warning bar at 60 s with a live countdown, the page still usable underneath,
    and one refresh-token call when you press **Continue session** — after which the bar
    disappears and the typed text is still there. Then let it run out: the overlay appears, the
    page underneath is intact, and the Network tab shows **no** further API calls.
19. **Cross-tab idle.** With the same short timeout, open two tabs, keep working in Tab A only.
    **Expect** Tab B never to warn (it adopts A's activity). Then idle both out and press
    **Continue session** in one — **expect** both to unlock.

Run this check before merging any change to the auth code, and restore any Keycloak lifespan you
changed. Note that **Keycloak-side single logout** is a separate concern: step 14 verifies the
SPA's own cross-tab propagation, not back-channel logout.

## Testing

Vitest + React Testing Library + MSW (+ vitest-axe). MSW speaks the real contracts
(`auth/me` probe shape, notification count, RFC 7807 problems with `X-Correlation-Id`) and
**rejects any unhandled request** — tests can never touch a live backend. Suite covers:
bootstrap, shell landmarks + skip link, role-shaped navigation per role, active route,
keyboard navigation, mobile drawer focus management, dev role switching, error boundary,
404, primitives, the API client/normalizer, env validation, and the design-token contract.

Phase 2 adds, without a network or a real Keycloak (`fakeUserManager`, in-process Web Locks and
channel fakes in `src/features/auth/test-support.ts`):

- **Claims → identity** per role, composite expansion, realm-internal roles dropped.
- **Return-path sanitizer** — absolute URLs, `//host`, `/\host`, and auth routes all rejected.
- **Cross-tab coordinator** — single-flight, one-tab-refreshes/other-adopts, success and failure
  propagation, lock timeout failing safe, logout propagation, session handoff, degraded mode.
- **Provider** — bootstrap states, handoff adoption, login/callback/logout, peer events, the
  renewal seam, and a check that no store or cookie contains a token.
- **401 renew-and-replay** — one renewal, one replay, shared across concurrent 401s, mutation
  replay, and no renewal on 403/422 or without a registered renewer.
- **Guards** — every role × every guarded route over the real route tree, 403 semantics.
- **Auth UX** — bootstrap splash (no shell flash), login entry, sign-out vs expiry vs callback
  failure, sanitized protocol errors, with `vitest-axe` on each.
- **Session timeout** — the idle model in isolation (phases, what counts as activity, throttling,
  the absolute cap, render economy) and end-to-end through the provider: the warning threshold,
  continue-session success/refusal/unreachable, the lock overlay above a preserved page with its
  unsaved input, focus trap and Escape refusal, the blocked request gate, route-carrying
  re-authentication, phone layout, and cross-tab activity/lock/recovery/logout propagation.

## Surfaces

Every route in the approved sitemap resolves to a real page. Guards are UX only — the server
authorizes every request, and each guard names exactly the roles its endpoints are annotated with.

| Page                             | Route                                    | Roles          | Backed by                                                                      |
| -------------------------------- | ---------------------------------------- | -------------- | ------------------------------------------------------------------------------ |
| Dashboard                        | `/`                                      | all            | own leave/expense/notification reads; manager and HR/ADMIN tiers add their own |
| My leave · balance · detail      | `/leave`, `/leave/balance`, `/leave/:id` | all            | `/api/leave/**`                                                                |
| My expenses · detail             | `/expenses`, `/expenses/:id`             | all            | `/api/expenses/**`                                                             |
| Documents                        | `/documents`                             | all            | `/api/documents/**` (server-scoped by FR-41)                                   |
| Notifications                    | `/notifications`                         | all            | `/api/hr/notifications/**`                                                     |
| Profile                          | `/account/profile`                       | all            | `/api/hr/me`, `/api/hr/auth/me`                                                |
| My sessions                      | `/account/sessions`                      | all            | `/api/hr/sessions/**`                                                          |
| Approvals                        | `/approvals`                             | **MANAGER**    | `leave/requests/inbox`, `expenses/pending`                                     |
| My team                          | `/team`                                  | **MANAGER**    | `/api/hr/me/team`                                                              |
| Employee directory · detail      | `/hr/employees`, `/hr/employees/:id`     | **HR · ADMIN** | `/api/hr/employees/**`, all 13 `/api/hr/admin/**` identity actions             |
| Departments · Positions          | `/hr/departments`, `/hr/positions`       | **HR · ADMIN** | `/api/hr/departments\|positions/**`                                            |
| **Leave administration (P20)**   | `/hr/leave`                              | **HR · ADMIN** | `leave/requests/escalated`, `GET\|PUT leave/balances/{employeeId}`             |
| **Expense administration (P21)** | `/hr/expenses`                           | **HR · ADMIN** | `expenses/escalated\|second-approval\|search`, `GET\|PUT expenses/threshold`   |
| Document admin                   | `/hr/documents`                          | **HR · ADMIN** | `/api/documents/**` incl. multipart upload                                     |
| Audit Center                     | `/hr/audit`                              | **HR · ADMIN** | `/api/hr/audit/**` incl. CSV export                                            |
| Analytics                        | `/analytics`                             | **HR · ADMIN** | `/api/analytics/**`                                                            |
| Document categories              | `/admin/document-categories`             | **ADMIN**      | `/api/documents/categories/**`                                                 |

`/approvals` and `/team` are MANAGER-only because the endpoints are: HR and Admin users without
that role get 403, so the pages are not offered to them. `/admin/document-categories` is
ADMIN-only because every write on `DocumentCategoryController` is.

### Standards every page follows

`DataTable` (server paging, whitelisted sorts only, URL-synced state, priority-field cards below
`md`), `FormField` + RHF/Zod with server errors landing on the fields they name, `StatusBadge` as
the only status vocabulary, `ApprovalActions` (never optimistic; a 409 is a lost race, not a
failure), `ConfirmActionDialog` for anything destructive, `QueryStateBoundary` for the
403/404/502/503 split, and `AvailabilityGuard` wherever analytics can answer `available: false`.

**DTO types are transcribed, not generated.** `npm run generate:api` needs the services running
and Docker is unusable here, so `src/shared/types/` holds hand-written transcriptions of the Java
records — one place, backend names kept verbatim, deletable the moment generation can run. See
`src/shared/types/README.md`.

## Backend limitations the UI states rather than works around

These are verified against the Java sources, not assumed. Each one is a capability the product
would plausibly want and the backend does not publish; the UI says so where a user would look for
it, instead of faking it client-side.

| Limitation                                                                                                                                                                                                                                         | Where it shows                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **No global leave-request list.** `LeaveRequestController` exposes own / addressed-to-me / escalated only, each scope pinned in SQL. HR can open any request by id but cannot browse the trail.                                                    | `/hr/leave` states it             |
| **Leave has four statuses** (`SUBMITTED`, `APPROVED`, `REJECTED`, `CANCELLED`). There is no second-level approval and no expiry for leave — only expenses have `PENDING_SECOND_APPROVAL`.                                                          | leave surfaces offer neither      |
| **Neither leave nor expense joins the HR directory** for its list projections, so a row carries a Keycloak subject and no name. Rows show a shortened id with the full value on hover.                                                             | every queue                       |
| **`EmployeeResponse` carries no `provisioningStatus`** — accepted as a filter and a sort key, never returned per row. The directory derives Linked / Not linked from `keycloakId`.                                                                 | `/hr/employees`                   |
| ~~**No GET for `ProvisioningStatusResponse`**~~ — **resolved**: `GET /api/hr/admin/employees/{id}/identity` now returns it, so the Identity tab reads employment state and account state live instead of caching whatever an action last reported. | employee Identity tab             |
| **Provisioning is asynchronous and swallows its own failures**, so a create answers 201 with `keycloakId: null`, never 502.                                                                                                                        | employee create                   |
| **Notifications cannot be searched, sorted or filtered** — `NotificationController.sanitize` drops the sort and accepts no search.                                                                                                                 | `/notifications` offers none      |
| **The audit trail records no correlation id, role, IP, browser or session** — `AuditLogEntry` has five columns.                                                                                                                                    | Audit Center filter bar says so   |
| **The document category catalogue is HR/ADMIN-only**, so an employee cannot turn a category name into an id.                                                                                                                                       | category picker shown selectively |
| **documents-service publishes its upload policy on no endpoint** — size ceiling and MIME allowlist are mirrored into `VITE_DOCUMENT_*`; the server's 413/415 is still the only verdict.                                                            | uploader states the mirror        |
| **No bulk operations anywhere** — no endpoint accepts a set of ids, so no list offers multi-select.                                                                                                                                                | all queues                        |

## Deploying

```bash
npm ci
npm run build          # → dist/  (static assets, no server runtime)
npm run preview        # serve dist/ locally to check the production build
```

Three things that decide whether a deployment works:

1. **`VITE_*` variables are baked in at build time, not read at runtime.** Vite substitutes them
   into the bundle, so a `dist/` built for staging cannot be re-pointed at production by changing
   an environment variable on the host — **build once per environment**. `src/config/env.ts`
   validates them with Zod at boot, so a wrong build fails loudly on the first page rather than
   half-working. Nothing secret belongs in them; everything shipped to a browser is public.
2. **The host must serve `index.html` for unknown paths.** This is a client-routed SPA: a deep
   link like `/hr/audit` is not a file, and a 404 there is a broken bookmark, not a missing page.
3. **The origin must be registered in Keycloak and in the gateway's CORS allowlist**, or sign-in
   redirects and every API call fail. The realm authorizes `:5173/*` and `:3000/*` out of the box
   ([keycloak-config/realm-employee-hub.json](../keycloak-config/realm-employee-hub.json));
   any other origin has to be added there and in the gateway configuration together.

Assets are content-hashed and safe to cache indefinitely; `index.html` must not be
(`Cache-Control: no-cache`), or browsers keep loading the previous build's chunk names.

## What is deliberately absent

- **Generated OpenAPI types** — `npm run generate:api` once a backend can be reached.
- **E2E against a live stack** — `docker/scripts/e2e-local.sh` exists, but Docker is unusable on
  this machine, so the suite is not run here and is not claimed as verified.
- **Localization** — the locale is fixed to `en-GB` on purpose (an enterprise record should not
  change shape per reader); localization is post-v1.
- **Sidebar live-count pills** — the notification bell carries the unread count and no other
  surface publishes one, so no nav item claims a count it cannot keep current.
