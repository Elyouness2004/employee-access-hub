#!/usr/bin/env bash
# Creates the expense-service database and credentials (schema-per-service pattern:
# the expense schema itself is created by Flyway at service startup).
# postgres runs /docker-entrypoint-initdb.d only when the pgdata volume is
# initialized for the first time; on an existing volume apply manually:
#   docker compose -f docker/docker-compose.yml exec postgres \
#     bash /docker-entrypoint-initdb.d/30-create-expense-db.sh
set -euo pipefail

# \gexec makes both statements idempotent so manual re-runs are safe
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<-SQL
	SELECT format('CREATE ROLE expense LOGIN PASSWORD %L', '$EXPENSE_DB_PASSWORD')
	WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'expense') \gexec
	SELECT 'CREATE DATABASE expense OWNER expense'
	WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'expense') \gexec
SQL
