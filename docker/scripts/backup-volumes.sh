#!/usr/bin/env bash
# Physical backup of the stateful named volumes (belt-and-braces alongside the
# logical pg_dump, and the only backup for RabbitMQ state). Tars each volume via
# a throwaway alpine container into a timestamped directory with a checksum
# manifest.
#
#   BACKUP_DIR=/srv/backups backup-volumes.sh
#
# Restore a volume:
#   docker run --rm -v <project>_<vol>:/data -v "$DIR":/backup alpine \
#     sh -c 'rm -rf /data/* && tar xzf /backup/<vol>.tar.gz -C /data'
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups/volumes}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
# compose project name (base file sets: name: employee-access-hub)
PROJECT="${COMPOSE_PROJECT:-employee-access-hub}"

# stateful volumes worth a physical copy; observability data is reproducible.
# documentsdata holds uploaded document bytes — the database keeps only the
# metadata and the pointer, so it is NOT recoverable from a pg_dump.
VOLUMES=(pgdata rabbitmqdata documentsdata)

TS="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_DIR/$TS"
mkdir -p "$DEST"

echo "== Backing up volumes of project '$PROJECT' to $DEST"
for vol in "${VOLUMES[@]}"; do
  full="${PROJECT}_${vol}"
  if ! docker volume inspect "$full" >/dev/null 2>&1; then
    echo "-- skip $full (not found)"; continue
  fi
  echo "-- tar $full"
  docker run --rm \
    -v "${full}:/data:ro" \
    -v "${DEST}:/backup" \
    alpine tar czf "/backup/${vol}.tar.gz" -C /data .
done

echo "== Writing checksum manifest"
( cd "$DEST" && sha256sum ./*.tar.gz > SHA256SUMS 2>/dev/null || true )

echo "== Pruning volume backups older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +"$RETENTION_DAYS" -exec rm -rf {} +

echo "== Done: $DEST"
ls -lh "$DEST"
