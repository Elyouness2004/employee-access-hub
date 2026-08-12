#!/usr/bin/env bash
# Full authentication e2e WITHOUT Docker: real Keycloak (local dist, dev mode,
# file DB) + hr-service + gateway as jars, then the smoke-test RBAC matrix.
# Use when Docker is unavailable; `make up && make smoke` is the compose path.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOCAL="$ROOT/.local"
LOGS="$LOCAL/logs"
KC_VERSION="26.3.2"
KC_DIR="$LOCAL/keycloak-$KC_VERSION"
KC_PORT=8081
MVN="${MVN:-$ROOT/mvnw}"
[ -x "$MVN" ] || MVN="mvn"

mkdir -p "$LOCAL" "$LOGS"

PIDS=()
cleanup() {
  echo "== Stopping processes"
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup EXIT

wait_http() { # $1=url $2=name $3=timeout_s
  local url="$1" name="$2" timeout="${3:-120}" i=0
  until curl -sf -o /dev/null "$url"; do
    i=$((i+1))
    if [ "$i" -ge "$timeout" ]; then echo "ERROR: $name not ready after ${timeout}s ($url)"; return 1; fi
    sleep 1
  done
  echo "== $name ready"
}

echo "== 1/5 Keycloak dist"
if [ ! -d "$KC_DIR" ]; then
  curl -sSL -o "$LOCAL/kc.tar.gz" \
    "https://github.com/keycloak/keycloak/releases/download/$KC_VERSION/keycloak-$KC_VERSION.tar.gz"
  tar xzf "$LOCAL/kc.tar.gz" -C "$LOCAL"
  rm "$LOCAL/kc.tar.gz"
fi
mkdir -p "$KC_DIR/data/import"
cp "$ROOT/keycloak-config/realm-employee-hub.json" "$KC_DIR/data/import/"

echo "== 2/5 Starting Keycloak on :$KC_PORT (dev mode, file DB)"
KC_BOOTSTRAP_ADMIN_USERNAME=admin KC_BOOTSTRAP_ADMIN_PASSWORD=admin-local-only \
  "$KC_DIR/bin/kc.sh" start-dev --http-port=$KC_PORT --import-realm \
  > "$LOGS/keycloak.log" 2>&1 &
PIDS+=($!)
wait_http "http://localhost:$KC_PORT/realms/employee-hub/.well-known/openid-configuration" "Keycloak" 180

echo "== 3/5 Building jars"
(cd "$ROOT" && "$MVN" -q -DskipTests package)

echo "== 4/5 Starting hr-service (:9001), leave-service (:9002) and gateway (:8080)"
KEYCLOAK_ISSUER_URI="http://localhost:$KC_PORT/realms/employee-hub" \
  java -jar "$ROOT"/services/hr-service/target/hr-service-*.jar > "$LOGS/hr-service.log" 2>&1 &
PIDS+=($!)
wait_http "http://localhost:9001/actuator/health" "hr-service" 90

# leave-service uses its own H2 here (no PostgreSQL); it relays tokens to hr-service
KEYCLOAK_ISSUER_URI="http://localhost:$KC_PORT/realms/employee-hub" \
HR_SERVICE_URI="http://localhost:9001" \
  java -jar "$ROOT"/services/leave-service/target/leave-service-*.jar > "$LOGS/leave-service.log" 2>&1 &
PIDS+=($!)
wait_http "http://localhost:9002/actuator/health" "leave-service" 90

KEYCLOAK_ISSUER_URI="http://localhost:$KC_PORT/realms/employee-hub" \
HR_SERVICE_URI="http://localhost:9001" \
LEAVE_SERVICE_URI="http://localhost:9002" \
  java -jar "$ROOT"/gateway/target/gateway-*.jar > "$LOGS/gateway.log" 2>&1 &
PIDS+=($!)
wait_http "http://localhost:8080/actuator/health" "gateway" 90

echo "== 5/5 Running smoke test (RBAC matrix)"
GATEWAY_URL="http://localhost:8080" KC_URL="http://localhost:$KC_PORT" \
  bash "$ROOT/docker/scripts/smoke-test.sh"
