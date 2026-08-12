#!/usr/bin/env bash
# Loads the Atlas Numeris synthetic dataset into the running dev stack:
# ~300 Keycloak accounts plus the matching HR, leave, expense and document rows.
#
#   bash docker/scripts/seed-demo-data.sh --reset      # wipe and reseed
#   bash docker/scripts/seed-demo-data.sh --dry-run --sql-out /tmp/seed
#
# DEVELOPMENT ONLY. Every generated account gets the same well-known password
# and the data is written straight into the service databases. The tool refuses
# a non-local Keycloak host unless --force is passed. The four realm fixtures
# (alice.employee / mark.manager / hana.hr / adam.admin) are never touched, so
# `make smoke` keeps working unchanged.
#
# All flags are passed through to docker/seed/seed.py (see --help).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT/docker/docker-compose.yml"
ENV_FILE="$ROOT/.env"

command -v python3 >/dev/null 2>&1 || {
  echo "python3 is required" >&2; exit 1;
}
[ -f "$ENV_FILE" ] || {
  echo "missing $ENV_FILE — copy .env.example and fill it in" >&2; exit 1;
}

# --dry-run needs neither the stack nor Docker
case " $* " in
  *" --dry-run "*) exec python3 "$ROOT/docker/seed/seed.py" "$@" ;;
esac

if ! docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps --status running \
     --services 2>/dev/null | grep -q '^postgres$'; then
  echo "the stack is not running — start it first with: make up" >&2
  exit 1
fi

exec python3 "$ROOT/docker/seed/seed.py" "$@"
