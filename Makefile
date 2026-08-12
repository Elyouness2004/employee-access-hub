# Employee Access Hub — developer shims.
# Preserves the "single command" portability NFR with compose files under docker/.

# `--profile mail` starts the Mailpit dev SMTP sink. The dev stack's Keycloak is
# configured to send account e-mails to mailpit:1025 (KC_SMTP_HOST default), so
# leaving the sink out of `up` left Keycloak mailing a host that did not exist —
# every password-setup / reset e-mail failed at delivery. Dev compose file only:
# staging and production use their own files and a real relay.
COMPOSE = docker compose -f docker/docker-compose.yml --env-file .env --profile mail
MVN = ./mvnw

.PHONY: build test preflight up down logs smoke iam-verify e2e-local seed seed-reset reconcile-realm

build:
	$(MVN) -q -DskipTests package

test:
	$(MVN) test

# .env contract validation — refuses placeholder/missing/inconsistent values
preflight:
	bash docker/scripts/validate-env.sh

up: preflight
	$(COMPOSE) up -d --build
	@$(MAKE) --no-print-directory reconcile-realm

# Converge the RUNNING realm with the committed export + .env. `--import-realm`
# only ever imports a realm that does not exist, so a stack first started before
# the smtpServer block and the hr-provisioner client were added keeps running
# without them: account e-mails go nowhere and identity actions answer 503.
# Idempotent — a no-op once the realm matches.
reconcile-realm:
	bash docker/scripts/reconcile-realm.sh

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=100

smoke:
	bash docker/scripts/smoke-test.sh

# End-to-end IAM verification against a running stack with the real Keycloak
# adapter and the event fabric on. Read-write: creates and offboards records.
iam-verify:
	bash docker/scripts/iam-verify.sh

# Synthetic Moroccan company dataset (~300 users) for the running dev stack.
# DEV ONLY — see docker/seed/README.md. `seed-reset` wipes and regenerates.
seed:
	bash docker/scripts/seed-demo-data.sh

seed-reset:
	bash docker/scripts/seed-demo-data.sh --reset

# Full auth verification without Docker: local Keycloak + gateway + hr-service
e2e-local:
	bash docker/scripts/e2e-local.sh
