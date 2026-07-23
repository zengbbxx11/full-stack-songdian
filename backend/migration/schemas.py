"""数据迁移 DTO/VO（M6，§3.2.M6.3）。

设计约束：字段与 §3.2.M6.3 / §4.2 DDL 对齐。
- MigrationRunRequest：source_base_url（含 /wp-json）、scope、dry_run。
- MigrationBatchVO / MigrationBatchDetailVO（含明细记录）。
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from common.config import settings
from common.enums import MigrationScope
from common.ssrf import is_safe_http_url


class MigrationRunRequest(BaseModel):
    source_base_url: str = Field(..., max_length=500, description="WP REST 基址，含 /wp-json")
    scope: str = MigrationScope.ALL.value  # all / product / news
    dry_run: bool = False

    @field_validator("source_base_url")
    @classmethod
    def _url(cls, v: str) -> str:
        if "wp-json" not in v:
            raise ValueError("source_base_url 需包含 /wp-json 基址")
        v = v.rstrip("/")
        # security-audit F-03：仅允许受信迁移源主机，阻断 SSRF 访问内网/元数据。
        if not is_safe_http_url(v, allowed_hosts=settings.migration_allowed_host_list):
            raise ValueError("source_base_url 必须指向受信的迁移源主机（SSRF 防护）")
        return v

    @field_validator("scope")
    @classmethod
    def _scope(cls, v: str) -> str:
        if v not in MigrationScope.values():
            raise ValueError("scope 必须为 all/product/news")
        return v


class MigrationRecordVO(BaseModel):
    id: int
    entity_type: str
    source_id: str
    target_id: int | None = None
    status: str
    error_msg: str | None = None

    @classmethod
    def from_model(cls, m) -> MigrationRecordVO:
        return cls(
            id=m.id, entity_type=m.entity_type, source_id=m.source_id,
            target_id=m.target_id, status=m.status, error_msg=m.error_msg,
        )


class MigrationBatchVO(BaseModel):
    id: int
    batch_no: str
    scope: str
    status: str
    total: int = 0
    processed: int = 0
    failed: int = 0
    started_at: datetime | None = None
    finished_at: datetime | None = None

    @classmethod
    def from_model(cls, m) -> MigrationBatchVO:
        return cls(
            id=m.id, batch_no=m.batch_no, scope=m.scope, status=m.status,
            total=m.total, processed=m.processed, failed=m.failed,
            started_at=m.started_at, finished_at=m.finished_at,
        )


class MigrationBatchDetailVO(MigrationBatchVO):
    records: list[MigrationRecordVO] = []

    @classmethod
    def from_model(cls, m, records=None) -> MigrationBatchDetailVO:
        base = MigrationBatchVO.from_model(m)
        data = base.model_dump()
        data["records"] = [MigrationRecordVO.from_model(r).model_dump() for r in (records or [])]
        return cls(**data)
