#!/usr/bin/env python3
"""
Seed the Employee Access Hub dev stack with the Atlas Numeris demo dataset.

    python3 docker/seed/seed.py --reset

What it does, in order:

  1. generates the organisation (departments, positions, ~300 employees, tree)
  2. creates the matching accounts in Keycloak and reads back their subject ids
  3. generates the business activity that references those subjects
  4. writes the rows into the four service databases through `psql`
  5. materialises the document blobs that are not metadata-only
  6. verifies the result and prints a coherence report

Development tool. It talks to the local compose stack, writes to development
databases, and gives every generated account the same well-known password —
never point it at anything but a dev environment. It refuses non-local hosts
unless `--force` is given, never touches the four realm fixture users
(alice.employee / mark.manager / hana.hr / adam.admin) and never changes a
schema, a service or a test.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import company  # noqa: E402
import dataset  # noqa: E402
import emit  # noqa: E402
from keycloak_admin import KeycloakAdmin, KeycloakError  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
COMPOSE_FILE = REPO_ROOT / "docker" / "docker-compose.yml"
ENV_FILE = REPO_ROOT / ".env"
DOCUMENTS_VOLUME_PATH = "/var/lib/hub/documents"
DATABASES = ["hr", "leave", "expense", "documents"]
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal"}
#: Realm fixtures from keycloak-config — never created, updated or deleted here.
FIXTURE_USERNAMES = {"alice.employee", "mark.manager", "hana.hr", "adam.admin"}


# ── small utilities ─────────────────────────────────────────────────────────


def read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def log(message: str) -> None:
    print(message, flush=True)


def step(message: str) -> None:
    print(f"\n\033[1m== {message}\033[0m", flush=True)


class Psql:
    """Runs SQL in a compose-hosted PostgreSQL through `docker compose exec`."""

    def __init__(self, user: str, compose_file: Path, env_file: Path):
        self.base = [
            "docker", "compose", "-f", str(compose_file), "--env-file", str(env_file),
            "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", user,
        ]

    def run_script(self, database: str, sql: str) -> None:
        result = subprocess.run(
            self.base + ["-d", database, "-q", "-f", "-"],
            input=sql, text=True, capture_output=True,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"psql failed on database '{database}':\n"
                f"{result.stderr.strip()[-4000:]}"
            )

    def query(self, database: str, sql: str) -> list[list[str]]:
        result = subprocess.run(
            self.base + ["-d", database, "-t", "-A", "-F", "\x1f", "-c", sql],
            text=True, capture_output=True,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"query failed on '{database}': {result.stderr.strip()[-2000:]}")
        rows = []
        for line in result.stdout.splitlines():
            if line.strip() == "":
                continue
            rows.append(line.split("\x1f"))
        return rows

    def scalar(self, database: str, sql: str) -> str:
        rows = self.query(database, sql)
        return rows[0][0] if rows else ""


# ── Keycloak phase ──────────────────────────────────────────────────────────


def provision_identities(org: dataset.Org, admin: KeycloakAdmin, password: str) -> int:
    """Create/refresh one account per employee that should hold an identity."""
    targets = [e for e in org.employees if e.wants_identity]
    total = len(targets)
    created = 0
    for index, employee in enumerate(targets, start=1):
        if employee.username in FIXTURE_USERNAMES:
            raise RuntimeError(
                f"generated username {employee.username} collides with a realm fixture")
        subject = admin.create_user(
            username=employee.username,
            email=employee.email,
            first_name=employee.first_name,
            last_name=employee.last_name,
            enabled=employee.keycloak_enabled,
        )
        admin.set_password(subject, password, temporary=False)
        admin.assign_realm_role(subject, employee.realm_role)
        employee.keycloak_id = subject
        created += 1
        if index % 25 == 0 or index == total:
            log(f"   {index}/{total} accounts provisioned")
    return created


def purge_identities(admin: KeycloakAdmin, domain: str) -> int:
    """Delete previously seeded accounts — scoped to the demo email domain."""
    victims = [
        user for user in admin.list_users_by_email_domain(domain)
        if user.get("username") not in FIXTURE_USERNAMES
    ]
    for user in victims:
        admin.delete_user(user["id"])
    return len(victims)


# ── document blobs ──────────────────────────────────────────────────────────


def materialise_blobs(documents, compose_file: Path, env_file: Path) -> tuple[int, str]:
    """Copy the generated blobs into the documents volume; returns (count, note)."""
    with_bytes = [d for d in documents if d.body is not None]
    if not with_bytes:
        return 0, "no blobs to write"
    staging = Path(tempfile.mkdtemp(prefix="hub-seed-docs-"))
    try:
        for document in with_bytes:
            target = staging / document.storage_key
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(document.body)
        copy = subprocess.run(
            ["docker", "compose", "-f", str(compose_file), "--env-file", str(env_file),
             "cp", f"{staging}/.", f"documents-service:{DOCUMENTS_VOLUME_PATH}/"],
            text=True, capture_output=True,
        )
        if copy.returncode != 0:
            return 0, f"docker compose cp failed: {copy.stderr.strip()[-500:]}"
        return len(with_bytes), "copied into the documents-service volume"
    finally:
        shutil.rmtree(staging, ignore_errors=True)


# ── verification ────────────────────────────────────────────────────────────


class Report:
    def __init__(self):
        self.checks: list[tuple[str, bool, str]] = []

    def check(self, name: str, ok: bool, detail: str = "") -> None:
        self.checks.append((name, ok, detail))

    def expect_zero(self, name: str, value: str, detail: str = "") -> None:
        count = int(value or 0)
        self.check(name, count == 0, detail if count == 0 else f"{count} offending row(s)")

    @property
    def failures(self) -> int:
        return sum(1 for _, ok, _ in self.checks if not ok)

    def render(self) -> str:
        width = max(len(name) for name, _, _ in self.checks)
        lines = []
        for name, ok, detail in self.checks:
            mark = "PASS" if ok else "FAIL"
            lines.append(f"  {mark}  {name.ljust(width)}  {detail}")
        return "\n".join(lines)


def verify(psql: Psql, threshold: float) -> tuple[Report, dict[str, str]]:
    report = Report()

    subjects = {row[0] for row in psql.query(
        "hr", 'select "keycloak_id" from "hr"."employee" where "keycloak_id" is not null')}
    employee_ids = {row[0] for row in psql.query("hr", 'select "id" from "hr"."employee"')}

    counts = {
        "departments": psql.scalar("hr", 'select count(*) from "hr"."department"'),
        "positions": psql.scalar("hr", 'select count(*) from "hr"."position"'),
        "employees": psql.scalar("hr", 'select count(*) from "hr"."employee"'),
        "notifications": psql.scalar("hr", 'select count(*) from "hr"."notification"'),
        "provisioning_records": psql.scalar("hr", 'select count(*) from "hr"."provisioning_record"'),
        "security_events": psql.scalar("hr", 'select count(*) from "hr"."security_event"'),
        "hr_audit": psql.scalar("hr", 'select count(*) from "hr"."audit_log"'),
        "leave_requests": psql.scalar("leave", 'select count(*) from "leave"."leave_request"'),
        "leave_balances": psql.scalar("leave", 'select count(*) from "leave"."leave_balance"'),
        "leave_audit": psql.scalar("leave", 'select count(*) from "leave"."audit_log"'),
        "expenses": psql.scalar("expense", 'select count(*) from "expense"."expense"'),
        "expense_audit": psql.scalar("expense", 'select count(*) from "expense"."audit_log"'),
        "document_categories": psql.scalar("documents", 'select count(*) from "documents"."document_category"'),
        "documents": psql.scalar("documents", 'select count(*) from "documents"."document"'),
        "documents_audit": psql.scalar("documents", 'select count(*) from "documents"."audit_log"'),
    }

    # ── HR: identity, hierarchy, uniqueness ─────────────────────────────────
    report.expect_zero("no employee is their own manager", psql.scalar(
        "hr", 'select count(*) from "hr"."employee" where "manager_id" = "id"'))
    report.expect_zero("no duplicate email", psql.scalar(
        "hr", 'select count(*) from (select lower("email") e from "hr"."employee" '
              'group by 1 having count(*) > 1) x'))
    report.expect_zero("no duplicate matricule", psql.scalar(
        "hr", 'select count(*) from (select "matricule" from "hr"."employee" '
              'group by 1 having count(*) > 1) x'))
    report.expect_zero("no duplicate keycloak subject", psql.scalar(
        "hr", 'select count(*) from (select "keycloak_id" from "hr"."employee" '
              'where "keycloak_id" is not null group by 1 having count(*) > 1) x'))
    report.expect_zero("no dangling manager reference", psql.scalar(
        "hr", 'select count(*) from "hr"."employee" e where e."manager_id" is not null '
              'and not exists (select 1 from "hr"."employee" m where m."id" = e."manager_id")'))
    report.expect_zero("every employee has a real department", psql.scalar(
        "hr", 'select count(*) from "hr"."employee" e where not exists '
              '(select 1 from "hr"."department" d where d."id" = e."department_id")'))
    report.expect_zero("every employee has a real position", psql.scalar(
        "hr", 'select count(*) from "hr"."employee" e where not exists '
              '(select 1 from "hr"."position" p where p."id" = e."position_id")'))
    report.expect_zero("provisioned employees carry a subject", psql.scalar(
        "hr", "select count(*) from \"hr\".\"employee\" where \"provisioning_status\" in "
              "('PROVISIONED','LOCKED','DISABLED') and \"keycloak_id\" is null"))
    report.expect_zero("unprovisioned employees carry no subject", psql.scalar(
        "hr", "select count(*) from \"hr\".\"employee\" where \"provisioning_status\" in "
              "('NOT_PROVISIONED','FAILED') and \"keycloak_id\" is not null"))
    report.expect_zero("no manager is terminated or disabled", psql.scalar(
        "hr", "select count(*) from \"hr\".\"employee\" m where m.\"status\" <> 'ACTIVE' "
              'and exists (select 1 from "hr"."employee" e where e."manager_id" = m."id")'))
    report.check("exactly one employee without a manager",
                 psql.scalar("hr", 'select count(*) from "hr"."employee" '
                                   'where "manager_id" is null') == "1",
                 "the CEO")
    report.expect_zero("notifications address a known subject", str(len(
        {row[0] for row in psql.query("hr", 'select distinct "recipient_id" from "hr"."notification"')}
        - subjects)))
    report.expect_zero("provisioning history references known employees", str(len(
        {row[0] for row in psql.query(
            "hr", 'select distinct "employee_id" from "hr"."provisioning_record"')} - employee_ids)))

    # ── leave ───────────────────────────────────────────────────────────────
    report.expect_zero("leave requests belong to known subjects", str(len(
        {row[0] for row in psql.query(
            "leave", 'select distinct "employee_keycloak_id" from "leave"."leave_request"')}
        - subjects)))
    report.expect_zero("leave requests reference known employees", str(len(
        {row[0] for row in psql.query(
            "leave", 'select distinct "employee_id" from "leave"."leave_request"')} - employee_ids)))
    report.expect_zero("leave deciders are known subjects", str(len(
        {row[0] for row in psql.query(
            "leave", 'select distinct "decided_by" from "leave"."leave_request" '
                     'where "decided_by" is not null')} - subjects)))
    report.expect_zero("nobody decided their own leave", psql.scalar(
        "leave", 'select count(*) from "leave"."leave_request" '
                 'where "decided_by" = "employee_keycloak_id"'))
    report.expect_zero("BR-02 routing is consistent", psql.scalar(
        "leave", 'select count(*) from "leave"."leave_request" where '
                 '("hr_escalated" and "manager_keycloak_id" is not null) or '
                 '(not "hr_escalated" and "manager_keycloak_id" is null)'))
    report.expect_zero("BR-03: no overlapping approved leave", psql.scalar(
        "leave", 'select count(*) from "leave"."leave_request" a '
                 'join "leave"."leave_request" b on a."employee_keycloak_id" = '
                 'b."employee_keycloak_id" and a."id" < b."id" '
                 "where a.\"status\" = 'APPROVED' and b.\"status\" = 'APPROVED' "
                 'and a."start_date" <= b."end_date" and a."end_date" >= b."start_date"'))
    report.expect_zero("no leave request spans two years", psql.scalar(
        "leave", 'select count(*) from "leave"."leave_request" '
                 'where extract(year from "start_date") <> extract(year from "end_date")'))
    report.expect_zero("BR-01: used days never exceed the allocation", psql.scalar(
        "leave", 'select count(*) from "leave"."leave_balance" where "used_days" > "total_days"'))
    report.expect_zero("balances match approved annual leave", psql.scalar(
        "leave",
        'select count(*) from "leave"."leave_balance" b where b."used_days" <> coalesce(('
        'select sum(r."business_days") from "leave"."leave_request" r '
        'where r."employee_keycloak_id" = b."employee_keycloak_id" '
        "and r.\"status\" = 'APPROVED' and r.\"leave_type\" = 'ANNUAL' "
        'and extract(year from r."start_date") = b."balance_year"), 0)'))
    report.expect_zero("every approved annual leave has a balance row", psql.scalar(
        "leave",
        'select count(*) from "leave"."leave_request" r where '
        "r.\"status\" = 'APPROVED' and r.\"leave_type\" = 'ANNUAL' and not exists ("
        'select 1 from "leave"."leave_balance" b '
        'where b."employee_keycloak_id" = r."employee_keycloak_id" '
        'and b."balance_year" = extract(year from r."start_date"))'))

    # ── expenses ────────────────────────────────────────────────────────────
    report.expect_zero("expenses belong to known subjects", str(len(
        {row[0] for row in psql.query(
            "expense", 'select distinct "employee_keycloak_id" from "expense"."expense"')}
        - subjects)))
    report.expect_zero("expenses reference known employees", str(len(
        {row[0] for row in psql.query(
            "expense", 'select distinct "employee_id" from "expense"."expense"')} - employee_ids)))
    report.expect_zero("nobody decided their own expense", psql.scalar(
        "expense", 'select count(*) from "expense"."expense" '
                   'where "decided_by" = "employee_keycloak_id" '
                   'or "first_approver_keycloak_id" = "employee_keycloak_id"'))
    report.expect_zero("BR-03: second approval only above the threshold", psql.scalar(
        "expense", f'select count(*) from "expense"."expense" '
                   f'where "second_approval_required" and "amount" <= {threshold:.2f}'))
    report.expect_zero("BR-03: second approver differs from the first", psql.scalar(
        "expense", 'select count(*) from "expense"."expense" where "second_approval_required" '
                   "and \"status\" = 'APPROVED' and \"decided_by\" = \"first_approver_keycloak_id\""))
    report.expect_zero("pending second approval has a first approver", psql.scalar(
        "expense", "select count(*) from \"expense\".\"expense\" where "
                   "\"status\" = 'PENDING_SECOND_APPROVAL' and "
                   '("first_approver_keycloak_id" is null or "decided_by" is not null)'))
    report.expect_zero("no expense is dated in the future", psql.scalar(
        "expense", 'select count(*) from "expense"."expense" where "expense_date" > current_date'))
    report.expect_zero("every expense amount is positive", psql.scalar(
        "expense", 'select count(*) from "expense"."expense" where "amount" <= 0'))
    report.expect_zero("one deployment currency", str(
        max(0, len(psql.query("expense", 'select distinct "currency" from "expense"."expense"')) - 1)))

    # ── documents ───────────────────────────────────────────────────────────
    report.expect_zero("documents belong to known subjects", str(len(
        {row[0] for row in psql.query(
            "documents", 'select distinct "owner_keycloak_id" from "documents"."document" '
                         'where "owner_keycloak_id" is not null')} - subjects)))
    report.expect_zero("every document has a real category", psql.scalar(
        "documents", 'select count(*) from "documents"."document" d where not exists '
                     '(select 1 from "documents"."document_category" c where c."id" = d."category_id")'))
    report.expect_zero("every document has a storage key", psql.scalar(
        "documents", 'select count(*) from "documents"."document" '
                     "where \"storage_key\" is null or \"storage_key\" = ''"))

    return report, counts


def distribution(psql: Psql) -> str:
    lines = []
    lines.append("  employee status:")
    for row in psql.query("hr", 'select "status", count(*) from "hr"."employee" '
                                'group by 1 order by 2 desc'):
        lines.append(f"    {row[0]:<16} {row[1]:>4}")
    lines.append("  provisioning status:")
    for row in psql.query("hr", 'select "provisioning_status", count(*) from "hr"."employee" '
                                'group by 1 order by 2 desc'):
        lines.append(f"    {row[0]:<16} {row[1]:>4}")
    lines.append("  leave request status:")
    for row in psql.query("leave", 'select "status", count(*) from "leave"."leave_request" '
                                   'group by 1 order by 2 desc'):
        lines.append(f"    {row[0]:<16} {row[1]:>4}")
    lines.append("  expense status:")
    for row in psql.query("expense", 'select "status", count(*) from "expense"."expense" '
                                     'group by 1 order by 2 desc'):
        lines.append(f"    {row[0]:<24} {row[1]:>4}")
    lines.append("  headcount by department:")
    for row in psql.query("hr", 'select d."name", count(*) from "hr"."employee" e '
                                'join "hr"."department" d on d."id" = e."department_id" '
                                'group by 1 order by 2 desc'):
        lines.append(f"    {row[0]:<32} {row[1]:>4}")
    return "\n".join(lines)


# ── CLI ─────────────────────────────────────────────────────────────────────


def main() -> int:
    env = read_env_file(ENV_FILE)
    parser = argparse.ArgumentParser(
        description="Seed the dev stack with the Atlas Numeris synthetic dataset.")
    parser.add_argument("--seed", type=int, default=20260811,
                        help="RNG seed — the same seed yields the same company")
    parser.add_argument("--keycloak-url", default=os.environ.get("KC_URL", "http://localhost:8081"))
    parser.add_argument("--realm", default=env.get("KEYCLOAK_REALM", "employee-hub"))
    parser.add_argument("--admin-user", default=env.get("KC_BOOTSTRAP_ADMIN_USERNAME", "admin"))
    parser.add_argument("--admin-password", default=env.get("KC_BOOTSTRAP_ADMIN_PASSWORD", ""))
    parser.add_argument("--password", default=os.environ.get("HUB_DEMO_PASSWORD", "Test1234!"),
                        help="password given to every generated account (dev only)")
    parser.add_argument("--postgres-user", default=env.get("POSTGRES_USER", "keycloak"))
    parser.add_argument("--currency", default="EUR",
                        help="deployment currency; also written to expense_settings")
    parser.add_argument("--threshold", type=float, default=1000.00,
                        help="BR-03 second-approval threshold written to expense_settings")
    parser.add_argument("--history-months", type=int, default=18)
    parser.add_argument("--reset", action="store_true",
                        help="delete previously seeded rows and accounts first")
    parser.add_argument("--skip-keycloak", action="store_true",
                        help="reuse the subjects already stored in hr.employee")
    parser.add_argument("--skip-blobs", action="store_true")
    parser.add_argument("--sql-out", type=Path, default=None,
                        help="also write the generated SQL to this directory")
    parser.add_argument("--dry-run", action="store_true",
                        help="generate and write SQL only — no Keycloak, no database")
    parser.add_argument("--force", action="store_true",
                        help="allow a non-local Keycloak host (never do this in production)")
    args = parser.parse_args()

    host = re.sub(r"^https?://", "", args.keycloak_url).split(":")[0].split("/")[0]
    if host not in LOCAL_HOSTS and not args.force:
        log(f"refusing to seed a non-local Keycloak host ({host}); pass --force to override")
        return 2

    now = datetime.now(timezone.utc).replace(microsecond=0)

    step(f"Generating {company.COMPANY_NAME} (seed {args.seed})")
    org = dataset.generate_org(args.seed, now, args.history_months)
    roles: dict[str, int] = {}
    for employee in org.employees:
        roles[employee.realm_role] = roles.get(employee.realm_role, 0) + 1
    log(f"   {len(org.employees)} employees, {len(org.departments)} departments, "
        f"{len(org.positions)} positions")
    log("   realm roles: " + ", ".join(f"{role}={count}" for role, count in sorted(roles.items())))

    if args.dry_run:
        step("Dry run — assigning placeholder subjects")
        import uuid as _uuid
        for index, employee in enumerate(org.employees):
            if employee.wants_identity:
                employee.keycloak_id = str(_uuid.UUID(int=index + 1, version=4))
    else:
        admin = KeycloakAdmin(args.keycloak_url, args.realm,
                              args.admin_user, args.admin_password)
        if not args.skip_keycloak:
            step(f"Keycloak — realm '{args.realm}' at {args.keycloak_url}")
            if not args.admin_password:
                log("   KC_BOOTSTRAP_ADMIN_PASSWORD is empty; set it in .env or pass "
                    "--admin-password")
                return 2
            if not admin.realm_exists():
                log(f"   realm '{args.realm}' is not reachable — is the stack up?")
                return 2
            if args.reset:
                removed = purge_identities(admin, company.COMPANY_DOMAIN)
                log(f"   removed {removed} previously seeded account(s)")
            provision_identities(org, admin, args.password)
        else:
            step("Keycloak — skipped, reusing the subjects stored in hr.employee")
            psql = Psql(args.postgres_user, COMPOSE_FILE, ENV_FILE)
            stored = {row[0]: row[1] for row in psql.query(
                "hr", 'select "email", "keycloak_id" from "hr"."employee" '
                      'where "keycloak_id" is not null')}
            for employee in org.employees:
                employee.keycloak_id = stored.get(employee.email)
            missing = [e for e in org.employees if e.wants_identity and not e.keycloak_id]
            if missing:
                log(f"   {len(missing)} employee(s) have no stored subject — run without "
                    "--skip-keycloak")
                return 2

    step("Generating business activity")
    activity = dataset.generate_activity(
        org, args.seed, now, currency=args.currency, threshold=args.threshold,
        history_months=args.history_months)
    log(f"   {len(activity.leave_requests)} leave requests, "
        f"{len(activity.leave_balances)} balances")
    log(f"   {len(activity.expenses)} expenses, {len(activity.documents)} documents")
    log(f"   {len(activity.notifications)} notifications, "
        f"{len(activity.hr_audit) + len(activity.leave_audit) + len(activity.expense_audit) + len(activity.document_audit)}"
        " audit entries")

    scripts = {
        "hr": emit.hr_sql(org, activity),
        "leave": emit.leave_sql(activity),
        "expense": emit.expense_sql(activity, args.currency, args.threshold),
        "documents": emit.documents_sql(activity),
    }

    if args.sql_out:
        args.sql_out.mkdir(parents=True, exist_ok=True)
        for name, sql in scripts.items():
            (args.sql_out / f"{name}.sql").write_text(sql, encoding="utf-8")
        log(f"   SQL written to {args.sql_out}")

    if args.dry_run:
        step("Dry run complete — nothing was written to Keycloak or the databases")
        return 0

    psql = Psql(args.postgres_user, COMPOSE_FILE, ENV_FILE)

    if args.reset:
        step("Clearing previously seeded rows")
        for database in reversed(DATABASES):
            psql.run_script(database, emit.reset_sql(database))
            log(f"   {database} cleared")

    step("Loading the dataset")
    for database in DATABASES:
        psql.run_script(database, scripts[database])
        log(f"   {database} loaded")

    if not args.skip_blobs:
        step("Materialising document blobs")
        written, note = materialise_blobs(activity.documents, COMPOSE_FILE, ENV_FILE)
        log(f"   {written} blob(s): {note}")
        metadata_only = sum(1 for d in activity.documents if d.body is None)
        log(f"   {metadata_only} document(s) intentionally metadata-only "
            "(their /content answers 404)")

    step("Verifying coherence")
    report, counts = verify(psql, args.threshold)
    log(report.render())
    log("")
    log("  row counts:")
    for name, value in counts.items():
        log(f"    {name:<22} {value:>6}")
    log("")
    log(distribution(psql))

    step("Sign in with")
    samples = {}
    for employee in org.employees:
        if employee.keycloak_id and employee.status == "ACTIVE" \
                and employee.provisioning_status == "PROVISIONED" \
                and employee.realm_role not in samples:
            samples[employee.realm_role] = employee
    for role in ("ADMIN", "HR", "MANAGER", "EMPLOYEE"):
        person = samples.get(role)
        if person:
            log(f"   {role:<9} {person.username:<34} {person.full_name} — "
                f"{person.position_title}")
    log(f"   password for every generated account: {args.password}")
    log("   the four realm fixtures (alice.employee / mark.manager / hana.hr / "
        "adam.admin) are untouched")

    if report.failures:
        step(f"{report.failures} coherence check(s) FAILED")
        return 1
    step("Seed complete — all coherence checks passed")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (KeycloakError, RuntimeError) as error:
        print(f"\nseed failed: {error}", file=sys.stderr)
        sys.exit(1)
