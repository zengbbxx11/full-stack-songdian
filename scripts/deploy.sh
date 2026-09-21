#!/usr/bin/env bash
set -Eeuo pipefail

VERSION="${1:?Usage: scripts/deploy.sh <image-version> [--skip-backup]}"
# 跳过备份只允许通过**显式命令行参数**触发：环境变量很容易被 CI/导出意外带上，
# 造成"静默零备份"的发布。用法：scripts/deploy.sh <sha> --skip-backup
SKIP_BACKUP=0
case "${2:-}" in
  "") ;;
  --skip-backup) SKIP_BACKUP=1 ;;
  *) echo "Unknown option: $2 (only --skip-backup is supported)" >&2; exit 2 ;;
esac
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

# 先起数据服务，再备份：backup.sh 走 `docker compose exec postgres pg_dump`，需要 postgres
# **已在运行**。原顺序（备份 → up postgres）在两种情况下必然失败并让 ERR trap 中止发布：
# 全新主机首次部署（还没有容器）、以及 postgres 异常退出需要抢修发布时。
"${COMPOSE[@]}" up -d --wait postgres redis
if [[ "$SKIP_BACKUP" == "1" ]]; then
  echo "已显式传入 --skip-backup：本次跳过数据库/媒体备份（请确认已有独立备份）。" >&2
else
  # 始终备份当前部署目录对应的 Compose 项目，避免 PROD_PATH 使用非默认路径时
  # backup.sh 回落到硬编码目录而备份了错误实例。
  COMPOSE_DIR="$PWD" BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups}" bash scripts/backup.sh
fi
"${COMPOSE[@]}" pull backend frontend admin-next
"${COMPOSE[@]}" --profile tools run --rm --no-deps migrate
SWITCH_STARTED=1
"${COMPOSE[@]}" up -d --no-build backend frontend admin-next
bash scripts/smoke-deploy.sh

trap - ERR
printf '%s\n' "$VERSION" > "$STATE_DIR/current-version"
echo "Deployment $VERSION completed successfully."
