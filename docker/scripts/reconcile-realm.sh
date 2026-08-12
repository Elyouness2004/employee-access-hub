#!/usr/bin/env bash
# Reconcile the RUNNING employee-hub realm with the committed export + .env.
#
# WHY THIS EXISTS
# ---------------
# `keycloak --import-realm` only imports a realm that does NOT exist yet. Once
# `employee-hub` is in the pgdata volume, every later change to
# keycloak-config/realm-employee-hub.json is silently ignored on every restart.
# A stack first started before those changes landed therefore keeps running an
# old realm, and the symptoms are remote from the cause:
#
#   * no `smtpServer`  -> Keycloak has no mail server, `execute-actions-email`
#                         fails, hr-service reports activationEmailSent=false and
#                         no password-reset mail is ever delivered;
#   * no `hr-provisioner` client (or a stale secret) -> hr-service cannot get an
#                         admin token, so every identity action answers
#                         503 "Identity provider unavailable".
#
# Re-importing means deleting pgdata, which also destroys the seeded demo
# dataset. So this converges just the drifted pieces through the Admin API.
# The realm export stays the source of truth for a FRESH import; this brings an
# EXISTING realm up to it. Idempotent — a no-op once the realm matches.
#
# Usage: reconcile-realm.sh [path/to/.env]
#   KC_URL (default http://localhost:8081) — Keycloak as reachable from the host.
set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${1:-$ROOT/.env}"
KC_URL="${KC_URL:-http://localhost:8081}"
REALM="${KEYCLOAK_REALM:-employee-hub}"

PASS=0
FAIL=0
ok()  { echo "PASS  $1"; PASS=$((PASS+1)); }
bad() { echo "FAIL  $1" >&2; FAIL=$((FAIL+1)); }

get() { # $1=var -> value from .env (last assignment wins, quotes stripped)
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^[[:space:]]*$1=//p" "$ENV_FILE" | tail -1 | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

ADMIN_USER="$(get KC_BOOTSTRAP_ADMIN_USERNAME)"; ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="$(get KC_BOOTSTRAP_ADMIN_PASSWORD)"
PROVISIONER_ID="$(get KEYCLOAK_ADMIN_CLIENT_ID)"; PROVISIONER_ID="${PROVISIONER_ID:-hr-provisioner}"
PROVISIONER_SECRET="$(get KEYCLOAK_ADMIN_CLIENT_SECRET)"

if [ -z "$ADMIN_PASS" ]; then
  bad "KC_BOOTSTRAP_ADMIN_PASSWORD is not set in $ENV_FILE"
  exit 1
fi

# Same defaults as docker-compose.yml, so an .env without the KC_SMTP_* block
# still lands on the dev sink rather than on nothing.
SMTP_HOST="$(get KC_SMTP_HOST)";                 SMTP_HOST="${SMTP_HOST:-mailpit}"
SMTP_PORT="$(get KC_SMTP_PORT)";                 SMTP_PORT="${SMTP_PORT:-1025}"
SMTP_FROM="$(get KC_SMTP_FROM)";                 SMTP_FROM="${SMTP_FROM:-no-reply@hub.local}"
SMTP_DISPLAY="$(get KC_SMTP_FROM_DISPLAY_NAME)"; SMTP_DISPLAY="${SMTP_DISPLAY:-Employee Access Hub}"
SMTP_REPLY_TO="$(get KC_SMTP_REPLY_TO)";         SMTP_REPLY_TO="${SMTP_REPLY_TO:-no-reply@hub.local}"
SMTP_SSL="$(get KC_SMTP_SSL)";                   SMTP_SSL="${SMTP_SSL:-false}"
SMTP_STARTTLS="$(get KC_SMTP_STARTTLS)";         SMTP_STARTTLS="${SMTP_STARTTLS:-false}"
SMTP_AUTH="$(get KC_SMTP_AUTH)";                 SMTP_AUTH="${SMTP_AUTH:-false}"
SMTP_USER="$(get KC_SMTP_USER)"
SMTP_PASSWORD="$(get KC_SMTP_PASSWORD)"
# Browser-facing base URL. Keycloak otherwise builds links from the request Host
# header, so the action token mailed on hr-service's behalf came out pointing at
# http://keycloak:8080/... — unresolvable from a browser. Derived from
# KEYCLOAK_ISSUER_URI so the two cannot drift apart.
FRONTEND_URL="$(get KC_FRONTEND_URL)"
if [ -z "$FRONTEND_URL" ]; then
  ISSUER="$(get KEYCLOAK_ISSUER_URI)"
  FRONTEND_URL="$(printf '%s' "${ISSUER:-http://localhost:8081/realms/employee-hub}" | sed -E 's#(https?://[^/]+).*#\1#')"
fi

api() { # $1=method $2=path [stdin body] -> body on stdout, status in API_STATUS
  local method="$1" path="$2" out
  out="$(curl -s -w '\n%{http_code}' --max-time 20 -X "$method" "$KC_URL$path" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    "${@:3}")"
  API_STATUS="${out##*$'\n'}"
  printf '%s' "${out%$'\n'*}"
}

TOKEN="$(curl -s --max-time 15 -X POST "$KC_URL/realms/master/protocol/openid-connect/token" \
  -d 'grant_type=password' -d 'client_id=admin-cli' \
  --data-urlencode "username=$ADMIN_USER" --data-urlencode "password=$ADMIN_PASS" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null)"
if [ -z "$TOKEN" ]; then
  bad "cannot obtain a Keycloak admin token from $KC_URL (is the stack up?)"
  exit 1
fi

CURRENT_REALM="$(api GET "/admin/realms/$REALM")"
if ! printf '%s' "$CURRENT_REALM" | grep -q '"realm"'; then
  bad "realm '$REALM' not found at $KC_URL"
  exit 1
fi

# ---------------------------------------------------------------- SMTP -------
# A realm PUT replaces the whole representation, so the SMTP block is merged into
# the realm as it is now — sending only smtpServer would blank every other realm
# setting.
MERGED="$(printf '%s' "$CURRENT_REALM" \
  | REALM_SMTP_HOST="$SMTP_HOST" REALM_SMTP_PORT="$SMTP_PORT" REALM_SMTP_FROM="$SMTP_FROM" \
    REALM_SMTP_DISPLAY="$SMTP_DISPLAY" REALM_SMTP_REPLY_TO="$SMTP_REPLY_TO" REALM_SMTP_SSL="$SMTP_SSL" \
    REALM_SMTP_STARTTLS="$SMTP_STARTTLS" REALM_SMTP_AUTH="$SMTP_AUTH" REALM_SMTP_USER="$SMTP_USER" \
    REALM_SMTP_PASSWORD="$SMTP_PASSWORD" REALM_FRONTEND_URL="$FRONTEND_URL" python3 -c '
import json, os, sys

realm = json.load(sys.stdin)
desired = {
    "host": os.environ["REALM_SMTP_HOST"],
    "port": os.environ["REALM_SMTP_PORT"],
    "from": os.environ["REALM_SMTP_FROM"],
    "fromDisplayName": os.environ["REALM_SMTP_DISPLAY"],
    "replyTo": os.environ["REALM_SMTP_REPLY_TO"],
    "ssl": os.environ["REALM_SMTP_SSL"],
    "starttls": os.environ["REALM_SMTP_STARTTLS"],
    "auth": os.environ["REALM_SMTP_AUTH"],
}
# Keycloak stores SMTP credentials only when auth is on; sending empty strings
# otherwise makes the console show a configured-but-blank user.
if desired["auth"] == "true":
    desired["user"] = os.environ["REALM_SMTP_USER"]
    desired["password"] = os.environ["REALM_SMTP_PASSWORD"]

current = realm.get("smtpServer") or {}
# Keycloak masks a stored password as ********** on read, so comparing it would
# report a change on every run.
comparable = {k: v for k, v in current.items() if k != "password"}
expected = {k: v for k, v in desired.items() if k != "password"}
realm["smtpServer"] = desired

frontend = os.environ["REALM_FRONTEND_URL"]
attributes = realm.get("attributes") or {}
frontend_changed = attributes.get("frontendUrl") != frontend
attributes["frontendUrl"] = frontend
realm["attributes"] = attributes

print(json.dumps({
    "changed": comparable != expected or frontend_changed,
    "smtpChanged": comparable != expected,
    "frontendChanged": frontend_changed,
    "realm": realm,
}))
')"

if [ "$(printf '%s' "$MERGED" | python3 -c 'import sys,json; print(json.load(sys.stdin)["changed"])')" = "False" ]; then
  ok "SMTP already matches .env ($SMTP_HOST:$SMTP_PORT, from $SMTP_FROM)"
  ok "frontendUrl already $FRONTEND_URL (action links are browser-resolvable)"
else
  printf '%s' "$MERGED" \
    | python3 -c 'import sys,json; sys.stdout.write(json.dumps(json.load(sys.stdin)["realm"]))' \
    > /tmp/reconcile-realm.$$.json
  api PUT "/admin/realms/$REALM" --data-binary @/tmp/reconcile-realm.$$.json >/dev/null
  rm -f /tmp/reconcile-realm.$$.json
  case "$API_STATUS" in
    2*) ok "realm updated -> SMTP $SMTP_HOST:$SMTP_PORT (from $SMTP_FROM), frontendUrl $FRONTEND_URL" ;;
    *)  bad "realm update rejected by Keycloak (HTTP $API_STATUS)" ;;
  esac
fi

# ------------------------------------------------- hr-provisioner client -----
if [ -z "$PROVISIONER_SECRET" ]; then
  bad "KEYCLOAK_ADMIN_CLIENT_SECRET is not set in $ENV_FILE"
else
  CLIENT_UUID="$(api GET "/admin/realms/$REALM/clients?clientId=$PROVISIONER_ID" \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d[0]["id"] if d else "")')"

  # Mirrors the client block in keycloak-config/realm-employee-hub.json: a
  # confidential client-credentials account with no browser or direct-grant flow.
  REPRESENTATION="$(PROVISIONER_ID="$PROVISIONER_ID" PROVISIONER_SECRET="$PROVISIONER_SECRET" python3 -c '
import json, os
print(json.dumps({
    "clientId": os.environ["PROVISIONER_ID"],
    "name": "HR identity provisioning service account",
    "description": "Client-credentials service account for hr-service identity provisioning (FR-12). "
                   "Least privilege: manage-users, view-users, view-realm.",
    "enabled": True,
    "protocol": "openid-connect",
    "publicClient": False,
    "standardFlowEnabled": False,
    "implicitFlowEnabled": False,
    "directAccessGrantsEnabled": False,
    "serviceAccountsEnabled": True,
    "fullScopeAllowed": True,
    "secret": os.environ["PROVISIONER_SECRET"],
    "redirectUris": [],
    "webOrigins": [],
}))')"

  if [ -z "$CLIENT_UUID" ]; then
    printf '%s' "$REPRESENTATION" > /tmp/reconcile-client.$$.json
    api POST "/admin/realms/$REALM/clients" --data-binary @/tmp/reconcile-client.$$.json >/dev/null
    rm -f /tmp/reconcile-client.$$.json
    case "$API_STATUS" in
      2*) ok "client '$PROVISIONER_ID' created (the realm predates it)"
          CLIENT_UUID="$(api GET "/admin/realms/$REALM/clients?clientId=$PROVISIONER_ID" \
            | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d[0]["id"] if d else "")')" ;;
      *)  bad "creating client '$PROVISIONER_ID' was rejected (HTTP $API_STATUS)" ;;
    esac
  else
    printf '%s' "$REPRESENTATION" > /tmp/reconcile-client.$$.json
    api PUT "/admin/realms/$REALM/clients/$CLIENT_UUID" --data-binary @/tmp/reconcile-client.$$.json >/dev/null
    rm -f /tmp/reconcile-client.$$.json
    case "$API_STATUS" in
      2*) ok "client '$PROVISIONER_ID' settings + secret reconciled with .env" ;;
      *)  bad "updating client '$PROVISIONER_ID' was rejected (HTTP $API_STATUS)" ;;
    esac
  fi

  # ------------------------------------- service-account realm-management ----
  if [ -n "$CLIENT_UUID" ]; then
    SA_ID="$(api GET "/admin/realms/$REALM/clients/$CLIENT_UUID/service-account-user" \
      | python3 -c 'import sys,json; print(json.load(sys.stdin).get("id",""))')"
    RM_UUID="$(api GET "/admin/realms/$REALM/clients?clientId=realm-management" \
      | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d[0]["id"] if d else "")')"

    if [ -z "$SA_ID" ] || [ -z "$RM_UUID" ]; then
      bad "cannot resolve the service-account user or realm-management client"
    else
      # Exactly the three roles the adapter documents — least privilege. Granting
      # is additive; roles already held are filtered out so this stays idempotent.
      GRANTED="$(api GET "/admin/realms/$REALM/users/$SA_ID/role-mappings/clients/$RM_UUID")"
      AVAILABLE="$(api GET "/admin/realms/$REALM/users/$SA_ID/role-mappings/clients/$RM_UUID/available")"
      MISSING="$(GRANTED_JSON="$GRANTED" AVAILABLE_JSON="$AVAILABLE" python3 -c '
import json, os
wanted = {"manage-users", "view-users", "view-realm"}
have = {r["name"] for r in json.loads(os.environ["GRANTED_JSON"])}
available = {r["name"]: r for r in json.loads(os.environ["AVAILABLE_JSON"])}
missing = [available[n] for n in sorted(wanted - have) if n in available]
print(json.dumps(missing))')"

      if [ "$MISSING" = "[]" ]; then
        ok "service account already holds manage-users, view-users, view-realm"
      else
        printf '%s' "$MISSING" > /tmp/reconcile-roles.$$.json
        api POST "/admin/realms/$REALM/users/$SA_ID/role-mappings/clients/$RM_UUID" \
          --data-binary @/tmp/reconcile-roles.$$.json >/dev/null
        rm -f /tmp/reconcile-roles.$$.json
        case "$API_STATUS" in
          2*) ok "granted realm-management roles: $(printf '%s' "$MISSING" | python3 -c 'import sys,json; print(", ".join(r["name"] for r in json.load(sys.stdin)))')" ;;
          *)  bad "granting realm-management roles was rejected (HTTP $API_STATUS)" ;;
        esac
      fi
    fi
  fi

  # Prove it end-to-end rather than trusting the writes: the adapter's very first
  # call is this client-credentials grant, so a failure here is the 503 the UI shows.
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
        -X POST "$KC_URL/realms/$REALM/protocol/openid-connect/token" \
        -d 'grant_type=client_credentials' \
        --data-urlencode "client_id=$PROVISIONER_ID" \
        --data-urlencode "client_secret=$PROVISIONER_SECRET")" = "200" ]; then
    ok "client-credentials grant works for '$PROVISIONER_ID' in realm '$REALM'"
  else
    bad "client-credentials grant still fails for '$PROVISIONER_ID' — hr-service will answer 503"
  fi
fi

echo
echo "== Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
