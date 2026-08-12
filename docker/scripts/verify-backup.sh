#!/usr/bin/env bash
# Recovery-verification: proves a backup set is intact AND restorable, without
# touching the live databases. Checks the SHA-256 manifest, then restores one
# database into a throwaway scratch database and counts its tables.
#
#   verify-backup.sh --backup /srv/backups/20260723T030000Z [--db hr]
#
# A backup you have never test-restored is a hope, not a backup — run this on a
# schedule (see docs/operations/backup-recovery.md).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/docker/docker-compose.yml}"

BACKUP=""
DB="hr"
while [ $# -gt 0 ]; do
  case "$1" in
    --backup) BACKUP="${2:?}"; shift 2 ;;
    --db)     DB="${2:?}"; shift 2 ;;
    *) echo "ERROR: unknown argument $1" >&2; exit 2 ;;
  esac
done
[ -d "$BACKUP" ] || { echo "ERROR: backup dir not found: $BACKUP" >&2; exit 1; }

PGUSER="$(sed -n 's/^[[:space:]]*POSTGRES_USER=//p' "$ENV_FILE" | tail -1)"
PGUSER="${PGUSER:-keycloak}"
COMPOSE=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")
SCRATCH="verify_${DB}_$(date -u +%s)"

echo "== 1/3 Checksum integrity"
( cd "$BACKUP" && sha256sum -c SHA256SUMS )

echo "== 2/3 Test-restore '$DB' into scratch database '$SCRATCH'"
"${COMPOSE[@]}" exec -T postgres psql -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE \"$SCRATCH\";"
# --no-owner: the scratch db has no per-service roles; we only prove restorability
"${COMPOSE[@]}" exec -T postgres pg_restore -U "$PGUSER" -d "$SCRATCH" --no-owner < "$BACKUP/$DB.dump"

echo "== 3/3 Sanity: table count in the restored schema"
COUNT="$("${COMPOSE[@]}" exec -T postgres psql -U "$PGUSER" -d "$SCRATCH" -tA \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema');")"
echo "   restored tables: $COUNT"

echo "== Cleanup scratch database"
"${COMPOSE[@]}" exec -T postgres psql -U "$PGUSER" -d postgres -c "DROP DATABASE \"$SCRATCH\";"

if [ "${COUNT:-0}" -gt 0 ]; then
  echo "== PASS: backup of '$DB' is intact and restorable ($COUNT tables)"
else
  echo "== FAIL: restore produced no tables" >&2
  exit 1
fi
