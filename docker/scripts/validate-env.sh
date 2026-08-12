#!/usr/bin/env bash
# Pre-flight validation of the .env contract before any compose command.
# Catches what compose interpolation cannot: values still on the .env.example
# placeholder, gated features enabled without their required secrets, and
# malformed URIs. Usage: validate-env.sh [path/to/.env] (default: repo .env).
set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${1:-$ROOT/.env}"
PLACEHOLDER="change-me"

PASS=0
FAIL=0

ok()   { echo "PASS  $1"; PASS=$((PASS+1)); }
bad()  { echo "FAIL  $1"; FAIL=$((FAIL+1)); }

if [ ! -f "$ENV_FILE" ]; then
  bad ".env not found at $ENV_FILE (cp .env.example .env and fill real values)"
  echo; echo "== Result: $PASS passed, $FAIL failed"
  exit 1
fi
ok ".env present ($ENV_FILE)"

get() { # $1=var -> prints value or empty (last assignment wins, quotes stripped)
  sed -n "s/^[[:space:]]*$1=//p" "$ENV_FILE" | tail -1 | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

require_secret() { # $1=var
  local v; v="$(get "$1")"
  if [ -z "$v" ]; then bad "$1 is not set"
  elif [ "$v" = "$PLACEHOLDER" ]; then bad "$1 still on the .env.example placeholder"
  else ok "$1 set"
  fi
}

require_uri() { # $1=var
  local v; v="$(get "$1")"
  case "$v" in
    http://*|https://*) ok "$1 is a URI ($v)" ;;
    "") bad "$1 is not set" ;;
    *) bad "$1 is not an http(s) URI ($v)" ;;
  esac
}

echo "== Required secrets"
require_secret POSTGRES_PASSWORD
require_secret HR_DB_PASSWORD
require_secret LEAVE_DB_PASSWORD
require_secret EXPENSE_DB_PASSWORD
require_secret DOCUMENTS_DB_PASSWORD
require_secret KC_BOOTSTRAP_ADMIN_PASSWORD
require_secret RABBITMQ_PASSWORD

echo "== Issuer / JWKS contract"
require_uri KEYCLOAK_ISSUER_URI
require_uri KEYCLOAK_JWKS_URI

echo "== Identity provisioning service account (hr-provisioner)"
# Always required, even with the adapter gated off: the keycloak container
# substitutes this value into the realm import, so a placeholder here means a
# predictable secret on a real service account that can manage every user.
require_secret KEYCLOAK_ADMIN_CLIENT_SECRET
if [ "$(get HUB_IDENTITY_KEYCLOAK_ENABLED)" = "true" ]; then
  token_realm="$(get KEYCLOAK_TOKEN_REALM)"
  # hr-provisioner is declared in the employee-hub realm by the realm export, so
  # asking `master` for its token can only ever fail with invalid_client.
  if [ "$token_realm" = "employee-hub" ]; then
    ok "KEYCLOAK_TOKEN_REALM=employee-hub (realm that declares hr-provisioner)"
  elif [ -z "$token_realm" ]; then
    ok "KEYCLOAK_TOKEN_REALM unset — compose supplies employee-hub"
  else
    bad "KEYCLOAK_TOKEN_REALM=$token_realm but hr-provisioner is declared in employee-hub"
  fi
  if [ "$(get KEYCLOAK_ADMIN_CLIENT_ID)" = "hr-provisioner" ]; then
    ok "KEYCLOAK_ADMIN_CLIENT_ID=hr-provisioner"
  else
    bad "KEYCLOAK_ADMIN_CLIENT_ID must be hr-provisioner (the client the realm export declares)"
  fi
else
  ok "identity provisioning gated off (logging adapter)"
fi

echo "== Account activation (Keycloak e-mail)"
# Only reachable through the real Keycloak adapter: with it off, nothing ever
# calls execute-actions-email, so SMTP is not part of the contract yet.
if [ "$(get HUB_IDENTITY_KEYCLOAK_ENABLED)" != "true" ]; then
  ok "activation not reachable (identity adapter off)"
elif [ "$(get HUB_IDENTITY_ACTIVATION_ENABLED)" = "false" ]; then
  bad "identity provisioning is on but activation is off — provisioned accounts would have no password-setup path"
else
  smtp_host="$(get KC_SMTP_HOST)"
  if [ -z "$smtp_host" ]; then
    ok "KC_SMTP_HOST unset — compose supplies the dev sink (start it with --profile mail)"
  else
    ok "KC_SMTP_HOST set ($smtp_host)"
  fi
  case "$(get HUB_IDENTITY_ACTIVATION_REDIRECT_URI)" in
    http://*|https://*) ok "HUB_IDENTITY_ACTIVATION_REDIRECT_URI is a URI" ;;
    "") ok "HUB_IDENTITY_ACTIVATION_REDIRECT_URI unset (Keycloak omits the post-action redirect)" ;;
    *) bad "HUB_IDENTITY_ACTIVATION_REDIRECT_URI is not an http(s) URI — Keycloak rejects the action mail" ;;
  esac
fi

echo "== Gated features"
if [ "$(get HUB_EVENTS_RABBIT_ENABLED)" = "true" ] && [ "$(get HUB_EVENTS_RELAY_ENABLED)" != "true" ]; then
  bad "HUB_EVENTS_RABBIT_ENABLED=true but HUB_EVENTS_RELAY_ENABLED is off — events would never leave the outbox"
else
  ok "event fabric gating consistent"
fi

echo
echo "== Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
