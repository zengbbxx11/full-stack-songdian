"""TSVector 全文检索字段与维护工具（Shared Kernel，C-07 / §4.2）。

设计约束（§1 / §3.1 / §6.1 / BD-01）：
- ``TSVectorField`` 映射 PostgreSQL ``TSVECTOR`` 列；SQLite 下降级为 ``TEXT``（否则
  ``generate_schemas()`` 会因未知类型报错）。该列不经由 ORM 读写，建表后的值由
  ``update_search_vector()`` 以原生 SQL 写入。
- ``is_sqlite()`` 判断当前是否 SQLite，搜索与索引维护据此降级。
- ``update_search_vector(table, pk, *fields)``：写后/迁移后重建某行 search_vector，
  形如 ``to_tsvector(<config>, 拼接字段)``。``<config>`` 优先用 zhparser 的 ``'zh'``，
  未安装时降级内置 ``'simple'``；仅 PG 执行，失败仅告警不影响主数据；SQLite 直接跳过。
"""
from __future__ import annotations

from tortoise import connections
from tortoise.fields import Field

from common.config import is_sqlite
from common.logger import get_logger

logger = get_logger(__name__)


class TSVectorField(Field):  # type: ignore[misc]
    """映射 PostgreSQL TSVECTOR 列。

    SQLite 下 SQL_TYPE 退化为 TEXT；ORM 不读写字面值（由原生 SQL 维护），
    ``to_python_value`` / ``to_db_value`` 保持原样透传。
    """

    # 依据当前数据库类型选择建表类型，保证 SQLite generate_schemas 不报错
    SQL_TYPE = "TEXT" if is_sqlite() else "TSVECTOR"
    field_type = str

    def __init__(self, **kwargs: object) -> None:
        kwargs.setdefault("null", True)
        super().__init__(**kwargs)  # type: ignore[arg-type]

    def to_python_value(self, value: object) -> object:  # type: ignore[override]
        return value

    def to_db_value(self, value: object, instance: object) -> object:  # type: ignore[override]
        return value


def is_sqlite_db() -> bool:
    """当前是否 SQLite（供搜索/索引维护判断降级）。"""
    return is_sqlite()


# 已解析的 ts 配置名缓存：优先 zhparser 的 'zh'，缺失则降级 'simple'
_TS_CONFIG: str | None = None


async def resolve_tsconfig() -> str:
    """返回可用的全文检索配置名。

    生产环境安装 zhparser 扩展时返回 'zh'（中文分词）；
    本地/未安装 zhparser 时优雅降级到内置 'simple'，保证迁移与搜索可正常执行。
    结果缓存，避免每条记录重复探测。
    """
    global _TS_CONFIG
    if _TS_CONFIG is not None:
        return _TS_CONFIG
    try:
        # 探测 'zh' 配置是否可用（依赖 zhparser 扩展）
        await connections.get("default").execute_query(
            "SELECT to_tsvector('zh', '探测')"
        )
        _TS_CONFIG = "zh"
    except Exception:  # 配置不存在或无权访问，降级
        _TS_CONFIG = "simple"
    return _TS_CONFIG


async def update_search_vector(table: str, pk: int, *text_fields: str) -> None:
    """重建某行 search_vector = to_tsvector(<config>, 拼接字段)。仅 PG 执行。

    Args:
        table: 表名（如 t_product / t_news）。
        pk: 行主键。
        text_fields: 参与索引的文本列名。
    """
    if is_sqlite():
        return  # SQLite 无该列，搜索降级 LIKE
    joined = " || ' ' || ".join(f"COALESCE({f},'')" for f in text_fields)
    # 占位符用 asyncpg 的 $1（不是 psycopg2 的 %s）；配置名按可用性解析
    cfg = await resolve_tsconfig()
    sql = (
        f"UPDATE {table} SET search_vector = to_tsvector('{cfg}', {joined}) "
        f"WHERE id = $1"
    )
    try:
        await connections.get("default").execute_query(sql, [pk])
    except Exception as exc:  # 搜索向量失败不影响主数据落库，仅告警，可后续统一重建
        logger.warning("search_vector 重建失败 table=%s pk=%s: %s", table, pk, exc)
