#!/usr/bin/env bash
# Restore Employee Access Hub databases from a backup set produced by
# backup-db.sh. DESTRUCTIVE: drops and recreates each restored database.
#
#   restore-db.sh --backup /srv/backups/20260723T030000Z --yes
#   restore-db.sh --backup <dir> --only hr,leave --yes
#
# Order: verify checksums -> restore globals (roles) -> per database drop/create
# /restore. Run with the stack up but the SERVICES stopped (only postgres), so
# nothing writes mid-restore:  docker compose stop hr-service leave-service ...
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/docker/docker-compose.yml}"

BACKUP=""
CONFIRM=false
ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --backup) BACKUP="${2:?}"; shift 2 ;;
    --only)   ONLY="${2:?}"; shift 2 ;;
    --yes)    CONFIRM=true; shift ;;
    *) echo "ERROR: unknown argument $1" >&2; exit 2 ;;
  esac
done

[ -n "$BACKUP" ] || { echo "ERROR: --backup <dir> is required" >&2; exit 2; }
[ -d "$BACKUP" ] || { echo "ERROR: backup dir not found: $BACKUP" >&2; exit 1; }
if [ "$CONFIRM" != true ]; then
  echo "ERROR: refusing to run without --yes (this DROPS and recreates databases)" >&2
  exit 2
fi

PGUSER="$(sed -n 's/^[[:space:]]*POSTGRES_USER=//p' "$ENV_FILE" | tail -1)"
PGUSER="${PGUSER:-keycloak}"
COMPOSE=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

if [ -n "$ONLY" ]; then
  IFS=',' read -r -a DATABASES <<< "$ONLY"
else
  DATABASES=(keycloak hr leave expense documents)
fi

echo "== Verifying checksums"
( cd "$BACKUP" && sha256sum -c SHA256SUMS )

echo "== Restoring roles/grants (globals)"
gunzip -c "$BACKUP/globals.sql.gz" | "${COMPOSE[@]}" exec -T postgres psql -U "$PGUSER" -d postgres -v ON_ERROR_STOP=0

for db in "${DATABASES[@]}"; do
  dump="$BACKUP/$db.dump"
  [ -f "$dump" ] || { echo "-- skip $db (no dump in set)"; continue; }
  echo "== Restoring $db"
  # terminate live connections, then drop/recreate owned by the db role
  "${COMPOSE[@]}" exec -T postgres psql -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$db' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS "$db";
CREATE DATABASE "$db" OWNER "$db";
SQL
  "${COMPOSE[@]}" exec -T postgres pg_restore -U "$PGUSER" -d "$db" --no-owner --role="$db" < "$dump"
done

echo "== Restore complete. Start the services and run the smoke test:"
echo "   ${COMPOSE[*]} up -d && bash docker/scripts/smoke-test.sh"
