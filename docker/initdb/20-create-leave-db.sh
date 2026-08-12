#!/usr/bin/env bash
# Creates the leave-service database and credentials (schema-per-service pattern:
# the leave schema itself is created by Flyway at service startup).
# postgres runs /docker-entrypoint-initdb.d only when the pgdata volume is
# initialized for the first time; on an existing volume apply manually:
#   docker compose -f docker/docker-compose.yml exec postgres \
#     bash /docker-entrypoint-initdb.d/20-create-leave-db.sh
set -euo pipefail

# \gexec makes both statements idempotent so manual re-runs are safe
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<-SQL
	SELECT format('CREATE ROLE leave LOGIN PASSWORD %L', '$LEAVE_DB_PASSWORD')
	WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'leave') \gexec
	SELECT 'CREATE DATABASE leave OWNER leave'
	WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'leave') \gexec
SQL
