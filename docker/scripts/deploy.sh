#!/usr/bin/env bash
# Deploys one environment of the stack on the current Docker host.
#
#   deploy.sh --env staging|production [--tag <image-tag>] [--color blue|green]
#             [--skip-smoke]
#
# Steps: validate env contract → validate merged compose config → pull (or
# build, when IMAGE_REGISTRY=local) → up --wait (healthcheck-gated) → smoke
# test → append to the release ledger (.deploy/releases-<env>.log), which
# rollback.sh reads to find the previous good tag.
#
# Blue/green (--color): runs the stack under a per-color compose project name
# with the color's gateway port (blue 8080, green 8082), so the inactive color
# can be deployed and smoke-tested while the active one keeps serving; the
# reverse proxy (Phase 9) — or the operator — switches ports afterwards.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_NAME=""
TAG=""
COLOR=""
SKIP_SMOKE=false

while [ $# -gt 0 ]; do
  case "$1" in
    --env)        ENV_NAME="${2:?--env needs a value}"; shift 2 ;;
    --tag)        TAG="${2:?--tag needs a value}"; shift 2 ;;
    --color)      COLOR="${2:?--color needs a value}"; shift 2 ;;
    --skip-smoke) SKIP_SMOKE=true; shift ;;
    *) echo "ERROR: unknown argument $1"; exit 2 ;;
  esac
done

case "$ENV_NAME" in
  staging|production) ;;
  *) echo "ERROR: --env must be staging or production"; exit 2 ;;
esac
case "$COLOR" in
  ""|blue|green) ;;
  *) echo "ERROR: --color must be blue or green"; exit 2 ;;
esac

ENV_FILE="$ROOT/.env.$ENV_NAME"
LEDGER_DIR="$ROOT/.deploy"
LEDGER="$LEDGER_DIR/releases-$ENV_NAME.log"
mkdir -p "$LEDGER_DIR"

echo "== 1/6 Environment contract ($ENV_FILE)"
bash "$ROOT/docker/scripts/validate-env.sh" "$ENV_FILE"

get() { sed -n "s/^[[:space:]]*$1=//p" "$ENV_FILE" | tail -1; }

# --tag overrides the env file's IMAGE_TAG; --color picks project name + port
[ -n "$TAG" ] && export IMAGE_TAG="$TAG"
PROJECT="employee-access-hub-$ENV_NAME"
if [ -n "$COLOR" ]; then
  PROJECT="$PROJECT-$COLOR"
  if [ "$COLOR" = "green" ]; then export GATEWAY_PORT="${GREEN_GATEWAY_PORT:-8082}"; fi
fi

COMPOSE=(docker compose
  -p "$PROJECT"
  -f "$ROOT/docker/docker-compose.yml"
  -f "$ROOT/docker/docker-compose.$ENV_NAME.yml"
  --env-file "$ENV_FILE")

echo "== 2/6 Compose config validation (project $PROJECT)"
"${COMPOSE[@]}" config -q

REGISTRY="$(get IMAGE_REGISTRY)"
EFFECTIVE_TAG="${IMAGE_TAG:-$(get IMAGE_TAG)}"
if [ "$ENV_NAME" = "production" ] || { [ -n "$REGISTRY" ] && [ "$REGISTRY" != "local" ]; }; then
  echo "== 3/6 Pulling images ($REGISTRY, tag $EFFECTIVE_TAG)"
  "${COMPOSE[@]}" pull --quiet
  UP_ARGS=(up -d --no-build --remove-orphans --wait --wait-timeout 300)
else
  echo "== 3/6 Building images locally (IMAGE_REGISTRY=local)"
  UP_ARGS=(up -d --build --remove-orphans --wait --wait-timeout 300)
fi

echo "== 4/6 Starting stack (waits on healthchecks)"
STATUS=deployed
if ! "${COMPOSE[@]}" "${UP_ARGS[@]}"; then
  STATUS=failed-unhealthy
  echo "$(date -u +%FT%TZ) env=$ENV_NAME tag=$EFFECTIVE_TAG color=${COLOR:-none} status=$STATUS" >> "$LEDGER"
  echo "ERROR: stack did not reach healthy state — run rollback.sh --env $ENV_NAME"
  exit 1
fi

if [ "$SKIP_SMOKE" = true ]; then
  echo "== 5/6 Smoke test skipped (--skip-smoke)"
else
  GW_PORT="${GATEWAY_PORT:-$(get GATEWAY_PORT)}"; GW_PORT="${GW_PORT:-8080}"
  KC_PORT="$(get KEYCLOAK_PORT)"; KC_PORT="${KC_PORT:-8081}"
  echo "== 5/6 Smoke test (gateway :$GW_PORT, keycloak :$KC_PORT)"
  if ! GATEWAY_URL="http://localhost:$GW_PORT" KC_URL="http://localhost:$KC_PORT" \
       bash "$ROOT/docker/scripts/smoke-test.sh"; then
    STATUS=failed-smoke
    echo "$(date -u +%FT%TZ) env=$ENV_NAME tag=$EFFECTIVE_TAG color=${COLOR:-none} status=$STATUS" >> "$LEDGER"
    echo "ERROR: smoke test failed — run rollback.sh --env $ENV_NAME"
    exit 1
  fi
fi

echo "== 6/6 Recording release"
echo "$(date -u +%FT%TZ) env=$ENV_NAME tag=$EFFECTIVE_TAG color=${COLOR:-none} status=$STATUS" >> "$LEDGER"
echo "OK: $ENV_NAME is running tag $EFFECTIVE_TAG (project $PROJECT)"
