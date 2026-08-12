"""
Minimal Keycloak Admin REST client — Python standard library only.

Only what the seeder needs: a bootstrap-admin token, user create/lookup/update,
realm-role assignment, password set, and a scoped delete used by `--reset`.
Realm roles are assigned by name against the realm's own role definitions, so
the composite expansion (MANAGER ⊃ EMPLOYEE) stays Keycloak's business.

Development tool: it authenticates with the master-realm bootstrap admin from
`.env`. It is not, and must not become, part of a service runtime.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Optional


class KeycloakError(RuntimeError):
    pass


class KeycloakAdmin:
    def __init__(self, base_url: str, realm: str, username: str, password: str,
                 token_realm: str = "master", client_id: str = "admin-cli"):
        self.base_url = base_url.rstrip("/")
        self.realm = realm
        self._username = username
        self._password = password
        self._token_realm = token_realm
        self._client_id = client_id
        self._token: Optional[str] = None
        self._token_expiry = 0.0
        self._role_cache: dict[str, dict] = {}

    # ── transport ───────────────────────────────────────────────────────────

    def _access_token(self) -> str:
        if self._token and time.monotonic() < self._token_expiry:
            return self._token
        body = urllib.parse.urlencode({
            "grant_type": "password",
            "client_id": self._client_id,
            "username": self._username,
            "password": self._password,
        }).encode()
        url = f"{self.base_url}/realms/{self._token_realm}/protocol/openid-connect/token"
        request = urllib.request.Request(
            url, data=body, headers={"Content-Type": "application/x-www-form-urlencoded"})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.load(response)
        except urllib.error.HTTPError as error:
            raise KeycloakError(
                f"cannot obtain an admin token from {url}: HTTP {error.code}. "
                "Check KC_BOOTSTRAP_ADMIN_USERNAME / KC_BOOTSTRAP_ADMIN_PASSWORD in .env."
            ) from error
        except urllib.error.URLError as error:
            raise KeycloakError(f"Keycloak is unreachable at {self.base_url}: {error.reason}") from error
        self._token = payload["access_token"]
        self._token_expiry = time.monotonic() + max(30, int(payload.get("expires_in", 60)) - 15)
        return self._token

    def _call(self, method: str, path: str, body: Optional[dict] = None,
              expect_json: bool = True):
        url = f"{self.base_url}/admin/realms/{self.realm}{path}"
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Authorization": f"Bearer {self._access_token()}"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                if not expect_json or response.status == 204:
                    return None
                raw = response.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")[:400]
            raise KeycloakError(f"{method} {path} → HTTP {error.code}: {detail}") from error
        except urllib.error.URLError as error:
            raise KeycloakError(f"{method} {path} failed: {error.reason}") from error

    # ── realm inspection ────────────────────────────────────────────────────

    def realm_exists(self) -> bool:
        try:
            self._call("GET", "")
            return True
        except KeycloakError:
            return False

    def realm_role(self, name: str) -> dict:
        if name not in self._role_cache:
            role = self._call("GET", f"/roles/{urllib.parse.quote(name)}")
            self._role_cache[name] = {
                "id": role["id"], "name": role["name"],
            }
        return self._role_cache[name]

    # ── users ───────────────────────────────────────────────────────────────

    def find_user(self, username: str) -> Optional[dict]:
        found = self._call(
            "GET", f"/users?username={urllib.parse.quote(username)}&exact=true&max=2")
        for candidate in found or []:
            if candidate.get("username", "").lower() == username.lower():
                return candidate
        return None

    def list_users_by_email_domain(self, domain: str, page_size: int = 200) -> list[dict]:
        """Every user whose email ends with `@domain` (used by --reset)."""
        matches: list[dict] = []
        first = 0
        while True:
            page = self._call("GET", f"/users?first={first}&max={page_size}") or []
            for user in page:
                email = (user.get("email") or "").lower()
                if email.endswith("@" + domain.lower()):
                    matches.append(user)
            if len(page) < page_size:
                return matches
            first += page_size

    def create_user(self, username: str, email: str, first_name: str, last_name: str,
                    enabled: bool) -> str:
        """Create the account and return its subject id (idempotent by username)."""
        existing = self.find_user(username)
        if existing:
            self.update_user(existing["id"], email, first_name, last_name, enabled)
            return existing["id"]
        self._call("POST", "/users", {
            "username": username,
            "email": email,
            "firstName": first_name,
            "lastName": last_name,
            "enabled": enabled,
            "emailVerified": True,
        }, expect_json=False)
        created = self.find_user(username)
        if not created:
            raise KeycloakError(f"user {username} was created but cannot be read back")
        return created["id"]

    def update_user(self, user_id: str, email: str, first_name: str, last_name: str,
                    enabled: bool) -> None:
        self._call("PUT", f"/users/{user_id}", {
            "email": email,
            "firstName": first_name,
            "lastName": last_name,
            "enabled": enabled,
            "emailVerified": True,
        }, expect_json=False)

    def set_password(self, user_id: str, password: str, temporary: bool = False) -> None:
        self._call("PUT", f"/users/{user_id}/reset-password", {
            "type": "password", "value": password, "temporary": temporary,
        }, expect_json=False)

    def assign_realm_role(self, user_id: str, role_name: str) -> None:
        """Give the account exactly one realm role — the resolver's contract."""
        current = self._call("GET", f"/users/{user_id}/role-mappings/realm") or []
        keep = [role for role in current if role.get("name") == role_name]
        drop = [role for role in current
                if role.get("name") in ("EMPLOYEE", "MANAGER", "HR", "ADMIN")
                and role.get("name") != role_name]
        if drop:
            self._call("DELETE", f"/users/{user_id}/role-mappings/realm",
                       [{"id": role["id"], "name": role["name"]} for role in drop],
                       expect_json=False)
        if not keep:
            role = self.realm_role(role_name)
            self._call("POST", f"/users/{user_id}/role-mappings/realm", [role], expect_json=False)

    def delete_user(self, user_id: str) -> None:
        self._call("DELETE", f"/users/{user_id}", expect_json=False)
