#!/usr/bin/env bash
# Generates self-signed TLS certs for the two edge hostnames, for local/staging
# testing of the nginx edge. PRODUCTION uses real certificates (Let's Encrypt /
# certbot, or your CA) — never these. Certs land in docker/nginx/certs/ (git-ignored).
#
#   NGINX_API_HOST=hub.local NGINX_AUTH_HOST=auth.local bash generate-dev-certs.sh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)/certs"
mkdir -p "$DIR"
API_HOST="${NGINX_API_HOST:-hub.local}"
AUTH_HOST="${NGINX_AUTH_HOST:-auth.local}"

gen() { # $1=hostname
  local host="$1"
  echo "== self-signed cert for $host"
  openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
    -keyout "$DIR/$host.key" -out "$DIR/$host.crt" \
    -subj "/CN=$host" -addext "subjectAltName=DNS:$host"
  chmod 600 "$DIR/$host.key"
}

gen "$API_HOST"
gen "$AUTH_HOST"
echo "== Done. Certs in $DIR (self-signed — browsers will warn; do NOT use in production)"
