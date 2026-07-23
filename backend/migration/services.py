"""数据迁移服务（M6，§3.2.M6 / §6.4）。

设计约束：批次编排（PENDING→RUNNING→SUCCESS/FAILED/PARTIAL）、行数/内容/业务对账。
源不可达（BD-04）时批次置 FAILED，已迁移保留。
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from common.exceptions import BizException, ErrorCode
from common.logger import get_logger
from common.result import PageRequest
from migration.etl import run_etl
from migration.models import MigrationBatch, MigrationRecord
from migration.schemas import (
    MigrationBatchDetailVO,
    MigrationBatchVO,
    MigrationRunRequest,
)

logger = get_logger(__name__)


def _gen_batch_no() -> str:
    ts = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    return f"MIG-{ts}-{uuid.uuid4().hex[:6]}"


async def run_migration(req: MigrationRunRequest) -> MigrationBatchVO:
    batch = await MigrationBatch.create(
        batch_no=_gen_batch_no(), scope=req.scope, status="PENDING"
    )
    try:
        await run_etl(batch, req.source_base_url, req.scope, dry_run=req.dry_run)
    except Exception as exc:  # noqa: BLE001
        # 兜底：任何未捕获异常都置 FAILED（BD-04 暂停）
        logger.error("迁移批次执行异常（BD-04 暂停）：%s", exc)
        batch.status = "FAILED"
        batch.finished_at = datetime.now(UTC)
        await batch.save()
    return MigrationBatchVO.from_model(batch)


async def list_batches(req: PageRequest) -> tuple[list[MigrationBatchVO], int]:
    # MigrationBatch 无 created_time 字段（仅有 started_at）；前端默认 -created_time
    # 在此统一降级为 -started_at，避免 FieldError 500
    order_field = req.order_by
    if order_field in (None, "", "created_time", "-created_time"):
        order_field = "-started_at"
    q = MigrationBatch.all()
    total = await q.count()
    rows = await q.order_by(order_field).offset(req.offset).limit(req.limit)
    return [MigrationBatchVO.from_model(r) for r in rows], total


async def get_batch_detail(batch_id: int) -> MigrationBatchDetailVO:
    batch = await MigrationBatch.get_or_none(id=batch_id)
    if batch is None:
        raise BizException(ErrorCode.A060001)
    records = await MigrationRecord.filter(batch_id=batch.id).order_by("id")
    return MigrationBatchDetailVO.from_model(batch, records=records)
