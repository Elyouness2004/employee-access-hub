#!/usr/bin/env bash
# Logical backup of every Employee Access Hub database via pg_dump inside the
# running postgres container. Produces one compressed custom-format dump per
# database, a globals-only dump (roles/grants), and a SHA-256 manifest, into a
# timestamped directory. Prunes backup sets older than RETENTION_DAYS.
#
#   BACKUP_DIR=/srv/backups RETENTION_DAYS=14 backup-db.sh
#
# The Keycloak realm is already versioned as code (keycloak-config/), so it is
# not dumped here — restoring Keycloak = restore its DB + re-import the realm.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/docker/docker-compose.yml}"

DATABASES=(keycloak hr leave expense documents)

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: env file not found at $ENV_FILE" >&2
  exit 1
fi
PGUSER="$(sed -n 's/^[[:space:]]*POSTGRES_USER=//p' "$ENV_FILE" | tail -1)"
PGUSER="${PGUSER:-keycloak}"

COMPOSE=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

TS="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_DIR/$TS"
mkdir -p "$DEST"

echo "== Backing up databases to $DEST (postgres user: $PGUSER)"
for db in "${DATABASES[@]}"; do
  echo "-- pg_dump $db"
  # custom format (-Fc): compressed, and pg_restore can restore it selectively
  "${COMPOSE[@]}" exec -T postgres pg_dump -U "$PGUSER" -d "$db" -Fc > "$DEST/$db.dump"
done

echo "-- pg_dumpall --globals-only (roles/grants)"
"${COMPOSE[@]}" exec -T postgres pg_dumpall -U "$PGUSER" --globals-only | gzip > "$DEST/globals.sql.gz"

echo "== Writing checksum manifest"
( cd "$DEST" && sha256sum ./*.dump ./*.gz > SHA256SUMS )

echo "== Pruning backup sets older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +"$RETENTION_DAYS" -exec rm -rf {} +

echo "== Done. Backup set: $DEST"
ls -lh "$DEST"
