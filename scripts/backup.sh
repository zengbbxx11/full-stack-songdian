#!/usr/bin/env bash
# ============================================================================
# 松典 B2B 自动备份脚本
# 用法：./scripts/backup.sh
# 建议加入 cron 每日执行：
#   0 3 * * * cd /home/ubuntu/full-stack-songdian && bash scripts/backup.sh
# ============================================================================
set -euo pipefail

# ── 配置（按实际路径修改） ──────────────────────────────────────────────
COMPOSE_DIR="${COMPOSE_DIR:-/home/ubuntu/full-stack-songdian}"
BACKUP_DIR="${BACKUP_DIR:-/home/ubuntu/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

# Compose 项目名（与 docker-compose.yml 的 name: 保持一致）
COMPOSE_PROJECT="songdian-b2b"

# ── 初始化 ──────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
LOG_FILE="$BACKUP_DIR/backup.log"
DATE=$(date +%Y%m%d)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

log() { echo "[$TIMESTAMP] $*" | tee -a "$LOG_FILE"; }

die() {
    log "✗ 备份中断：$*"
    exit 1
}

# ── 切换到 Compose 目录 ────────────────────────────────────────────────
cd "$COMPOSE_DIR" || die "无法进入 Compose 目录 $COMPOSE_DIR"

# ── 加载 .env 获取数据库凭证 ───────────────────────────────────────────
if [ -f .env ]; then
    # shellcheck disable=SC1091
    source <(grep -E '^(PG_USER|PG_DB)=' .env)
    PG_USER="${PG_USER:-songdian}"
    PG_DB="${PG_DB:-songdian_b2b}"
else
    PG_USER="songdian"
    PG_DB="songdian_b2b"
fi

log "========== 备份开始 =========="

# ────────────────────────────────────────────────────────────────────────
# 1. PostgreSQL 全量备份（pg_dump + gzip）
# ────────────────────────────────────────────────────────────────────────
PG_FILE="$BACKUP_DIR/db_${DATE}.sql.gz"
PG_TMP=$(mktemp "$BACKUP_DIR/.db_${DATE}.XXXXXX")

log "→ PostgreSQL 备份：$PG_FILE"
if docker compose exec -T postgres pg_dump -U "$PG_USER" -d "$PG_DB" 2>/tmp/pg_dump_err.log | gzip > "$PG_TMP" && gzip -t "$PG_TMP"; then
    mv "$PG_TMP" "$PG_FILE"
    PG_SIZE=$(du -h "$PG_FILE" | cut -f1)
    log "  ✓ PostgreSQL 备份完成 ($PG_SIZE)"
else
    PG_ERR=$(cat /tmp/pg_dump_err.log 2>/dev/null || true)
    log "  ✗ PostgreSQL 备份失败：${PG_ERR:-未知错误}"
    rm -f "$PG_TMP"
    die "PostgreSQL 备份失败"
fi

# ────────────────────────────────────────────────────────────────────────
# 2. 上传文件备份（挂载 uploads_data 卷 → tar.gz）
# ────────────────────────────────────────────────────────────────────────
UPLOADS_FILE="$BACKUP_DIR/uploads_${DATE}.tar.gz"
UPLOADS_TMP=$(mktemp "$BACKUP_DIR/.uploads_${DATE}.XXXXXX")

log "→ uploads 备份：$UPLOADS_FILE"
if docker run --rm \
    -v "${COMPOSE_PROJECT}_uploads_data:/data:ro" \
    alpine:latest \
    tar czf - -C /data . 2>/tmp/uploads_err.log > "$UPLOADS_TMP" && tar tzf "$UPLOADS_TMP" >/dev/null; then
    mv "$UPLOADS_TMP" "$UPLOADS_FILE"
    UPLOADS_SIZE=$(du -h "$UPLOADS_FILE" | cut -f1)
    log "  ✓ uploads 备份完成 ($UPLOADS_SIZE)"
else
    UPLOADS_ERR=$(cat /tmp/uploads_err.log 2>/dev/null || true)
    log "  ✗ uploads 备份失败：${UPLOADS_ERR:-未知错误}"
    rm -f "$UPLOADS_TMP"
    die "uploads 备份失败"
fi

# ────────────────────────────────────────────────────────────────────────
# 3. 保留策略：删除 7 天前的备份（跳过每月 1 号的长期保留）
# ────────────────────────────────────────────────────────────────────────
log "→ 清理过期备份（${RETENTION_DAYS} 天前，保留每月 1 号）"

# 数据库备份清理
find "$BACKUP_DIR" -name "db_*.sql.gz" -mtime "+${RETENTION_DAYS}" \
    ! -name "db_??????01.sql.gz" \
    -print -delete 2>/dev/null | while read -r f; do
    log "  - 删除过期：$(basename "$f")"
done

# uploads 备份清理
find "$BACKUP_DIR" -name "uploads_*.tar.gz" -mtime "+${RETENTION_DAYS}" \
    ! -name "uploads_??????01.tar.gz" \
    -print -delete 2>/dev/null | while read -r f; do
    log "  - 删除过期：$(basename "$f")"
done

# ────────────────────────────────────────────────────────────────────────
# 4. 汇总
# ────────────────────────────────────────────────────────────────────────
TOTAL=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
log "  备份目录总大小：$TOTAL"
log "========== 备份结束 =========="
