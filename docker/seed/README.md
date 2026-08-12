# Demo dataset — "Atlas Numeris"

A synthetic Moroccan IT-services company (~300 employees) loaded into the running
dev stack, so every screen, filter, role check and business rule can be exercised
against data that looks like a real internal HR/IAM database instead of
`Employee 1 … Employee 300`.

> **Development tool.** It writes to the compose databases, creates Keycloak
> accounts with one shared well-known password, and refuses a non-local Keycloak
> host unless `--force` is passed. Never point it at staging or production.

```bash
make up            # the stack must be running
make seed-reset    # wipe any previous dataset and generate a fresh one
make seed          # add to whatever is already there
```

`make smoke` is unaffected: the four realm fixtures (`alice.employee`,
`mark.manager`, `hana.hr`, `adam.admin`) are never created, renamed or deleted
here, and no schema, service or test is touched.

## Seeing it in the SPA

`web-portal/.env.development` ships `VITE_DEV_AUTH=mock`, which serves a fixture identity and
never talks to Keycloak — so the portal shows nothing of this dataset until you switch it:

```bash
echo 'VITE_DEV_AUTH=oidc' >> web-portal/.env.development.local
cd web-portal && npm run dev        # http://localhost:5173, sign in as any account below
```

The realm's `web-portal` client already authorises `http://localhost:5173/*`. Switch back by
deleting the override; mock mode keeps working with no stack running.

## The company

| | |
|---|---|
| Name | Atlas Numeris (fictional) |
| Email domain | `atlas-numeris.ma` (fictional) |
| Industry | Technology / Digital Services / IT Consulting |
| Head office | Casablanca; also Rabat, Marrakech, Tanger, Agadir, Fès, Kénitra, Tétouan, Oujda |

Employees are `prenom.nom@atlas-numeris.ma` with the matching Keycloak username
(`yassine.elmansouri`), de-duplicated with a numeric suffix when two people slug
to the same login. `matricule` carries the office as its prefix —
`CAS-2021-0147` — because `employee` has no city column and the schema is not
extended for demo data.

Names are drawn at random from ordinary Moroccan given/family name pools and are
therefore synthetic pairings, not real people; a small blocklist keeps a draw
from landing on a widely recognisable public figure. Nothing in the dataset is a
real-world identifier: there is no CIN, passport, phone, address or bank detail
anywhere — the schema has no column for any of them and none is invented.

## What gets generated

| Area | Shape |
|---|---|
| Organisation | 16 departments, ~88 job titles, one reporting tree: CEO → department heads → team managers → individual contributors |
| Roles | `ADMIN` ×2, `HR` ×6, `MANAGER` ~30 (derived from having direct reports, as `RealmRoleResolver` does), `EMPLOYEE` for the rest |
| Lifecycle | ~90% `ACTIVE`, ~5% `DISABLED`, ~5% `TERMINATED`, plus a few `NOT_PROVISIONED` (new hires), `FAILED` (retryable) and `LOCKED` accounts |
| Leave | ~500 requests over two calendar years across `SUBMITTED / APPROVED / REJECTED / CANCELLED`, with per-year balances that match the approved annual days |
| Expenses | ~750 claims across all six categories, including a slice above the approval threshold sitting in `PENDING_SECOND_APPROVAL` |
| Documents | ~400 records over six categories (the three Flyway tiers plus three added ones); ~30% have real bytes on the volume, the rest are deliberately metadata-only |
| Trails | Notifications, HR/leave/expense/document audit logs, provisioning history and security events — all with the action names and copy the services themselves write |

## Coherence

The rows are written straight into the schemas, so the generator enforces the
same invariants the services do and the seeder verifies them afterwards
(`== Verifying coherence` in the output). Among them:

* no orphan employee, manager, department, position, owner or recipient
* no duplicate email, matricule or Keycloak subject; exactly one employee (the
  CEO) without a manager, and nobody managing themselves
* no manager is `DISABLED` or `TERMINATED`
* leave: single calendar year per request, Monday–Friday business days, BR-01
  (approved annual days never exceed the allocation), BR-03 (no overlapping
  approved periods), BR-02 routing (`hr_escalated` ⇔ no manager subject), and no
  self-decision
* expenses: never dated in the future, always positive, one deployment currency,
  `second_approval_required` only above the threshold, and a second approver who
  is neither the owner nor the first approver

A failing check exits non-zero and names the offending count.

## Currency

The expense context has a single deployment currency and the BR-03 threshold
comparison refuses to mix currencies, so the dataset uses the currency the
project already ships — **EUR**, threshold 1000.00 — which also fits a Moroccan
nearshore services company billing European clients. To run the demo in dirhams,
pass `--currency MAD --threshold 10000`: the seeder updates the
`expense_settings` row in the same pass, so claims and threshold stay in the same
currency. No business rule is changed either way.

## Options

`bash docker/scripts/seed-demo-data.sh --help` lists everything. The ones that
matter:

| Flag | Effect |
|---|---|
| `--reset` | delete previously seeded rows and `@atlas-numeris.ma` accounts first |
| `--seed N` | change the RNG seed — same seed, same company |
| `--dry-run --sql-out DIR` | generate and write the SQL without touching Keycloak or any database |
| `--skip-keycloak` | reuse the subjects already stored in `hr.employee` |
| `--password` | password for every generated account (default `Test1234!`) |
| `--currency` / `--threshold` | deployment currency and BR-03 threshold |

## Files

| File | Role |
|---|---|
| `company.py` | company identity, departments, job catalogue, name pools, business vocabularies |
| `dataset.py` | deterministic generation of the org and its activity — pure, no I/O |
| `emit.py` | SQL for the four service databases (no DDL, Flyway-owned rows untouched) |
| `keycloak_admin.py` | minimal Keycloak Admin REST client (standard library only) |
| `seed.py` | CLI: generate → provision → load → materialise blobs → verify |
