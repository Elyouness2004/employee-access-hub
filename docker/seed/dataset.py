"""
Deterministic generator for the Atlas Numeris demo dataset.

Pure computation: it produces in-memory records and never touches a database,
Keycloak or the filesystem. Given the same seed and the same "now" it produces
the same organisation, so a dataset can be regenerated and diffed.

Every invariant the services enforce is enforced here too, because the rows are
written straight into the schemas and must be states the application itself
could have produced:

* `DateRange.businessDays()`  — Monday–Friday, both bounds inclusive
* single calendar year per leave request (balances are per year)
* BR-01 — approved ANNUAL days never exceed the year's allocation
* BR-03 — an employee never holds two overlapping APPROVED leave periods
* BR-02 — no manager (or self-managed) ⇒ `hr_escalated`, `manager_keycloak_id` NULL
* no self-decision: `decided_by` is never the owner's own subject
* expense BR-03 — `second_approval_required` only above the settings threshold,
  and the second approver is HR/Admin and never the first approver
* expense dates are never in the future; amounts are strictly positive
* `RealmRoleResolver` — MANAGER is derived from having at least one direct
  report; HR and ADMIN are deliberate assignments, never derived

Two phases, because Keycloak assigns the subject ids:

    org = generate_org(...)          # departments, positions, employees
    ...assign employee.keycloak_id from Keycloak...
    activity = generate_activity(org, ...)   # everything that references a subject
"""

from __future__ import annotations

import math
import random
import unicodedata
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

import company

# ── Tunables ────────────────────────────────────────────────────────────────

#: A department with more than this many individual contributors gets a layer of
#: team managers under its head; below it, the head manages directly. Chosen so
#: the derived MANAGER population lands in the 25–35 range for ~300 employees.
TEAM_MANAGER_THRESHOLD = 15
TEAM_SPAN = 14

#: Default annual allocation — `hub.leave.default-annual-days` in leave-service.
DEFAULT_ANNUAL_DAYS = 25

#: Flyway-seeded document categories (V1__documents_core_tables.sql).
SEEDED_DOCUMENT_CATEGORIES = {
    "General": "cccccccc-0000-0000-0000-000000000001",
    "HR Confidential": "cccccccc-0000-0000-0000-000000000002",
    "Payroll": "cccccccc-0000-0000-0000-000000000003",
}

WORKDAY_START_HOUR = 7  # 08:00 in Casablanca (UTC+1)
WORKDAY_END_HOUR = 16  # 17:00 in Casablanca


# ── Records ─────────────────────────────────────────────────────────────────


@dataclass
class Department:
    id: str
    key: str
    name: str
    description: str
    created_at: datetime
    updated_at: datetime


@dataclass
class Position:
    id: str
    title: str
    description: str
    created_at: datetime
    updated_at: datetime


@dataclass
class Employee:
    id: str
    matricule: str
    first_name: str
    last_name: str
    email: str
    username: str
    site: str
    site_code: str
    hire_date: date
    status: str  # ACTIVE | DISABLED | TERMINATED
    provisioning_status: str  # NOT_PROVISIONED | PROVISIONED | FAILED | DISABLED | LOCKED
    manager_id: Optional[str]
    department_id: str
    position_id: str
    department_name: str
    position_title: str
    realm_role: str  # EMPLOYEE | MANAGER | HR | ADMIN
    created_at: datetime
    updated_at: datetime
    provisioned_at: Optional[datetime] = None
    last_sync_at: Optional[datetime] = None
    keycloak_id: Optional[str] = None
    keycloak_enabled: bool = True
    direct_reports: list[str] = field(default_factory=list)

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    @property
    def wants_identity(self) -> bool:
        """Whether this employee should hold a Keycloak account at all."""
        return self.provisioning_status not in ("NOT_PROVISIONED", "FAILED")


@dataclass
class Org:
    departments: list[Department]
    positions: list[Position]
    employees: list[Employee]
    by_id: dict[str, Employee]
    hr_people: list[Employee]
    admin_people: list[Employee]
    generated_at: datetime


@dataclass
class LeaveRequest:
    id: str
    employee_id: str
    employee_keycloak_id: str
    manager_keycloak_id: Optional[str]
    hr_escalated: bool
    leave_type: str
    start_date: date
    end_date: date
    business_days: int
    reason: str
    status: str
    decided_by: Optional[str]
    decided_at: Optional[datetime]
    decision_comment: Optional[str]
    created_at: datetime
    updated_at: datetime
    owner_username: str
    decider_username: Optional[str]


@dataclass
class LeaveBalance:
    id: str
    employee_id: str
    employee_keycloak_id: str
    balance_year: int
    total_days: int
    used_days: int
    created_at: datetime
    updated_at: datetime


@dataclass
class Expense:
    id: str
    employee_id: str
    employee_keycloak_id: str
    manager_keycloak_id: Optional[str]
    hr_escalated: bool
    category: str
    amount: str
    currency: str
    expense_date: date
    description: str
    status: str
    second_approval_required: bool
    first_approver_keycloak_id: Optional[str]
    first_approved_at: Optional[datetime]
    decided_by: Optional[str]
    decided_at: Optional[datetime]
    decision_comment: Optional[str]
    created_at: datetime
    updated_at: datetime
    owner_username: str
    first_approver_username: Optional[str]
    second_approver_username: Optional[str]


@dataclass
class DocumentCategory:
    id: str
    name: str
    description: str
    min_role: str
    created_at: datetime
    updated_at: datetime
    seeded_by_flyway: bool


@dataclass
class Document:
    id: str
    title: str
    description: Optional[str]
    category_id: str
    category_name: str
    owner_keycloak_id: Optional[str]
    storage_key: str
    content_type: str
    size_bytes: Optional[int]
    original_filename: Optional[str]
    uploaded_by: str
    created_at: datetime
    updated_at: datetime
    #: Bytes to materialise in the documents volume; None = metadata-only record
    #: (its `/content` endpoint answers 404 "metadata only", which is a state the
    #: schema documents and the SPA must handle).
    body: Optional[bytes] = None


@dataclass
class Notification:
    id: str
    recipient_id: str
    employee_id: Optional[str]
    type: str
    status: str
    title: str
    message: str
    correlation_id: str
    created_at: datetime
    read_at: Optional[datetime]


@dataclass
class AuditEntry:
    id: str
    actor: str
    action: str
    resource: str
    details: Optional[str]
    occurred_at: datetime


@dataclass
class ProvisioningRecord:
    id: str
    employee_id: str
    keycloak_id: Optional[str]
    action: str
    status: str
    detail: Optional[str]
    occurred_at: datetime


@dataclass
class SecurityEvent:
    id: str
    keycloak_id: Optional[str]
    username: Optional[str]
    type: str
    actor: str
    detail: Optional[str]
    occurred_at: datetime


@dataclass
class Activity:
    leave_requests: list[LeaveRequest]
    leave_balances: list[LeaveBalance]
    leave_audit: list[AuditEntry]
    expenses: list[Expense]
    expense_audit: list[AuditEntry]
    document_categories: list[DocumentCategory]
    documents: list[Document]
    document_audit: list[AuditEntry]
    notifications: list[Notification]
    hr_audit: list[AuditEntry]
    provisioning_records: list[ProvisioningRecord]
    security_events: list[SecurityEvent]


# ── Helpers ─────────────────────────────────────────────────────────────────


def _uuid(rng: random.Random) -> str:
    """Deterministic RFC-4122 v4 UUID drawn from the seeded generator."""
    return str(uuid.UUID(int=rng.getrandbits(128), version=4))


def slug(value: str) -> str:
    """`El Mansouri` → `elmansouri`; accents folded, everything else dropped."""
    folded = unicodedata.normalize("NFKD", value)
    ascii_only = "".join(ch for ch in folded if not unicodedata.combining(ch))
    return "".join(ch for ch in ascii_only.lower() if ch.isalnum())


def business_days(start: date, end: date) -> int:
    """Monday–Friday days in an inclusive range — mirrors `DateRange.businessDays()`."""
    days = 0
    current = start
    while current <= end:
        if current.weekday() < 5:
            days += 1
        current += timedelta(days=1)
    return days


def weighted_choice(rng: random.Random, options: list[tuple[object, float]]):
    values = [value for value, _ in options]
    weights = [weight for _, weight in options]
    return rng.choices(values, weights=weights, k=1)[0]


def _at_work(rng: random.Random, day: date) -> datetime:
    """A plausible working-hours instant on the given day (UTC)."""
    hour = rng.randint(WORKDAY_START_HOUR, WORKDAY_END_HOUR)
    return datetime.combine(
        day, time(hour, rng.randint(0, 59), rng.randint(0, 59)), tzinfo=timezone.utc
    )


def position_description(title: str) -> str:
    described = company.POSITION_DESCRIPTIONS.get(title)
    if described:
        return described
    return f"Poste : {title}."


# ── Phase A — organisation ──────────────────────────────────────────────────


def generate_org(seed: int, now: datetime, history_months: int = 18) -> Org:
    """Departments, positions and the full reporting tree."""
    rng = random.Random(seed)
    go_live = now - timedelta(days=history_months * 30)

    departments: list[Department] = []
    for spec in company.DEPARTMENTS:
        stamp = go_live - timedelta(days=rng.randint(1, 20))
        departments.append(
            Department(
                id=_uuid(rng),
                key=spec["key"],
                name=spec["name"],
                description=spec["description"],
                created_at=stamp,
                updated_at=stamp,
            )
        )
    departments_by_key = {d.key: d for d in departments}

    # One `position` row per distinct title used anywhere in the catalogue.
    titles: list[str] = []
    for spec in company.DEPARTMENTS:
        for title in [spec["head"], spec["manager"]] + [t for t, _ in spec["ics"]]:
            if title and title not in titles:
                titles.append(title)
    positions: list[Position] = []
    for title in titles:
        stamp = go_live - timedelta(days=rng.randint(1, 20))
        positions.append(
            Position(
                id=_uuid(rng),
                title=title,
                description=position_description(title),
                created_at=stamp,
                updated_at=stamp,
            )
        )
    positions_by_title = {p.title: p for p in positions}

    # ── names, emails, matricules ────────────────────────────────────────────
    used_names: set[str] = set()
    used_logins: dict[str, int] = {}
    # the four realm fixtures shipped in keycloak-config must stay untouched
    reserved_logins = {"alice.employee", "mark.manager", "hana.hr", "adam.admin"}
    matricule_counter = {"n": 0}

    site_codes = [code for code, _, _ in company.SITES]
    site_names = {code: name for code, name, _ in company.SITES}
    site_weights = [weight for _, _, weight in company.SITES]

    def new_person() -> tuple[str, str, str, str]:
        """A fresh first/last name plus its collision-safe login and email."""
        for _ in range(400):
            pool = company.FIRST_NAMES_M if rng.random() < 0.56 else company.FIRST_NAMES_F
            first = rng.choice(pool)
            last = rng.choice(company.FAMILY_NAMES)
            full = f"{first} {last}"
            if full in used_names:
                continue
            if full.lower() in company.BLOCKED_FULL_NAMES:
                continue
            used_names.add(full)
            base = f"{slug(first)}.{slug(last)}"
            seen = used_logins.get(base, 0) + 1
            used_logins[base] = seen
            login = base if seen == 1 and base not in reserved_logins else f"{base}{seen + 1}"
            return first, last, login, f"{login}@{company.COMPANY_DOMAIN}"
        raise RuntimeError("name pool exhausted — widen company.FAMILY_NAMES")

    def new_matricule(site_code: str, hired: date) -> str:
        matricule_counter["n"] += 1
        return f"{site_code}-{hired.year}-{matricule_counter['n']:04d}"

    employees: list[Employee] = []

    def make_employee(
        dept: Department,
        title: str,
        manager: Optional[Employee],
        seniority: str,
    ) -> Employee:
        first, last, login, email = new_person()
        # leadership sits at the two head-office sites; everyone else follows the
        # published site distribution
        if seniority == "head":
            code = rng.choices(["CAS", "RAB"], weights=[0.75, 0.25], k=1)[0]
        elif seniority == "manager":
            code = rng.choices(["CAS", "RAB", "MAR", "TNG"],
                               weights=[0.55, 0.25, 0.10, 0.10], k=1)[0]
        else:
            code = rng.choices(site_codes, weights=site_weights, k=1)[0]
        years = {
            "head": rng.uniform(4.0, 11.0),
            "manager": rng.uniform(2.5, 8.0),
            "ic": weighted_choice(
                rng,
                [(rng.uniform(0.05, 1.5), 32), (rng.uniform(1.5, 4.0), 38),
                 (rng.uniform(4.0, 7.0), 20), (rng.uniform(7.0, 10.0), 10)],
            ),
        }[seniority]
        hired = (now - timedelta(days=int(years * 365.25))).date()
        created = max(_at_work(rng, hired), go_live + timedelta(days=rng.randint(0, 25)))
        created = min(created, now - timedelta(days=1))
        employee = Employee(
            id=_uuid(rng),
            matricule=new_matricule(code, hired),
            first_name=first,
            last_name=last,
            email=email,
            username=login,
            site=site_names[code],
            site_code=code,
            hire_date=hired,
            status="ACTIVE",
            provisioning_status="PROVISIONED",
            manager_id=manager.id if manager else None,
            department_id=dept.id,
            position_id=positions_by_title[title].id,
            department_name=dept.name,
            position_title=title,
            realm_role="EMPLOYEE",
            created_at=created,
            updated_at=created,
            provisioned_at=created + timedelta(minutes=rng.randint(1, 25)),
        )
        if manager:
            manager.direct_reports.append(employee.id)
        employees.append(employee)
        return employee

    # ── build the tree: CEO → heads → (team managers) → individual contributors
    dg_spec = next(s for s in company.DEPARTMENTS if s["key"] == "DG")
    ceo = make_employee(departments_by_key["DG"], dg_spec["head"], None, "head")

    for spec in company.DEPARTMENTS:
        dept = departments_by_key[spec["key"]]
        head = ceo if spec["key"] == "DG" else make_employee(dept, spec["head"], ceo, "head")

        ic_titles: list[str] = []
        for title, weight in spec["ics"]:
            ic_titles.extend([title] * weight)
        remaining = spec["headcount"] - 1

        if spec["manager"] and remaining > TEAM_MANAGER_THRESHOLD:
            team_count = max(2, math.ceil(remaining / TEAM_SPAN))
            managers = [
                make_employee(dept, spec["manager"], head, "manager") for _ in range(team_count)
            ]
            remaining -= team_count
            for index in range(remaining):
                make_employee(dept, rng.choice(ic_titles), managers[index % team_count], "ic")
        else:
            for _ in range(remaining):
                make_employee(dept, rng.choice(ic_titles), head, "ic")

    by_id = {e.id: e for e in employees}

    # ── deliberate role assignments (never derived — see RealmRoleResolver) ──
    rh_dept = departments_by_key["RH"]
    rh_members = [e for e in employees if e.department_id == rh_dept.id]
    hr_people = [e for e in rh_members if e.manager_id == ceo.id]  # the DRH
    hr_priority = ["HR Business Partner", "Responsable Paie & Administration du Personnel",
                   "Talent Acquisition Specialist", "Chargé de Recrutement"]
    for title in hr_priority:
        for member in rh_members:
            if len(hr_people) >= 6:
                break
            if member.position_title == title and member not in hr_people:
                hr_people.append(member)
    for person in hr_people:
        person.realm_role = "HR"

    it_dept = departments_by_key["IT"]
    it_members = [e for e in employees if e.department_id == it_dept.id]
    admin_people = [e for e in it_members if e.manager_id == ceo.id]  # the DSI
    for member in it_members:
        if member.position_title == "Ingénieur IAM" and len(admin_people) < 2:
            admin_people.append(member)
    for person in admin_people:
        person.realm_role = "ADMIN"

    # MANAGER is derived: at least one direct report, no deliberate HR/ADMIN role.
    for employee in employees:
        if employee.realm_role == "EMPLOYEE" and employee.direct_reports:
            employee.realm_role = "MANAGER"

    # ── lifecycle variety, restricted to leaves so no team loses its manager ─
    leaves = [e for e in employees if not e.direct_reports]
    rng.shuffle(leaves)
    cursor = 0

    def take(count: int) -> list[Employee]:
        nonlocal cursor
        chunk = leaves[cursor:cursor + count]
        cursor += count
        return chunk

    def touched(employee: Employee, days_ago: int) -> datetime:
        """A lifecycle change is always after the record was created."""
        moment = now - timedelta(days=days_ago, minutes=rng.randint(0, 600))
        earliest = (employee.provisioned_at or employee.created_at) + timedelta(hours=2)
        return max(moment, min(earliest, now - timedelta(hours=1)))

    # departures are continuous too: a few land inside the audit centre's
    # default 30-day window, the rest spread back over the history
    for index, employee in enumerate(take(15)):  # offboarding terminal state
        employee.status = "TERMINATED"
        employee.provisioning_status = "DISABLED"
        employee.keycloak_enabled = False
        days_ago = rng.randint(2, 26) if index < 3 else int(rng.triangular(27, 400, 60))
        employee.updated_at = touched(employee, days_ago)
    for employee in take(15):  # deactivated, may return
        employee.status = "DISABLED"
        employee.provisioning_status = "DISABLED"
        employee.keycloak_enabled = False
        employee.updated_at = touched(employee, rng.randint(5, 300))
    for employee in take(3):  # temporarily locked by an administrator
        employee.provisioning_status = "LOCKED"
        employee.keycloak_enabled = False
        employee.updated_at = touched(employee, rng.randint(1, 45))
    for employee in take(5):  # hired, identity onboarding not run yet
        employee.provisioning_status = "NOT_PROVISIONED"
        employee.provisioned_at = None
        employee.hire_date = (now - timedelta(days=rng.randint(0, 18))).date()
        employee.created_at = _at_work(rng, employee.hire_date)
        employee.updated_at = employee.created_at
    for employee in take(6):  # hiring is continuous: onboarded within the month
        employee.hire_date = (now - timedelta(days=rng.randint(2, 28))).date()
        employee.created_at = _at_work(rng, employee.hire_date)
        employee.updated_at = employee.created_at
        employee.provisioned_at = employee.created_at + timedelta(minutes=rng.randint(1, 25))
    for employee in take(2):  # provisioning attempt failed — retry is allowed
        employee.provisioning_status = "FAILED"
        employee.provisioned_at = None
        employee.hire_date = (now - timedelta(days=rng.randint(3, 40))).date()
        employee.created_at = _at_work(rng, employee.hire_date)
        employee.updated_at = employee.created_at + timedelta(minutes=rng.randint(2, 30))

    # a realistic slice has been re-synchronised since onboarding; a sync writes
    # the aggregate, so it also moves updated_at
    for employee in employees:
        if employee.provisioning_status == "PROVISIONED" and rng.random() < 0.35:
            # weighted towards the recent past: a sync is triggered by an edit,
            # and edits cluster near today rather than spreading evenly
            synced = now - timedelta(days=int(rng.triangular(1, 300, 25)),
                                     minutes=rng.randint(0, 600))
            if synced <= employee.created_at:
                continue
            employee.last_sync_at = synced
            employee.updated_at = max(employee.updated_at, synced)

    return Org(
        departments=departments,
        positions=positions,
        employees=employees,
        by_id=by_id,
        hr_people=hr_people,
        admin_people=admin_people,
        generated_at=now,
    )


# ── Phase B — business activity ─────────────────────────────────────────────


def generate_activity(
    org: Org,
    seed: int,
    now: datetime,
    currency: str = "EUR",
    threshold: float = 1000.00,
    history_months: int = 18,
) -> Activity:
    """Leave, expenses, documents, notifications and every append-only trail."""
    rng = random.Random(seed + 7919)
    go_live = now - timedelta(days=history_months * 30)
    today = now.date()

    linked = [e for e in org.employees if e.keycloak_id]
    hr_linked = [e for e in org.hr_people if e.keycloak_id]
    admin_linked = [e for e in org.admin_people if e.keycloak_id]
    approvers = hr_linked + admin_linked
    if not approvers:
        raise RuntimeError("no provisioned HR/Admin account — cannot route escalations")

    def clamp(moment: datetime) -> datetime:
        return min(max(moment, go_live), now - timedelta(minutes=5))

    def routing(employee: Employee) -> tuple[Optional[str], bool, Employee]:
        """(manager subject, escalated, decider) — mirrors BR-02 routing."""
        manager = org.by_id.get(employee.manager_id) if employee.manager_id else None
        if manager and manager.keycloak_id and manager.keycloak_id != employee.keycloak_id:
            return manager.keycloak_id, False, manager
        decider = rng.choice([a for a in approvers if a.id != employee.id])
        return None, True, decider

    # ── leave balances first, so approvals can be budgeted against them ──────
    years = [today.year - 1, today.year]
    balances: dict[tuple[str, int], LeaveBalance] = {}
    budget: dict[tuple[str, int], int] = {}
    for employee in linked:
        for year in years:
            if employee.hire_date.year > year:
                continue
            total = weighted_choice(
                rng,
                [(DEFAULT_ANNUAL_DAYS, 88), (22, 3), (27, 5), (30, 4)],
            )
            budget[(employee.id, year)] = total

    # ── leave requests ──────────────────────────────────────────────────────
    leave_requests: list[LeaveRequest] = []
    leave_audit: list[AuditEntry] = []
    approved_periods: dict[str, list[tuple[date, date]]] = {}
    used_annual: dict[tuple[str, int], int] = {}

    for employee in linked:
        count = weighted_choice(rng, [(0, 22), (1, 24), (2, 20), (3, 15), (4, 9), (5, 5), (6, 3), (8, 2)])
        for _ in range(count):
            year = weighted_choice(rng, [(years[0], 35), (years[1], 65)])
            if employee.hire_date.year > year:
                continue
            leave_type = weighted_choice(rng, [("ANNUAL", 64), ("SICK", 25), ("UNPAID", 11)])

            year_start = max(date(year, 1, 1), employee.hire_date + timedelta(days=30))
            year_end = date(year, 12, 31)
            if year_start >= year_end:
                continue
            start = year_start + timedelta(days=rng.randint(0, (year_end - year_start).days))
            span = weighted_choice(rng, [(1, 22), (2, 14), (3, 12), (4, 10), (5, 16), (7, 12), (10, 8), (14, 6)])
            end = min(start + timedelta(days=span - 1), year_end)
            days = business_days(start, end)
            if days == 0:
                continue

            if end < today:
                status = weighted_choice(rng, [("APPROVED", 62), ("REJECTED", 15), ("CANCELLED", 23)])
            elif start > today:
                status = weighted_choice(rng, [("SUBMITTED", 54), ("APPROVED", 31), ("CANCELLED", 15)])
            else:
                status = "APPROVED"

            if status == "APPROVED":
                periods = approved_periods.setdefault(employee.id, [])
                if any(not (end < other_start or start > other_end) for other_start, other_end in periods):
                    continue  # BR-03: never two overlapping approved periods
                if leave_type == "ANNUAL":
                    allocation = budget.get((employee.id, year))
                    if allocation is None:
                        continue
                    already = used_annual.get((employee.id, year), 0)
                    if already + days > allocation:  # BR-01: never over the allocation
                        continue
                    used_annual[(employee.id, year)] = already + days
                periods.append((start, end))

            manager_subject, escalated, decider = routing(employee)
            created = clamp(_at_work(rng, start - timedelta(days=rng.randint(3, 45))))
            decided_at = None
            decided_by = None
            decider_username = None
            comment = None
            if status in ("APPROVED", "REJECTED"):
                decided_at = clamp(created + timedelta(days=rng.randint(1, 5), hours=rng.randint(0, 7)))
                decided_by = decider.keycloak_id
                decider_username = decider.username
                comment = weighted_choice(
                    rng,
                    [(None, 55), ("Validé, bon congé.", 12), ("OK pour l'équipe.", 10),
                     ("Merci d'anticiper la passation avant votre départ.", 8),
                     ("Refusé : période de forte charge sur le projet.", 8),
                     ("Refusé : effectif insuffisant sur la période demandée.", 7)],
                )
                if status == "APPROVED" and comment and comment.startswith("Refusé"):
                    comment = "Validé, bon congé."
                if status == "REJECTED" and (comment is None or not comment.startswith("Refusé")):
                    comment = "Refusé : période de forte charge sur le projet."
            updated = decided_at or created

            request = LeaveRequest(
                id=_uuid(rng),
                employee_id=employee.id,
                employee_keycloak_id=employee.keycloak_id,
                manager_keycloak_id=manager_subject,
                hr_escalated=escalated,
                leave_type=leave_type,
                start_date=start,
                end_date=end,
                business_days=days,
                reason=rng.choice(company.LEAVE_REASONS[leave_type]),
                status=status,
                decided_by=decided_by,
                decided_at=decided_at,
                decision_comment=comment,
                created_at=created,
                updated_at=updated,
                owner_username=employee.username,
                decider_username=decider_username,
            )
            leave_requests.append(request)

            escalation = " escalated=HR" if escalated else ""
            leave_audit.append(AuditEntry(
                id=_uuid(rng), actor=employee.username, action="LEAVE_REQUEST_SUBMITTED",
                resource=f"leave_request:{request.id}",
                details=(f"type={leave_type} period={start}..{end} "
                         f"businessDays={days}{escalation}"),
                occurred_at=created,
            ))
            if status == "APPROVED":
                leave_audit.append(AuditEntry(
                    id=_uuid(rng), actor=decider_username, action="LEAVE_REQUEST_APPROVED",
                    resource=f"leave_request:{request.id}", details=f"businessDays={days}",
                    occurred_at=decided_at,
                ))
            elif status == "REJECTED":
                leave_audit.append(AuditEntry(
                    id=_uuid(rng), actor=decider_username, action="LEAVE_REQUEST_REJECTED",
                    resource=f"leave_request:{request.id}", details=None, occurred_at=decided_at,
                ))
            elif status == "CANCELLED":
                cancelled_at = clamp(created + timedelta(days=rng.randint(1, 6)))
                request.updated_at = cancelled_at
                leave_audit.append(AuditEntry(
                    id=_uuid(rng), actor=employee.username, action="LEAVE_REQUEST_CANCELLED",
                    resource=f"leave_request:{request.id}", details=None, occurred_at=cancelled_at,
                ))

    # BR-02 escalation backlog. Only a self-managed employee (the top of the
    # tree) routes to HR, so left to chance the HR escalation inbox would be
    # empty and that whole approval path would go untested. Give them a standing
    # pending set — which is exactly what a CEO's leave looks like in practice.
    for employee in [e for e in linked if e.manager_id is None]:
        for offset in (12, 47, 96):
            start = today + timedelta(days=offset)
            end = min(start + timedelta(days=rng.randint(2, 6)), date(start.year, 12, 31))
            days = business_days(start, end)
            if days == 0 or start.year != end.year:
                continue
            leave_type = weighted_choice(rng, [("ANNUAL", 70), ("UNPAID", 30)])
            created = clamp(_at_work(rng, today - timedelta(days=rng.randint(1, 20))))
            request = LeaveRequest(
                id=_uuid(rng), employee_id=employee.id,
                employee_keycloak_id=employee.keycloak_id, manager_keycloak_id=None,
                hr_escalated=True, leave_type=leave_type, start_date=start, end_date=end,
                business_days=days, reason=rng.choice(company.LEAVE_REASONS[leave_type]),
                status="SUBMITTED", decided_by=None, decided_at=None, decision_comment=None,
                created_at=created, updated_at=created,
                owner_username=employee.username, decider_username=None,
            )
            leave_requests.append(request)
            leave_audit.append(AuditEntry(
                id=_uuid(rng), actor=employee.username, action="LEAVE_REQUEST_SUBMITTED",
                resource=f"leave_request:{request.id}",
                details=(f"type={leave_type} period={start}..{end} "
                         f"businessDays={days} escalated=HR"),
                occurred_at=created,
            ))

    # balance rows: always where the allocation was actually drawn on, plus the
    # employees who simply opened their balance page (the lazy provisioning path)
    for employee in linked:
        for year in years:
            key = (employee.id, year)
            if key not in budget:
                continue
            used = used_annual.get(key, 0)
            if used == 0 and rng.random() > 0.62:
                continue
            created = clamp(_at_work(rng, max(employee.hire_date, date(year, 1, 2))))
            balances[key] = LeaveBalance(
                id=_uuid(rng),
                employee_id=employee.id,
                employee_keycloak_id=employee.keycloak_id,
                balance_year=year,
                total_days=budget[key],
                used_days=used,
                created_at=created,
                updated_at=clamp(created + timedelta(days=rng.randint(0, 200))),
            )

    # HR allocation adjustments leave an audit trail (FR-22)
    for balance in list(balances.values()):
        if balance.total_days != DEFAULT_ANNUAL_DAYS and rng.random() < 0.8:
            hr_actor = rng.choice(hr_linked or approvers)
            leave_audit.append(AuditEntry(
                id=_uuid(rng), actor=hr_actor.username, action="LEAVE_BALANCE_ADJUSTED",
                resource=f"leave_balance:{balance.id}",
                details=(f"employee={balance.employee_id} year={balance.balance_year} "
                         f"totalDays {DEFAULT_ANNUAL_DAYS} -> {balance.total_days} "
                         f"reason=Ajustement annuel accord d'entreprise"),
                occurred_at=balance.updated_at,
            ))

    # ── expenses ────────────────────────────────────────────────────────────
    amount_ranges = {
        "TRAVEL": (25, 1800), "MEALS": (12, 95), "ACCOMMODATION": (60, 950),
        "SUPPLIES": (15, 480), "TRAINING": (180, 2600), "OTHER": (20, 620),
    }
    expenses: list[Expense] = []
    expense_audit: list[AuditEntry] = []

    for employee in linked:
        count = weighted_choice(rng, [(0, 26), (1, 18), (2, 16), (3, 13), (4, 10), (6, 9), (8, 5), (11, 3)])
        for _ in range(count):
            category = weighted_choice(
                rng,
                [("MEALS", 30), ("TRAVEL", 24), ("ACCOMMODATION", 14),
                 ("SUPPLIES", 13), ("TRAINING", 9), ("OTHER", 10)],
            )
            low, high = amount_ranges[category]
            value = round(rng.uniform(low, high), 2)
            if rng.random() < 0.06:  # a deliberate slice lands above the threshold
                value = round(rng.uniform(threshold + 50, threshold + 2500), 2)
            above_threshold = value > threshold

            earliest = max(employee.hire_date, go_live.date())
            span_days = (today - earliest).days
            if span_days < 2:
                continue
            spent = earliest + timedelta(days=rng.randint(0, span_days - 1))
            created = clamp(_at_work(rng, min(spent + timedelta(days=rng.randint(0, 9)), today)))

            if above_threshold:
                status = weighted_choice(
                    rng,
                    [("APPROVED", 38), ("PENDING_SECOND_APPROVAL", 28),
                     ("SUBMITTED", 16), ("REJECTED", 12), ("CANCELLED", 6)],
                )
            else:
                status = weighted_choice(
                    rng,
                    [("APPROVED", 56), ("SUBMITTED", 17), ("REJECTED", 15), ("CANCELLED", 12)],
                )

            manager_subject, escalated, decider = routing(employee)
            first_approver = None
            first_approver_username = None
            first_approved_at = None
            decided_by = None
            decided_at = None
            second_username = None
            comment = None
            needs_second = False

            if status in ("APPROVED", "PENDING_SECOND_APPROVAL", "REJECTED"):
                first_approved_at = clamp(created + timedelta(days=rng.randint(1, 6), hours=rng.randint(0, 6)))

            if status == "REJECTED":
                decided_by = decider.keycloak_id
                decided_at = first_approved_at
                first_approved_at = None
                comment = weighted_choice(
                    rng,
                    [("Justificatif manquant.", 34), ("Hors politique de remboursement.", 33),
                     ("Montant non conforme au barème.", 33)],
                )
            elif status in ("APPROVED", "PENDING_SECOND_APPROVAL"):
                first_approver = decider.keycloak_id
                first_approver_username = decider.username
                if above_threshold:
                    needs_second = True
                    if status == "APPROVED":
                        # BR-03: the second signature is HR/Admin and never the first approver
                        candidates = [a for a in approvers
                                      if a.keycloak_id != first_approver and a.id != employee.id]
                        second = rng.choice(candidates)
                        decided_by = second.keycloak_id
                        second_username = second.username
                        decided_at = clamp(first_approved_at + timedelta(days=rng.randint(1, 7)))
                        comment = weighted_choice(
                            rng, [(None, 60), ("Validé — dépense projet client.", 25),
                                  ("Validé après contrôle des justificatifs.", 15)])
                else:
                    decided_by = first_approver
                    decided_at = first_approved_at
                    comment = weighted_choice(
                        rng, [(None, 74), ("OK.", 14), ("Validé.", 12)])

            expense = Expense(
                id=_uuid(rng),
                employee_id=employee.id,
                employee_keycloak_id=employee.keycloak_id,
                manager_keycloak_id=manager_subject,
                hr_escalated=escalated,
                category=category,
                amount=f"{value:.2f}",
                currency=currency,
                expense_date=spent,
                description=rng.choice(company.EXPENSE_DESCRIPTIONS[category]),
                status=status,
                second_approval_required=needs_second,
                first_approver_keycloak_id=first_approver,
                first_approved_at=first_approved_at,
                decided_by=decided_by,
                decided_at=decided_at,
                decision_comment=comment,
                created_at=created,
                updated_at=decided_at or first_approved_at or created,
                owner_username=employee.username,
                first_approver_username=first_approver_username,
                second_approver_username=second_username,
            )
            expenses.append(expense)

            escalation = " escalated=HR" if escalated else ""
            expense_audit.append(AuditEntry(
                id=_uuid(rng), actor=employee.username, action="EXPENSE_SUBMITTED",
                resource=f"expense:{expense.id}",
                details=f"category={category} amount={expense.amount} {currency}{escalation}",
                occurred_at=created,
            ))
            if status == "PENDING_SECOND_APPROVAL":
                expense_audit.append(AuditEntry(
                    id=_uuid(rng), actor=first_approver_username, action="EXPENSE_FIRST_APPROVED",
                    resource=f"expense:{expense.id}",
                    details=(f"amount={expense.amount} {currency} "
                             f"routed to second-level approval (BR-03)"),
                    occurred_at=first_approved_at,
                ))
            elif status == "APPROVED" and needs_second:
                expense_audit.append(AuditEntry(
                    id=_uuid(rng), actor=first_approver_username, action="EXPENSE_FIRST_APPROVED",
                    resource=f"expense:{expense.id}",
                    details=(f"amount={expense.amount} {currency} "
                             f"routed to second-level approval (BR-03)"),
                    occurred_at=first_approved_at,
                ))
                expense_audit.append(AuditEntry(
                    id=_uuid(rng), actor=second_username, action="EXPENSE_APPROVED",
                    resource=f"expense:{expense.id}",
                    details=f"second-level amount={expense.amount} {currency}",
                    occurred_at=decided_at,
                ))
            elif status == "APPROVED":
                expense_audit.append(AuditEntry(
                    id=_uuid(rng), actor=first_approver_username, action="EXPENSE_APPROVED",
                    resource=f"expense:{expense.id}",
                    details=f"amount={expense.amount} {currency}", occurred_at=decided_at,
                ))
            elif status == "REJECTED":
                expense_audit.append(AuditEntry(
                    id=_uuid(rng), actor=decider.username, action="EXPENSE_REJECTED",
                    resource=f"expense:{expense.id}", details=None, occurred_at=decided_at,
                ))
            elif status == "CANCELLED":
                cancelled_at = clamp(created + timedelta(days=rng.randint(1, 8)))
                expense.updated_at = cancelled_at
                expense_audit.append(AuditEntry(
                    id=_uuid(rng), actor=employee.username, action="EXPENSE_CANCELLED",
                    resource=f"expense:{expense.id}", details=None, occurred_at=cancelled_at,
                ))

    # same reasoning for the expense HR escalation queue
    for employee in [e for e in linked if e.manager_id is None]:
        for category, value in (("TRAVEL", round(rng.uniform(220, 640), 2)),
                                ("ACCOMMODATION", round(rng.uniform(threshold + 200, threshold + 1400), 2)),
                                ("MEALS", round(rng.uniform(30, 90), 2))):
            spent = today - timedelta(days=rng.randint(2, 25))
            created = clamp(_at_work(rng, spent + timedelta(days=rng.randint(0, 4))))
            expense = Expense(
                id=_uuid(rng), employee_id=employee.id,
                employee_keycloak_id=employee.keycloak_id, manager_keycloak_id=None,
                hr_escalated=True, category=category, amount=f"{value:.2f}", currency=currency,
                expense_date=spent, description=rng.choice(company.EXPENSE_DESCRIPTIONS[category]),
                status="SUBMITTED", second_approval_required=False,
                first_approver_keycloak_id=None, first_approved_at=None,
                decided_by=None, decided_at=None, decision_comment=None,
                created_at=created, updated_at=created,
                owner_username=employee.username,
                first_approver_username=None, second_approver_username=None,
            )
            expenses.append(expense)
            expense_audit.append(AuditEntry(
                id=_uuid(rng), actor=employee.username, action="EXPENSE_SUBMITTED",
                resource=f"expense:{expense.id}",
                details=f"category={category} amount={expense.amount} {currency} escalated=HR",
                occurred_at=created,
            ))

    # ── documents ───────────────────────────────────────────────────────────
    categories: list[DocumentCategory] = []
    for name, category_id in SEEDED_DOCUMENT_CATEGORIES.items():
        categories.append(DocumentCategory(
            id=category_id, name=name, description="", min_role="",
            created_at=go_live, updated_at=go_live, seeded_by_flyway=True,
        ))
    for name, description, min_role in company.EXTRA_DOCUMENT_CATEGORIES:
        stamp = clamp(go_live + timedelta(days=rng.randint(1, 30)))
        categories.append(DocumentCategory(
            id=_uuid(rng), name=name, description=description, min_role=min_role,
            created_at=stamp, updated_at=stamp, seeded_by_flyway=False,
        ))
    category_ids = {c.name: c.id for c in categories}

    documents: list[Document] = []
    document_audit: list[AuditEntry] = []
    hr_uploaders = hr_linked or approvers

    def storage_key(extension: str) -> str:
        raw = _uuid(rng)
        return f"{raw[0:2]}/{raw[2:4]}/{raw}.{extension}"

    def add_document(title, description, category_name, owner, uploader, created, extension, content_type):
        with_bytes = rng.random() < 0.30
        filename = f"{slug(title)[:60] or 'document'}.{extension}"
        body = None
        size = None
        if with_bytes:
            body = _document_body(title, description, extension)
            size = len(body)
        document = Document(
            id=_uuid(rng), title=title, description=description,
            category_id=category_ids[category_name], category_name=category_name,
            owner_keycloak_id=owner, storage_key=storage_key(extension),
            content_type=content_type, size_bytes=size,
            original_filename=filename if with_bytes else None,
            uploaded_by=uploader, created_at=created, updated_at=created, body=body,
        )
        documents.append(document)
        document_audit.append(AuditEntry(
            id=_uuid(rng), actor=uploader, action="DOCUMENT_UPLOADED",
            resource=f"document:{document.id}",
            details=f"title={title} category={category_name}", occurred_at=created,
        ))
        return document

    for title, category_name, extension, content_type in company.COMPANY_DOCUMENTS:
        uploader = rng.choice(hr_uploaders)
        created = clamp(go_live + timedelta(days=rng.randint(2, 380)))
        add_document(title, "Document applicable à l'ensemble des collaborateurs.",
                     category_name, None, uploader.username, created, extension, content_type)

    for employee in linked:
        if rng.random() > 0.72:
            continue
        for template in rng.sample(company.PERSONAL_DOCUMENT_TEMPLATES,
                                   k=weighted_choice(rng, [(1, 40), (2, 35), (3, 20), (4, 5)])):
            title, category_name, extension, content_type = template
            uploader = rng.choice(hr_uploaders)
            created = clamp(_at_work(
                rng, max(employee.hire_date, go_live.date()) + timedelta(days=rng.randint(0, 300))))
            add_document(f"{title} — {employee.full_name}",
                         f"{title} de {employee.full_name} ({employee.matricule}).",
                         category_name, employee.keycloak_id, uploader.username,
                         created, extension, content_type)

    # downloads leave their own audit rows (every read is logged)
    for document in documents:
        for _ in range(weighted_choice(rng, [(0, 45), (1, 28), (2, 15), (3, 8), (5, 4)])):
            reader = rng.choice(linked)
            if document.owner_keycloak_id and document.owner_keycloak_id != reader.keycloak_id \
                    and reader.realm_role not in ("HR", "ADMIN"):
                continue  # only someone who could actually read it leaves a trace
            document_audit.append(AuditEntry(
                id=_uuid(rng), actor=reader.username, action="DOCUMENT_DOWNLOADED",
                resource=f"document:{document.id}",
                details=f"title={document.title}",
                occurred_at=clamp(document.created_at + timedelta(
                    days=rng.randint(0, 300), hours=rng.randint(0, 9))),
            ))

    # ── identity trails: provisioning history, security events, HR audit ─────
    provisioning_records: list[ProvisioningRecord] = []
    security_events: list[SecurityEvent] = []
    hr_audit: list[AuditEntry] = []
    notifications: list[Notification] = []

    def notify(recipient, employee_id, ntype, moment):
        title, message = NOTIFICATION_COPY[ntype]
        age_days = (now - moment).days
        read = rng.random() < (0.35 if age_days < 10 else 0.92)
        notifications.append(Notification(
            id=_uuid(rng), recipient_id=recipient, employee_id=employee_id, type=ntype,
            status="READ" if read else "UNREAD", title=title, message=message,
            correlation_id=_uuid(rng), created_at=moment,
            read_at=clamp(moment + timedelta(hours=rng.randint(1, 72))) if read else None,
        ))

    hr_actor_pool = [p.username for p in (hr_linked + admin_linked)] or ["system"]

    for employee in org.employees:
        actor = rng.choice(hr_actor_pool)
        if employee.provisioning_status == "NOT_PROVISIONED":
            continue
        if employee.provisioning_status == "FAILED":
            moment = employee.updated_at
            provisioning_records.append(ProvisioningRecord(
                id=_uuid(rng), employee_id=employee.id, keycloak_id=None, action="ONBOARD",
                status="FAILED",
                detail="IdentityUnavailableException: keycloak admin API returned 503",
                occurred_at=moment,
            ))
            hr_audit.append(AuditEntry(
                id=_uuid(rng), actor=actor, action="ONBOARD_FAILED",
                resource=f"employee:{employee.id}",
                details="IdentityUnavailableException: keycloak admin API returned 503",
                occurred_at=moment,
            ))
            continue

        provisioned_at = employee.provisioned_at or employee.created_at
        role = employee.realm_role
        provisioning_records.append(ProvisioningRecord(
            id=_uuid(rng), employee_id=employee.id, keycloak_id=employee.keycloak_id,
            action="ONBOARD", status="PROVISIONED", detail=f"role={role}",
            occurred_at=provisioned_at,
        ))
        hr_audit.append(AuditEntry(
            id=_uuid(rng), actor=actor, action="EMPLOYEE_PROVISIONED",
            resource=f"employee:{employee.id}",
            details=f"keycloakId={employee.keycloak_id} role={role}",
            occurred_at=provisioned_at,
        ))
        notify(employee.keycloak_id, employee.id, "EMPLOYEE_PROVISIONED", provisioned_at)

        if employee.last_sync_at:
            provisioning_records.append(ProvisioningRecord(
                id=_uuid(rng), employee_id=employee.id, keycloak_id=employee.keycloak_id,
                action="SYNC", status="SYNCED", detail="profile + status pushed to Keycloak",
                occurred_at=employee.last_sync_at,
            ))
            hr_audit.append(AuditEntry(
                id=_uuid(rng), actor=rng.choice(hr_actor_pool), action="EMPLOYEE_SYNCED",
                resource=f"employee:{employee.id}",
                details=f"keycloakId={employee.keycloak_id}", occurred_at=employee.last_sync_at,
            ))
            notify(employee.keycloak_id, employee.id, "EMPLOYEE_UPDATED", employee.last_sync_at)

        if employee.provisioning_status == "LOCKED":
            moment = employee.updated_at
            provisioning_records.append(ProvisioningRecord(
                id=_uuid(rng), employee_id=employee.id, keycloak_id=employee.keycloak_id,
                action="LOCK", status="LOCKED",
                detail="compte verrouillé suite à des tentatives de connexion répétées",
                occurred_at=moment,
            ))
            security_events.append(SecurityEvent(
                id=_uuid(rng), keycloak_id=employee.keycloak_id, username=employee.email,
                type="LOCK", actor=rng.choice(hr_actor_pool),
                detail="compte verrouillé suite à des tentatives de connexion répétées",
                occurred_at=moment,
            ))
            hr_audit.append(AuditEntry(
                id=_uuid(rng), actor=rng.choice(hr_actor_pool), action="SECURITY_LOCK",
                resource=f"employee:{employee.id}",
                details="compte verrouillé suite à des tentatives de connexion répétées",
                occurred_at=moment,
            ))
            notify(employee.keycloak_id, employee.id, "ACCOUNT_LOCKED", moment)

        elif employee.status == "DISABLED":
            moment = employee.updated_at
            provisioning_records.append(ProvisioningRecord(
                id=_uuid(rng), employee_id=employee.id, keycloak_id=employee.keycloak_id,
                action="DISABLE", status="DISABLED", detail="account deactivated, sessions revoked",
                occurred_at=moment,
            ))
            security_events.append(SecurityEvent(
                id=_uuid(rng), keycloak_id=employee.keycloak_id, username=employee.email,
                type="DISABLED", actor=rng.choice(hr_actor_pool),
                detail="account deactivated, sessions revoked", occurred_at=moment,
            ))
            hr_audit.append(AuditEntry(
                id=_uuid(rng), actor=rng.choice(hr_actor_pool), action="SECURITY_DISABLE",
                resource=f"employee:{employee.id}",
                details="account deactivated, sessions revoked", occurred_at=moment,
            ))
            notify(employee.keycloak_id, employee.id, "ACCOUNT_DISABLED", moment)

        elif employee.status == "TERMINATED":
            moment = employee.updated_at
            provisioning_records.append(ProvisioningRecord(
                id=_uuid(rng), employee_id=employee.id, keycloak_id=employee.keycloak_id,
                action="OFFBOARD", status="DISABLED", detail="account disabled + sessions revoked",
                occurred_at=moment,
            ))
            security_events.append(SecurityEvent(
                id=_uuid(rng), keycloak_id=employee.keycloak_id, username=employee.email,
                type="OFFBOARDED", actor=rng.choice(hr_actor_pool),
                detail="account disabled, sessions + refresh tokens revoked", occurred_at=moment,
            ))
            hr_audit.append(AuditEntry(
                id=_uuid(rng), actor=rng.choice(hr_actor_pool), action="EMPLOYEE_OFFBOARDED",
                resource=f"employee:{employee.id}",
                details="identityDisabled=true notified=[leave, expense, documents] failed=[]",
                occurred_at=moment,
            ))
            notify(employee.keycloak_id, employee.id, "EMPLOYEE_TERMINATED", moment)

        elif rng.random() < 0.06:  # routine password resets
            moment = clamp(now - timedelta(days=rng.randint(1, 320)))
            provisioning_records.append(ProvisioningRecord(
                id=_uuid(rng), employee_id=employee.id, keycloak_id=employee.keycloak_id,
                action="RESET_PASSWORD", status="PASSWORD_RESET",
                detail="temporary password issued, change forced", occurred_at=moment,
            ))
            security_events.append(SecurityEvent(
                id=_uuid(rng), keycloak_id=employee.keycloak_id, username=employee.email,
                type="PASSWORD_RESET", actor=rng.choice(hr_actor_pool),
                detail="temporary password issued, change forced", occurred_at=moment,
            ))
            hr_audit.append(AuditEntry(
                id=_uuid(rng), actor=rng.choice(hr_actor_pool), action="SECURITY_RESET_PASSWORD",
                resource=f"employee:{employee.id}",
                details="temporary password issued, change forced", occurred_at=moment,
            ))
            notify(employee.keycloak_id, employee.id, "PASSWORD_RESET", moment)

    # cross-context notifications (leave/expense/document) — the copy the
    # NotificationType enum owns, never reworded here
    recent = now - timedelta(days=240)
    for request in leave_requests:
        if request.created_at >= recent:
            notify(request.employee_keycloak_id, request.employee_id, "LEAVE_SUBMITTED", request.created_at)
        if request.status == "APPROVED" and request.decided_at and request.decided_at >= recent:
            notify(request.employee_keycloak_id, request.employee_id, "LEAVE_APPROVED", request.decided_at)
        elif request.status == "REJECTED" and request.decided_at and request.decided_at >= recent:
            notify(request.employee_keycloak_id, request.employee_id, "LEAVE_REJECTED", request.decided_at)
    for expense in expenses:
        if expense.created_at >= recent:
            notify(expense.employee_keycloak_id, expense.employee_id, "EXPENSE_SUBMITTED", expense.created_at)
        if expense.status == "APPROVED" and expense.decided_at and expense.decided_at >= recent:
            notify(expense.employee_keycloak_id, expense.employee_id, "EXPENSE_APPROVED", expense.decided_at)
        elif expense.status == "REJECTED" and expense.decided_at and expense.decided_at >= recent:
            notify(expense.employee_keycloak_id, expense.employee_id, "EXPENSE_REJECTED", expense.decided_at)
    for document in documents:
        if document.owner_keycloak_id and document.created_at >= recent:
            notify(document.owner_keycloak_id, None, "DOCUMENT_UPLOADED", document.created_at)

    # Reading a notification is itself an audited action (NotificationService
    # audits every real UNREAD→READ transition). These are the high-frequency
    # rows a live system accumulates, and without them the Audit Center's
    # default 30-day window would show almost nothing.
    read_by_recipient: dict[str, list[Notification]] = {}
    for notification in notifications:
        if notification.read_at:
            read_by_recipient.setdefault(notification.recipient_id, []).append(notification)
    for recipient, read in read_by_recipient.items():
        username = next((e.username for e in linked if e.keycloak_id == recipient), None)
        if username is None:
            continue
        read.sort(key=lambda n: n.read_at)
        index = 0
        while index < len(read):
            # some sessions clear one notification, some clear the inbox
            if len(read) - index >= 2 and rng.random() < 0.45:
                batch = read[index:index + rng.randint(2, min(5, len(read) - index))]
                moment = batch[-1].read_at
                hr_audit.append(AuditEntry(
                    id=_uuid(rng), actor=username, action="NOTIFICATION_READ_ALL",
                    resource=f"user:{recipient}",
                    details=f"{len(batch)} notification(s) marked read "
                            f"(correlationId={_uuid(rng)})",
                    occurred_at=moment,
                ))
                index += len(batch)
            else:
                notification = read[index]
                hr_audit.append(AuditEntry(
                    id=_uuid(rng), actor=username, action="NOTIFICATION_READ",
                    resource=f"notification:{notification.id}",
                    details=f"notification marked read (correlationId={_uuid(rng)})",
                    occurred_at=notification.read_at,
                ))
                index += 1

    return Activity(
        leave_requests=leave_requests,
        leave_balances=list(balances.values()),
        leave_audit=leave_audit,
        expenses=expenses,
        expense_audit=expense_audit,
        document_categories=[c for c in categories if not c.seeded_by_flyway],
        documents=documents,
        document_audit=document_audit,
        notifications=notifications,
        hr_audit=hr_audit,
        provisioning_records=provisioning_records,
        security_events=security_events,
    )


#: Title/message per NotificationType — copied verbatim from
#: `hr-service` `NotificationType`, which owns this copy. Never reword: the SPA
#: renders these strings as backend-owned data.
NOTIFICATION_COPY = {
    "EMPLOYEE_PROVISIONED": ("Account provisioned",
                             "Your employee account has been created and is ready to use."),
    "EMPLOYEE_UPDATED": ("Profile updated", "Your employee profile has been updated."),
    "ACCOUNT_DISABLED": ("Account disabled", "Your account has been disabled."),
    "EMPLOYEE_TERMINATED": ("Account terminated",
                            "Your employment has been terminated and your account has been deactivated."),
    "PASSWORD_RESET": ("Password reset",
                       "Your password has been reset. You will be asked to set a new one at next sign-in."),
    "ACCOUNT_LOCKED": ("Account locked", "Your account has been locked by an administrator."),
    "ACCOUNT_UNLOCKED": ("Account unlocked", "Your account has been unlocked."),
    "SESSION_REVOKED": ("Sessions revoked", "Your active sessions have been signed out."),
    "SECURITY_ALERT": ("Security alert",
                       "A security-relevant event was detected on your account."),
    "ADMIN_ACTION": ("Administrative action",
                     "An administrator performed an action on your account."),
    "LEAVE_SUBMITTED": ("Leave request submitted", "Your leave request has been submitted."),
    "LEAVE_APPROVED": ("Leave request approved", "Your leave request has been approved."),
    "LEAVE_REJECTED": ("Leave request rejected", "Your leave request has been rejected."),
    "EXPENSE_SUBMITTED": ("Expense submitted", "Your expense has been submitted."),
    "EXPENSE_APPROVED": ("Expense approved", "Your expense has been approved."),
    "EXPENSE_REJECTED": ("Expense rejected", "Your expense has been rejected."),
    "DOCUMENT_UPLOADED": ("Document uploaded", "A document has been uploaded."),
    "DOCUMENT_SHARED": ("Document shared", "A document has been shared with you."),
}


def _document_body(title: str, description: Optional[str], extension: str) -> bytes:
    """
    Real bytes for the documents that are materialised on the volume, so a
    download returns a file the browser can actually open. Synthetic placeholder
    content only — no personal data of any kind.
    """
    if extension == "csv":
        return (
            "reference,libelle,valeur\r\n"
            f"DOC-001,{_ascii(title)},synthetique\r\n"
            "DOC-002,Jeu de donnees de demonstration,QA\r\n"
        ).encode("utf-8")
    return _minimal_pdf([
        company.COMPANY_NAME,
        _ascii(title),
        "",
        _ascii(description or ""),
        "",
        "Document de demonstration - contenu synthetique.",
        "Ce fichier ne contient aucune donnee personnelle reelle.",
    ])


def _ascii(value: str) -> str:
    folded = unicodedata.normalize("NFKD", value)
    return "".join(ch for ch in folded if not unicodedata.combining(ch))


def _minimal_pdf(lines: list[str]) -> bytes:
    """A valid single-page PDF 1.4 with the given text lines (Helvetica, 12pt)."""
    def escaped(text: str) -> str:
        return text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")

    content = ["BT", "/F1 12 Tf"]
    baseline = 780
    for line in lines:
        content.append(f"1 0 0 1 60 {baseline} Tm ({escaped(line)}) Tj")
        baseline -= 18
    content.append("ET")
    stream = "\n".join(content).encode("latin-1", "replace")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += str(number).encode() + b" 0 obj\n" + body + b"\nendobj\n"
    xref_at = len(out)
    out += b"xref\n0 " + str(len(objects) + 1).encode() + b"\n0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += (b"trailer\n<< /Size " + str(len(objects) + 1).encode()
            + b" /Root 1 0 R >>\nstartxref\n" + str(xref_at).encode() + b"\n%%EOF\n")
    return bytes(out)
