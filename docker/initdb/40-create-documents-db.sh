#!/usr/bin/env bash
# Creates the documents-service database and credentials (schema-per-service pattern:
# the documents schema itself is created by Flyway at service startup).
# postgres runs /docker-entrypoint-initdb.d only when the pgdata volume is
# initialized for the first time; on an existing volume apply manually:
#   docker compose -f docker/docker-compose.yml exec postgres \
#     bash /docker-entrypoint-initdb.d/40-create-documents-db.sh
set -euo pipefail

# \gexec makes both statements idempotent so manual re-runs are safe
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<-SQL
	SELECT format('CREATE ROLE documents LOGIN PASSWORD %L', '$DOCUMENTS_DB_PASSWORD')
	WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'documents') \gexec
	SELECT 'CREATE DATABASE documents OWNER documents'
	WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'documents') \gexec
SQL
