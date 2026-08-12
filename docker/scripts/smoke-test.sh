#!/usr/bin/env bash
# Executable RBAC matrix for the authentication milestone.
# Works against any running stack (compose or local):
#   GATEWAY_URL (default http://localhost:8080)
#   KC_URL      (default http://localhost:8081)
# Users/passwords come from keycloak-config/realm-employee-hub.json (dev seed).
set -u

GATEWAY_URL="${GATEWAY_URL:-http://localhost:8080}"
KC_URL="${KC_URL:-http://localhost:8081}"
TOKEN_ENDPOINT="$KC_URL/realms/employee-hub/protocol/openid-connect/token"
PASSWORD="Test1234!"

PASS=0
FAIL=0

token_for() { # $1=username -> prints access_token or empty
  curl -s -X POST "$TOKEN_ENDPOINT" \
    -d "grant_type=password" -d "client_id=test-cli" \
    -d "username=$1" -d "password=$PASSWORD" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin).get("access_token",""))'
}

check() { # $1=description $2=expected_status $3=path $4=token(optional)
  local desc="$1" expected="$2" path="$3" token="${4:-}"
  local auth=()
  [ -n "$token" ] && auth=(-H "Authorization: Bearer $token")
  local status
  status=$(curl -s -o /dev/null -w '%{http_code}' "${auth[@]}" "$GATEWAY_URL$path")
  if [ "$status" = "$expected" ]; then
    echo "PASS  [$expected] $desc"
    PASS=$((PASS+1))
  else
    echo "FAIL  [want $expected, got $status] $desc"
    FAIL=$((FAIL+1))
  fi
}

claim_roles() { # $1=token -> prints sorted realm roles from the JWT payload
  python3 - "$1" <<'EOF'
import base64, json, sys
payload = sys.argv[1].split(".")[1]
payload += "=" * (-len(payload) % 4)
claims = json.loads(base64.urlsafe_b64decode(payload))
print(",".join(sorted(claims.get("realm_access", {}).get("roles", []))))
EOF
}

echo "== Fetching tokens from $TOKEN_ENDPOINT"
ALICE=$(token_for alice.employee)
MARK=$(token_for mark.manager)
HANA=$(token_for hana.hr)
ADAM=$(token_for adam.admin)

for pair in "alice.employee:$ALICE" "mark.manager:$MARK" "hana.hr:$HANA" "adam.admin:$ADAM"; do
  user="${pair%%:*}"; tok="${pair#*:}"
  if [ -z "$tok" ]; then echo "FAIL  could not obtain token for $user"; FAIL=$((FAIL+1)); fi
done

echo "== Authentication (401 without/with bad credentials)"
check "no token -> 401"           401 /api/hr/auth/me
check "garbage token -> 401"      401 /api/hr/auth/me "not.a.jwt"

echo "== RBAC matrix through the gateway"
check "alice /me"                 200 /api/hr/auth/me             "$ALICE"
check "alice employee-check"      200 /api/hr/auth/employee-check "$ALICE"
check "alice manager-check -> 403" 403 /api/hr/auth/manager-check "$ALICE"
check "alice hr-check -> 403"      403 /api/hr/auth/hr-check      "$ALICE"
check "alice admin-check -> 403"   403 /api/hr/auth/admin-check   "$ALICE"

check "mark manager-check"        200 /api/hr/auth/manager-check  "$MARK"
check "mark employee-check (composite MANAGER>EMPLOYEE)" 200 /api/hr/auth/employee-check "$MARK"
check "mark hr-check -> 403"       403 /api/hr/auth/hr-check      "$MARK"
check "mark admin-check -> 403"    403 /api/hr/auth/admin-check   "$MARK"

check "hana hr-check"             200 /api/hr/auth/hr-check       "$HANA"
check "hana employee-check (composite HR>EMPLOYEE)" 200 /api/hr/auth/employee-check "$HANA"
check "hana admin-check -> 403"    403 /api/hr/auth/admin-check   "$HANA"

check "adam admin-check"          200 /api/hr/auth/admin-check    "$ADAM"
check "adam employee-check (composite ADMIN>EMPLOYEE)" 200 /api/hr/auth/employee-check "$ADAM"
check "adam manager-check -> 403"  403 /api/hr/auth/manager-check "$ADAM"

echo "== Leave service routing + zero-trust RBAC through the gateway"
# These prove the gateway routes /api/leave/** and each service re-validates the
# JWT (layer 2). Balance/submit paths need the employee↔Keycloak link that
# identity onboarding (P3) creates, so they are exercised in the P4 demo, not here.
check "no token -> 401"                    401 /api/leave/requests/my
check "alice my-requests (empty ok)"       200 /api/leave/requests/my         "$ALICE"
check "alice manager inbox -> 403"         403 /api/leave/requests/inbox      "$ALICE"
check "mark manager inbox"                 200 /api/leave/requests/inbox      "$MARK"
check "alice HR escalation inbox -> 403"   403 /api/leave/requests/escalated  "$ALICE"
check "mark HR escalation inbox -> 403"    403 /api/leave/requests/escalated  "$MARK"
check "hana HR escalation inbox"           200 /api/leave/requests/escalated  "$HANA"

echo "== Token content sanity"
if [ -n "$MARK" ]; then
  roles=$(claim_roles "$MARK")
  case "$roles" in
    *EMPLOYEE*MANAGER*|*MANAGER*EMPLOYEE*) echo "PASS  mark token contains composite roles [$roles]"; PASS=$((PASS+1)) ;;
    *) echo "FAIL  mark token roles missing composite expansion [$roles]"; FAIL=$((FAIL+1)) ;;
  esac
fi

echo "== Correlation ID propagation"
if [ -n "$ALICE" ]; then
  cid=$(curl -s -D - -o /dev/null -H "Authorization: Bearer $ALICE" "$GATEWAY_URL/api/hr/auth/me" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-correlation-id"{print $2}')
  if [ -n "$cid" ]; then echo "PASS  response carries X-Correlation-Id ($cid)"; PASS=$((PASS+1));
  else echo "FAIL  no X-Correlation-Id on response"; FAIL=$((FAIL+1)); fi
fi

echo
echo "== Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
