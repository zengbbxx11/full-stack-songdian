#!/usr/bin/env bash
set -Eeuo pipefail

VERSION="${1:?Usage: scripts/deploy.sh <image-version>}"
REGISTRY="${IMAGE_REGISTRY:-ghcr.io/zengbbxx11/full-stack-songdian}"
STATE_DIR="${DEPLOY_STATE_DIR:-.deploy}"
ENV_FILE="${DEPLOY_ENV_FILE:-.env}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f docker-compose.yml)

if [[ ! "$VERSION" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]]; then
  echo "Invalid image version: use a commit SHA or release tag only." >&2
  exit 2
fi
if [[ ! "$REGISTRY" =~ ^ghcr\.io/[a-z0-9._/-]+$ ]]; then
  echo "Invalid IMAGE_REGISTRY; expected a lowercase ghcr.io path." >&2
  exit 2
fi

mkdir -p "$STATE_DIR"
PREVIOUS_VERSION=""
if [[ -f "$STATE_DIR/current-version" ]]; then
  PREVIOUS_VERSION="$(<"$STATE_DIR/current-version")"
fi

export BACKEND_IMAGE="$REGISTRY/backend:$VERSION"
export FRONTEND_IMAGE="$REGISTRY/frontend:$VERSION"
export ADMIN_IMAGE="$REGISTRY/admin:$VERSION"

rollback_apps() {
  local exit_code=$?
  trap - ERR
  if [[ "$SWITCH_STARTED" != "1" ]]; then
    exit "$exit_code"
  fi
  if [[ -z "$PREVIOUS_VERSION" ]]; then
    echo "No previous application image version is recorded; automatic rollback is unavailable." >&2
    exit "$exit_code"
  fi
  echo "Health check failed; rolling application images back to $PREVIOUS_VERSION" >&2
  export BACKEND_IMAGE="$REGISTRY/backend:$PREVIOUS_VERSION"
  export FRONTEND_IMAGE="$REGISTRY/frontend:$PREVIOUS_VERSION"
  export ADMIN_IMAGE="$REGISTRY/admin:$PREVIOUS_VERSION"
  "${COMPOSE[@]}" pull backend frontend admin-next
  "${COMPOSE[@]}" up -d --no-build backend frontend admin-next
  exit "$exit_code"
}

SWITCH_STARTED=0
trap rollback_apps ERR

BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups}" bash scripts/backup.sh
"${COMPOSE[@]}" pull backend frontend admin-next
"${COMPOSE[@]}" up -d --wait postgres redis
"${COMPOSE[@]}" --profile tools run --rm --no-deps migrate
SWITCH_STARTED=1
"${COMPOSE[@]}" up -d --no-build backend frontend admin-next
bash scripts/smoke-deploy.sh

trap - ERR
printf '%s\n' "$VERSION" > "$STATE_DIR/current-version"
echo "Deployment $VERSION completed successfully."
