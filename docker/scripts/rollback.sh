#!/usr/bin/env bash
# Rolls an environment back to the previous successfully deployed image tag,
# as recorded in the release ledger deploy.sh maintains.
#
#   rollback.sh --env staging|production [--list] [--tag <explicit-tag>]
#
# Without --tag, picks the most recent status=deployed entry whose tag differs
# from the currently deployed one and re-runs deploy.sh with it. --list only
# prints the ledger. Rollbacks are themselves recorded (they are deployments).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_NAME=""
LIST=false
TAG=""

while [ $# -gt 0 ]; do
  case "$1" in
    --env)  ENV_NAME="${2:?--env needs a value}"; shift 2 ;;
    --list) LIST=true; shift ;;
    --tag)  TAG="${2:?--tag needs a value}"; shift 2 ;;
    *) echo "ERROR: unknown argument $1"; exit 2 ;;
  esac
done

case "$ENV_NAME" in
  staging|production) ;;
  *) echo "ERROR: --env must be staging or production"; exit 2 ;;
esac

LEDGER="$ROOT/.deploy/releases-$ENV_NAME.log"
if [ ! -f "$LEDGER" ]; then
  echo "ERROR: no release ledger at $LEDGER — nothing was ever deployed with deploy.sh"
  exit 1
fi

if [ "$LIST" = true ]; then
  cat "$LEDGER"
  exit 0
fi

if [ -z "$TAG" ]; then
  # ledger line: <ts> env=<e> tag=<t> color=<c> status=<s> — field 3 is the tag
  CURRENT="$(awk '$5 == "status=deployed" {tag=$3} END {sub(/^tag=/, "", tag); print tag}' "$LEDGER")"
  TAG="$(awk '$5 == "status=deployed" {sub(/^tag=/, "", $3); print $3}' "$LEDGER" \
    | awk -v cur="$CURRENT" '$0 != cur' | tail -1)"
  if [ -z "$TAG" ]; then
    echo "ERROR: no previous good tag differing from current ($CURRENT) in $LEDGER"
    echo "       pass one explicitly: rollback.sh --env $ENV_NAME --tag <tag>"
    exit 1
  fi
  echo "== Rolling back $ENV_NAME: $CURRENT -> $TAG"
else
  echo "== Rolling back $ENV_NAME to explicit tag $TAG"
fi

exec bash "$ROOT/docker/scripts/deploy.sh" --env "$ENV_NAME" --tag "$TAG"
