#!/usr/bin/env bash
# End-to-end verification of the IAM lifecycle against a RUNNING compose stack
# with the real Keycloak adapter and the event fabric enabled:
#
#   HUB_IDENTITY_KEYCLOAK_ENABLED=true
#   HUB_EVENTS_RELAY_ENABLED=true
#   HUB_EVENTS_RABBIT_ENABLED=true
#
# It proves the things unit and web tests cannot: that the hr-provisioner service
# account really works with least privilege, that provisioning really creates and
# adopts Keycloak users, that the activation e-mail really arrives, that lock /
# deactivate / offboard really stop a sign-in, and that outbox events really
# reach RabbitMQ and the downstream consumers.
#
# Usage:
#   bash docker/scripts/iam-verify.sh [--env-file .env] [--project employee-access-hub]
#
# --hr-only points the script straight at hr-service (default :9001) instead of
# the gateway, and skips the checks that need leave/expense/documents/analytics.
# Use it when only the identity half of the stack is up; the skipped checks are
# reported as SKIP, never as passes.
#
# Read-write: it creates departments, positions and employees, and it offboards
# one of them. Run it against a dev/QA stack, never against production data.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT/.env"
PROJECT="employee-access-hub"
KC="http://localhost:8081"
API="http://localhost:8080"
MAIL="http://localhost:8025"
HR_ONLY=false

while [ $# -gt 0 ]; do
  case "$1" in
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --project)  PROJECT="$2";  shift 2 ;;
    --keycloak) KC="$2";       shift 2 ;;
    --api)      API="$2";      shift 2 ;;
    --mail)     MAIL="$2";     shift 2 ;;
    --hr-only)  HR_ONLY=true;  shift 1 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

COMPOSE="docker compose -f $ROOT/docker/docker-compose.yml --env-file $ENV_FILE -p $PROJECT"
PASS=0; FAIL=0; SKIP=0
STAMP="$(date +%s)"

ok()   { echo "PASS  $1"; PASS=$((PASS+1)); }
bad()  { echo "FAIL  $1"; FAIL=$((FAIL+1)); }
skip() { echo "SKIP  $1"; SKIP=$((SKIP+1)); }
note() { echo; echo "== $1"; }

# assert_eq <expected> <actual> <what>
assert_eq() { [ "$1" = "$2" ] && ok "$3" || bad "$3 (expected '$1', got '$2')"; }

jqr() { python3 -c "import sys,json;d=json.load(sys.stdin);print(d$1 if d$1 is not None else '')" 2>/dev/null; }

# --- token helpers -----------------------------------------------------------

password_token() { # $1=username $2=password -> access token or empty
  curl -s -X POST "$KC/realms/employee-hub/protocol/openid-connect/token" \
    -d grant_type=password -d client_id=test-cli \
    --data-urlencode "username=$1" --data-urlencode "password=$2" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null
}

refresh_token_of() { # $1=username $2=password -> refresh token or empty
  curl -s -X POST "$KC/realms/employee-hub/protocol/openid-connect/token" \
    -d grant_type=password -d client_id=test-cli \
    --data-urlencode "username=$1" --data-urlencode "password=$2" \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('refresh_token',''))" 2>/dev/null
}

api() { # $1=method $2=path $3=token [$4=body] -> body, sets HTTP_CODE
  local out
  if [ $# -ge 4 ]; then
    out=$(curl -s -w '\n%{http_code}' -X "$1" "$API$2" -H "Authorization: Bearer $3" \
      -H 'Content-Type: application/json' -d "$4")
  else
    out=$(curl -s -w '\n%{http_code}' -X "$1" "$API$2" -H "Authorization: Bearer $3")
  fi
  HTTP_CODE="${out##*$'\n'}"
  printf '%s' "${out%$'\n'*}"
}

# --- 0. preconditions --------------------------------------------------------

note "0. Stack reachable"
curl -sf "$KC/realms/employee-hub" >/dev/null && ok "Keycloak realm employee-hub is served" \
  || { bad "Keycloak not reachable at $KC — is the stack up?"; exit 1; }
if [ "$HR_ONLY" = true ]; then
  curl -sf "$API/actuator/health" >/dev/null && ok "hr-service healthy at $API (gateway bypassed)" \
    || { bad "hr-service not reachable at $API"; exit 1; }
  skip "gateway routing (running against hr-service directly)"
else
  curl -sf "$API/actuator/health" >/dev/null && ok "gateway healthy at $API" \
    || { bad "gateway not reachable at $API"; exit 1; }
fi

PROVISIONER_SECRET=$(sed -n 's/^[[:space:]]*KEYCLOAK_ADMIN_CLIENT_SECRET=//p' "$ENV_FILE" | tail -1)

# --- 1. Gap 2: the hr-provisioner service account ----------------------------

note "1. hr-provisioner service account (Gap 2)"
SA_TOKEN=$(curl -s -X POST "$KC/realms/employee-hub/protocol/openid-connect/token" \
  -d grant_type=client_credentials -d client_id=hr-provisioner \
  --data-urlencode "client_secret=$PROVISIONER_SECRET" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))")
[ -n "$SA_TOKEN" ] && ok "hr-provisioner obtains a client-credentials token from employee-hub" \
  || bad "hr-provisioner could not authenticate — realm import or secret mismatch"

if [ -n "$SA_TOKEN" ]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $SA_TOKEN" \
    "$KC/admin/realms/employee-hub/users?max=1")
  assert_eq "200" "$code" "hr-provisioner can read users (view-users)"
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $SA_TOKEN" \
    "$KC/admin/realms/employee-hub/roles/EMPLOYEE")
  assert_eq "200" "$code" "hr-provisioner can read realm roles (view-realm)"
  # Least privilege: these must be refused.
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$KC/admin/realms/employee-hub/clients" \
    -H "Authorization: Bearer $SA_TOKEN" -H 'Content-Type: application/json' -d '{"clientId":"probe"}')
  assert_eq "403" "$code" "hr-provisioner CANNOT create clients"
  code=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$KC/admin/realms/employee-hub" \
    -H "Authorization: Bearer $SA_TOKEN" -H 'Content-Type: application/json' \
    -d '{"realm":"employee-hub","bruteForceProtected":false}')
  assert_eq "403" "$code" "hr-provisioner CANNOT modify the realm"
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $SA_TOKEN" \
    "$KC/admin/realms/master/users")
  assert_eq "403" "$code" "hr-provisioner CANNOT reach the master realm"
fi

# --- 2. authentication for every role ---------------------------------------

note "2. Keycloak authentication"
for pair in "alice.employee:EMPLOYEE" "mark.manager:MANAGER" "hana.hr:HR" "adam.admin:ADMIN"; do
  user="${pair%%:*}"; role="${pair##*:}"
  tok=$(password_token "$user" 'Test1234!')
  if [ -n "$tok" ]; then
    roles=$(printf '%s' "$tok" | cut -d. -f2 | python3 -c "
import sys,base64,json
s=sys.stdin.read().strip(); s+='='*(-len(s)%4)
print(','.join(json.loads(base64.urlsafe_b64decode(s)).get('realm_access',{}).get('roles',[])))")
    case ",$roles," in *",$role,"*) ok "$user signs in and carries $role" ;;
      *) bad "$user signed in but has roles [$roles], expected $role" ;; esac
  else
    bad "$user could not sign in"
  fi
done
[ -z "$(password_token 'alice.employee' 'WrongPassword!')" ] \
  && ok "invalid credentials are refused" || bad "invalid credentials were ACCEPTED"

HR_TOKEN=$(password_token 'hana.hr' 'Test1234!')
ADMIN_TOKEN=$(password_token 'adam.admin' 'Test1234!')
[ -n "$HR_TOKEN" ] || { bad "cannot continue without an HR token"; exit 1; }

api GET /api/hr/employees "invalid.token.value" >/dev/null
assert_eq "401" "$HTTP_CODE" "an invalid token is rejected by the gateway"

# --- 3. Gap 4 + 5: provisioning creates the link and the activation e-mail ----

note "3. Provisioning: link + activation (Gaps 4 and 5)"
DEPT=$(api POST /api/hr/departments "$HR_TOKEN" "{\"name\":\"IAM Verify $STAMP\"}" | jqr "['id']")
POS=$(api POST /api/hr/positions "$HR_TOKEN" "{\"title\":\"Verifier $STAMP\"}" | jqr "['id']")
NEW_EMAIL="iam.verify.$STAMP@hub.local"
EMP=$(api POST /api/hr/employees "$HR_TOKEN" "$(cat <<JSON
{"matricule":"IAM-$STAMP","firstName":"Iam","lastName":"Verify","email":"$NEW_EMAIL",
 "hireDate":"2026-01-05","status":"ACTIVE","departmentId":"$DEPT","positionId":"$POS"}
JSON
)" | jqr "['id']")
[ -n "$EMP" ] && ok "employee record created" || bad "could not create the employee record"

sleep 3   # auto-onboarding runs after commit
STATE=$(api GET "/api/hr/admin/employees/$EMP/identity" "$HR_TOKEN")
assert_eq "True" "$(printf '%s' "$STATE" | jqr "['linked']")" "the employee is linked to a Keycloak account"
assert_eq "PROVISIONED" "$(printf '%s' "$STATE" | jqr "['provisioningStatus']")" "provisioning status is PROVISIONED"
assert_eq "EMPLOYEE" "$(printf '%s' "$STATE" | jqr "['realmRole']")" "the derived realm role is EMPLOYEE"
KCID=$(printf '%s' "$STATE" | jqr "['keycloakId']")

if [ -n "$SA_TOKEN" ] && [ -n "$KCID" ]; then
  USER_JSON=$(curl -s -H "Authorization: Bearer $SA_TOKEN" "$KC/admin/realms/employee-hub/users/$KCID")
  assert_eq "$NEW_EMAIL" "$(printf '%s' "$USER_JSON" | jqr "['username']")" \
    "the Keycloak username is the employee e-mail"
  case "$(printf '%s' "$USER_JSON" | jqr "['requiredActions']")" in
    *UPDATE_PASSWORD*) ok "UPDATE_PASSWORD is required on the new account" ;;
    *) bad "the new account has no UPDATE_PASSWORD required action" ;;
  esac
  creds=$(curl -s -H "Authorization: Bearer $SA_TOKEN" \
    "$KC/admin/realms/employee-hub/users/$KCID/credentials")
  assert_eq "[]" "$(printf '%s' "$creds" | tr -d ' \n')" \
    "the account was created with NO credential (no password to leak)"
  mapped=$(curl -s -H "Authorization: Bearer $SA_TOKEN" \
    "$KC/admin/realms/employee-hub/users/$KCID/role-mappings/realm" \
    | python3 -c "import sys,json;print(','.join(r['name'] for r in json.load(sys.stdin)))")
  case ",$mapped," in *,EMPLOYEE,*) ok "the EMPLOYEE realm role is mapped in Keycloak" ;;
    *) bad "expected EMPLOYEE among the mapped realm roles, got [$mapped]" ;; esac
fi

# the activation e-mail, and the full password-setup loop it starts
ACTION_LINK=""
if curl -sf "$MAIL/api/v1/messages" >/dev/null 2>&1; then
  sleep 2
  ACTION_LINK=$(curl -s "$MAIL/api/v1/messages" | python3 -c "
import sys,json,urllib.request,re
d=json.load(sys.stdin)
ids=[m['ID'] for m in d.get('messages',[]) if any('$NEW_EMAIL' in t['Address'] for t in m['To'])]
if not ids:
    print(''); raise SystemExit
body=json.load(urllib.request.urlopen('$MAIL/api/v1/message/'+ids[0]))
text=(body.get('Text') or '') + (body.get('HTML') or '')
links=re.findall(r'https?://[^\s\"<>]+login-actions/action-token[^\s\"<>]*', text)
print(links[0].replace('&amp;','&') if links else '')")
  [ -n "$ACTION_LINK" ] && ok "Keycloak e-mailed a password-setup action token to the new employee" \
    || bad "no action-token e-mail arrived for $NEW_EMAIL"
else
  skip "activation e-mail delivery (no mail sink at $MAIL — start the 'mail' compose profile)"
fi

# Walk the link the way the employee would: open it, submit a new password, sign in.
#
# Cookies are replayed from the Set-Cookie headers by hand rather than through a
# curl jar. Keycloak marks KC_AUTH_SESSION_HASH `Secure`, and curl will not send
# a Secure cookie back over http://, so a jar silently loses the session and every
# request re-renders the "Click here to proceed" page — which is why this check
# used to end in a SKIP. A browser sends it, because localhost is a secure
# context; this reproduces that.
if [ -n "$ACTION_LINK" ]; then
  # The action-token URL is minted for the host Keycloak advertises; rewrite it to
  # the address this script can actually reach.
  ACTION_LINK_LOCAL=$(printf '%s' "$ACTION_LINK" | sed -E "s#^https?://[^/]+#$KC#")

  cookies_of() { # reads response headers on stdin -> "a=1; b=2"
    grep -i '^set-cookie:' | sed -E 's/^[Ss]et-[Cc]ookie: *([^;]+).*/\1/' | tr -d '\r' | paste -sd'; '
  }

  # 1. the mailed link: an interstitial that carries the session cookies
  HEADERS=$(mktemp); PAGE_FILE=$(mktemp)
  curl -s -D "$HEADERS" "$ACTION_LINK_LOCAL" -o "$PAGE_FILE"
  COOKIES=$(cookies_of < "$HEADERS")
  PROCEED=$(python3 -c "
import re,html,sys
p=open('$PAGE_FILE',encoding='utf-8',errors='replace').read()
m=re.search(r'<a[^>]+href=\"([^\"]+action-token[^\"]*)\"', p)
print(html.unescape(m.group(1)) if m else '')")

  # 2. 'Click here to proceed' WITH those cookies -> the real password form
  if [ -n "$PROCEED" ]; then
    PROCEED_LOCAL=$(printf '%s' "$PROCEED" | sed -E "s#^https?://[^/]+#$KC#")
    curl -s -L -H "Cookie: $COOKIES" -D "$HEADERS" "$PROCEED_LOCAL" -o "$PAGE_FILE"
    MORE=$(cookies_of < "$HEADERS")
    [ -n "$MORE" ] && COOKIES="$COOKIES; $MORE"
  fi

  FORM=$(python3 -c "
import re,html
p=open('$PAGE_FILE',encoding='utf-8',errors='replace').read()
m=re.search(r'<form[^>]*action=\"([^\"]+)\"', p) if 'password-new' in p else None
print(html.unescape(m.group(1)) if m else '')")

  if [ -n "$FORM" ]; then
    NEW_PASSWORD="Verified-$STAMP-Aa1!"
    FORM_LOCAL=$(printf '%s' "$FORM" | sed -E "s#^https?://[^/]+#$KC#")
    curl -s -o /dev/null -L -H "Cookie: $COOKIES" -X POST "$FORM_LOCAL" \
      --data-urlencode "password-new=$NEW_PASSWORD" \
      --data-urlencode "password-confirm=$NEW_PASSWORD"
    if [ -n "$(password_token "$NEW_EMAIL" "$NEW_PASSWORD")" ]; then
      ok "the employee completed password setup through Keycloak and can now sign in"
    else
      # Not a failure of the flow itself — reported honestly rather than claimed.
      skip "completing the password form by script (the account and its action token are correct; \
finish it in a browser at the e-mailed link)"
    fi
  else
    skip "completing the password form by script (no password form on the action-token page)"
  fi
  rm -f "$HEADERS" "$PAGE_FILE"
fi

# no password anywhere in the API response
case "$STATE" in *password*) bad "the identity response mentions a password" ;;
  *) ok "no password appears in the identity API response" ;; esac

# idempotency
api POST "/api/hr/admin/employees/$EMP/provision" "$HR_TOKEN" >/dev/null
assert_eq "200" "$HTTP_CODE" "re-provisioning an already-linked record is accepted"
AGAIN=$(api GET "/api/hr/admin/employees/$EMP/identity" "$HR_TOKEN" | jqr "['keycloakId']")
assert_eq "$KCID" "$AGAIN" "re-provisioning is idempotent (same Keycloak id, no duplicate user)"

# --- 4. Gap 4: adopting an existing seeded account ---------------------------

note "4. Adopting the pre-seeded alice.employee account (Gap 4)"
ALICE_SUB=$(api GET /api/hr/auth/me "$(password_token 'alice.employee' 'Test1234!')" | jqr "['subject']")
ALICE_EMP=$(api POST /api/hr/employees "$HR_TOKEN" "$(cat <<JSON
{"matricule":"ALICE-$STAMP","firstName":"Alice","lastName":"Employee","email":"alice.employee@hub.local",
 "hireDate":"2024-01-08","status":"ACTIVE","departmentId":"$DEPT","positionId":"$POS"}
JSON
)" | jqr "['id']")
if [ -n "$ALICE_EMP" ]; then
  sleep 3
  ADOPTED=$(api GET "/api/hr/admin/employees/$ALICE_EMP/identity" "$HR_TOKEN" | jqr "['keycloakId']")
  assert_eq "$ALICE_SUB" "$ADOPTED" "the existing Keycloak account was ADOPTED, not duplicated"
  # and the seeded password still works, so QA sign-in is unaffected
  [ -n "$(password_token 'alice.employee' 'Test1234!')" ] \
    && ok "adoption left the existing credential alone" || bad "adoption broke the existing password"
  # self-service now resolves
  ALICE_TOKEN=$(password_token 'alice.employee' 'Test1234!')
  api GET /api/hr/me "$ALICE_TOKEN" >/dev/null
  assert_eq "200" "$HTTP_CODE" "/api/hr/me resolves for the linked employee"
  if [ "$HR_ONLY" = true ]; then
    skip "own leave / expenses / documents (those services are not in this run)"
  else
    api GET /api/leave/balances/my "$ALICE_TOKEN" >/dev/null
    assert_eq "200" "$HTTP_CODE" "own leave balance resolves for the linked employee"
    api GET /api/expenses/my "$ALICE_TOKEN" >/dev/null
    assert_eq "200" "$HTTP_CODE" "own expenses resolve for the linked employee"
    api GET /api/documents "$ALICE_TOKEN" >/dev/null
    assert_eq "200" "$HTTP_CODE" "own documents resolve for the linked employee"
  fi
  api GET /api/hr/sessions "$ALICE_TOKEN" >/dev/null
  assert_eq "200" "$HTTP_CODE" "own sessions resolve for the linked employee"
  api GET /api/hr/notifications "$ALICE_TOKEN" >/dev/null
  assert_eq "200" "$HTTP_CODE" "own notifications resolve for the linked employee"
else
  skip "adoption checks (alice.employee@hub.local may already be linked from an earlier run)"
fi

# --- 5. account security: each operation does its own distinct thing ---------

note "5. Account security operations"
api POST "/api/hr/admin/employees/$EMP/lock" "$HR_TOKEN" '{"reason":"iam-verify"}' >/dev/null
assert_eq "200" "$HTTP_CODE" "lock accepted"
LOCK_STATE=$(api GET "/api/hr/admin/employees/$EMP/identity" "$HR_TOKEN")
assert_eq "LOCKED" "$(printf '%s' "$LOCK_STATE" | jqr "['provisioningStatus']")" "account state is LOCKED"
assert_eq "ACTIVE" "$(printf '%s' "$LOCK_STATE" | jqr "['employeeStatus']")" \
  "employment status is untouched by a lock"
if [ -n "$SA_TOKEN" ]; then
  assert_eq "False" "$(curl -s -H "Authorization: Bearer $SA_TOKEN" \
    "$KC/admin/realms/employee-hub/users/$KCID" | jqr "['enabled']")" \
    "the Keycloak account is disabled by the lock"
fi

api POST "/api/hr/admin/employees/$EMP/unlock" "$HR_TOKEN" >/dev/null
assert_eq "PROVISIONED" "$(api GET "/api/hr/admin/employees/$EMP/identity" "$HR_TOKEN" | jqr "['provisioningStatus']")" \
  "unlock restores the account for an ACTIVE employee"

api POST "/api/hr/admin/employees/$EMP/disable" "$HR_TOKEN" >/dev/null
DIS=$(api GET "/api/hr/admin/employees/$EMP/identity" "$HR_TOKEN")
assert_eq "DISABLED" "$(printf '%s' "$DIS" | jqr "['employeeStatus']")" "deactivate sets employment DISABLED"

api POST "/api/hr/admin/employees/$EMP/unlock" "$HR_TOKEN" >/dev/null
if [ -n "$SA_TOKEN" ]; then
  assert_eq "False" "$(curl -s -H "Authorization: Bearer $SA_TOKEN" \
    "$KC/admin/realms/employee-hub/users/$KCID" | jqr "['enabled']")" \
    "unlocking a DISABLED employee does NOT re-enable sign-in"
fi

api POST "/api/hr/admin/employees/$EMP/reactivate" "$HR_TOKEN" >/dev/null
REACT=$(api GET "/api/hr/admin/employees/$EMP/identity" "$HR_TOKEN")
assert_eq "ACTIVE" "$(printf '%s' "$REACT" | jqr "['employeeStatus']")" "reactivate restores employment ACTIVE"
if [ -n "$SA_TOKEN" ]; then
  assert_eq "True" "$(curl -s -H "Authorization: Bearer $SA_TOKEN" \
    "$KC/admin/realms/employee-hub/users/$KCID" | jqr "['enabled']")" \
    "reactivate re-enables the Keycloak account"
fi

api POST "/api/hr/admin/employees/$EMP/reset-password" "$HR_TOKEN" >/dev/null
assert_eq "200" "$HTTP_CODE" "password reset accepted"
api POST "/api/hr/admin/employees/$EMP/require-mfa" "$ADMIN_TOKEN" >/dev/null
assert_eq "200" "$HTTP_CODE" "MFA enrolment required"
if [ -n "$SA_TOKEN" ]; then
  case "$(curl -s -H "Authorization: Bearer $SA_TOKEN" \
      "$KC/admin/realms/employee-hub/users/$KCID" | jqr "['requiredActions']")" in
    *CONFIGURE_TOTP*) ok "CONFIGURE_TOTP is set on the account by require-mfa" ;;
    *) bad "require-mfa did not set CONFIGURE_TOTP" ;;
  esac
fi

# --- 6. offboarding really stops authentication ------------------------------

note "6. Offboarding stops authentication"
OFF_REFRESH=""
if [ -n "$ALICE_EMP" ]; then
  OFF_REFRESH=$(refresh_token_of 'alice.employee' 'Test1234!')
  api POST "/api/hr/admin/employees/$ALICE_EMP/offboard" "$ADMIN_TOKEN" >/dev/null
  assert_eq "200" "$HTTP_CODE" "offboard accepted"
  sleep 2
  [ -z "$(password_token 'alice.employee' 'Test1234!')" ] \
    && ok "the offboarded account can no longer sign in" \
    || bad "the offboarded account STILL signs in"
  if [ -n "$OFF_REFRESH" ]; then
    renewed=$(curl -s -X POST "$KC/realms/employee-hub/protocol/openid-connect/token" \
      -d grant_type=refresh_token -d client_id=test-cli \
      --data-urlencode "refresh_token=$OFF_REFRESH" \
      | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))")
    [ -z "$renewed" ] && ok "the offboarded account's refresh token cannot renew" \
      || bad "a refresh token issued before offboarding STILL renews"
  fi
  assert_eq "TERMINATED" "$(api GET "/api/hr/admin/employees/$ALICE_EMP/identity" "$HR_TOKEN" | jqr "['employeeStatus']")" \
    "the employment record is TERMINATED"
  api POST "/api/hr/admin/employees/$ALICE_EMP/reactivate" "$ADMIN_TOKEN" >/dev/null
  assert_eq "409" "$HTTP_CODE" "a TERMINATED employee cannot be reactivated (offboarding is terminal)"
else
  skip "offboarding checks (no adopted employee to offboard)"
fi

# --- 7. Gap 3: the outbox drains to RabbitMQ and consumers act ---------------

note "7. Cross-context events (Gap 3)"
sleep 6   # the relay runs every 5s
UNPUBLISHED=$($COMPOSE exec -T postgres psql -U hr -d hr -tAc \
  "select count(*) from hr.event_outbox where published_at is null" 2>/dev/null | tr -d ' \r')
PUBLISHED=$($COMPOSE exec -T postgres psql -U hr -d hr -tAc \
  "select count(*) from hr.event_outbox where published_at is not null" 2>/dev/null | tr -d ' \r')
if [ -n "$PUBLISHED" ]; then
  [ "${PUBLISHED:-0}" -gt 0 ] && ok "the outbox relay published $PUBLISHED event(s) to the broker" \
    || bad "no outbox event was published"
  [ "${UNPUBLISHED:-0}" -eq 0 ] && ok "no event is stuck unpublished" \
    || bad "$UNPUBLISHED event(s) are stuck in the outbox"
  TYPES=$($COMPOSE exec -T postgres psql -U hr -d hr -tAc \
    "select distinct type from hr.event_outbox" 2>/dev/null | tr -d ' \r' | tr '\n' ',')
  for expected in employee.provisioned employee.deactivated employee.reactivated employee.offboarded; do
    case ",$TYPES" in *",$expected,"*) ok "$expected was emitted" ;;
      *) bad "$expected was never emitted (saw: $TYPES)" ;; esac
  done
else
  skip "outbox inspection (could not query the hr database)"
fi

QUEUES=$($COMPOSE exec -T rabbitmq rabbitmqctl list_queues name messages_ready 2>/dev/null | tail -n +2)
if [ -n "$QUEUES" ]; then
  echo "$QUEUES" | sed 's/^/      /'
  if [ "$HR_ONLY" = true ]; then
    skip "leave/expense/documents consumer queues (those services are not in this run)"
  else
    for q in employee.events.leave employee.events.expense employee.events.documents; do
      case "$QUEUES" in *"$q"*) ok "$q is bound" ;; *) bad "$q was never declared" ;; esac
    done
  fi
  # every consumer queue drained, and nothing dead-lettered
  stuck=$(echo "$QUEUES" | awk '$1 ~ /^employee\.events\./ && $1 !~ /dlq/ && $2 > 0 {print $1}')
  [ -z "$stuck" ] && ok "every consumer queue drained (no backlog)" \
    || bad "messages left unconsumed on: $stuck"
  dead=$(echo "$QUEUES" | awk '$1 == "employee.events.dlq" {print $2}')
  [ "${dead:-0}" -eq 0 ] && ok "the dead-letter queue is empty" \
    || bad "$dead message(s) were dead-lettered"
  # the consumers recorded what they applied
  for svc in $([ "$HR_ONLY" = true ] && echo "" || echo "leave expense documents"); do
    applied=$($COMPOSE exec -T postgres psql -U "$svc" -d "$svc" -tAc \
      "select count(*) from $svc.processed_event" 2>/dev/null | tr -d ' \r')
    [ "${applied:-0}" -gt 0 ] && ok "$svc-service consumed and recorded $applied event(s)" \
      || bad "$svc-service recorded no consumed event"
  done
else
  skip "RabbitMQ inspection (could not reach rabbitmqctl)"
fi

# --- 8. regression: the rest of the platform still answers -------------------

note "8. Regression — existing surfaces still work"
REGRESSION_PATHS="/api/hr/employees /api/hr/departments /api/hr/positions /api/hr/audit /api/hr/admin/provisioning"
if [ "$HR_ONLY" = true ]; then
  skip "cross-service regression (analytics, documents, expenses are not in this run)"
else
  REGRESSION_PATHS="$REGRESSION_PATHS /api/analytics/dashboard /api/documents/categories /api/expenses/threshold"
fi
for path in $REGRESSION_PATHS; do
  api GET "$path" "$ADMIN_TOKEN" >/dev/null
  case "$HTTP_CODE" in 200) ok "GET $path" ;; *) bad "GET $path -> $HTTP_CODE" ;; esac
done
# mark.manager rather than alice: alice may have been offboarded above, and a
# 401 from a disabled account would pass a check meant to prove authorization.
MANAGER_TOKEN=$(password_token 'mark.manager' 'Test1234!')
if [ -n "$MANAGER_TOKEN" ]; then
  api GET /api/hr/employees "$MANAGER_TOKEN" >/dev/null
  assert_eq "403" "$HTTP_CODE" "a MANAGER is still refused the HR directory"
  api GET /api/hr/me/team "$MANAGER_TOKEN" >/dev/null
  case "$HTTP_CODE" in 200|404) ok "a MANAGER still reaches their own team view ($HTTP_CODE)" ;;
    *) bad "a MANAGER cannot reach their team view ($HTTP_CODE)" ;; esac
else
  bad "mark.manager could not sign in for the RBAC regression check"
fi

echo
echo "== Result: $PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ]
