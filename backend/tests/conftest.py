"""测试基座（SQLite + TestClient 注入）。

设计约束（§3.4 / T12）：用 aiosqlite 起 Tortoise，注入 TestClient 供 QA 接力。
- DATABASE_URL=sqlite（搜索接口走降级 LIKE）。
- REDIS_URL 留空 → 内存降级（无 Redis 依赖）。
- SEED_ON_START=true → 注入种子（分类 + admin 账号），便于登录类测试。

QA 隔离策略（严格把关、避免跨用例污染）：
- 每个用例使用**独立 SQLite 文件**（唯一文件名），彻底规避文件锁 / WAL 残留 /
  跨用例数据累积问题（此前观察到产品记录跨用例累积到数十条）。
- 重置模块级内存 Redis 单例，使下一用例 lifespan 重新创建干净实例，
  避免登录限流计数（login:rl:*，10/min）、幂等键、登录锁键（login:lock:*）跨用例累积。
- TestClient 关闭 raise_server_exceptions，使校验/异常路径返回的 4xx/5xx 可被断言检查，
  而非在测试内直接抛出导致失败信息不清晰。
"""
from __future__ import annotations

import os
import glob as _glob
import uuid as _uuid

# 必须在导入 main 之前设置环境变量
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_TEST_DB = os.path.join(_PROJECT_ROOT, "test.db")

# 清理遗留的旧 test.db* 文件（历史累积产物）
for _suffix in ("", "-wal", "-shm", "-journal"):
    _p = _TEST_DB + _suffix
    if os.path.exists(_p):
        try:
            os.remove(_p)
        except OSError:
            pass

# 清理遗留的旧 test_*.db* 文件（测试中断时未执行 finally 清理的残留）
for _p in _glob.glob(os.path.join(_PROJECT_ROOT, "test_*.db*")):
    try:
        os.remove(_p)
    except OSError:
        pass

os.environ.setdefault("DATABASE_URL", f"sqlite://{_TEST_DB}")
os.environ.setdefault("REDIS_URL", "")
os.environ.setdefault("SEED_ON_START", "true")
os.environ.setdefault("JWT_SECRET", "test-secret-for-qa")

import common.config as _cfg  # noqa: E402
import common.redis_client as _rc  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

# 测试不得读取开发者本机 .env 中的真实 SMTP 配置，避免用例发送外部邮件。
for _smtp_field in (
    "smtp_host",
    "smtp_user",
    "smtp_password",
    "inquiry_email_from",
    "inquiry_email_to",
):
    setattr(_cfg.settings, _smtp_field, "")


@pytest.fixture(autouse=True, scope="function")
def _qa_isolate_state():
    """QA 隔离夹具（在工程师基座之上扩展，不破坏原有 client 夹具）。

    每个用例独立：
    - 使用唯一 SQLite 文件，确保建表 + 种子从干净状态开始，
      避免跨用例数据 / 软删 / 锁污染，也规避 sqlite 文件锁导致的清理失败。
    - 重置模块级内存 Redis 单例，使下一用例 lifespan 重新创建干净实例。
    """
    db_name = f"test_{_uuid.uuid4().hex}.db"
    db_path = os.path.join(_PROJECT_ROOT, db_name)
    _cfg.settings.database_url = f"sqlite://{db_path}"
    _rc._redis = None
    yield
    # 清理本用例 DB 文件
    for _suffix in ("", "-wal", "-shm", "-journal"):
        _p = db_path + _suffix
        if os.path.exists(_p):
            try:
                os.remove(_p)
            except OSError:
                pass


@pytest.fixture(scope="function")
def client():
    """注入已触发 lifespan 的 TestClient（自动建表 + 种子）。

    raise_server_exceptions=False：让校验失败 / 未处理异常以 4xx/5xx 响应返回，
    便于断言（而非在测试内直接抛出异常）。
    """
    with TestClient(app, raise_server_exceptions=False) as c:
        # 产品分类由生产数据导入流程负责；测试单独创建一条，避免测试依赖生产 seed 内容。
        login = c.post(
            "/api/v1/admin/login",
            json={"username": "admin", "password": _cfg.settings.admin_password or "Songdian@2026"},
        )
        if login.status_code == 200 and login.json().get("code") in (0, "0"):
            token = login.json()["data"]["access_token"]
            c.post(
                "/api/v1/admin/categories",
                headers={"Authorization": f"Bearer {token}"},
                json={"name": "QA Category", "slug": f"qa-category-{_uuid.uuid4().hex[:8]}"},
            )
            # 后续用例应从匿名状态开始，不能继承登录接口下发的 Cookie。
            c.cookies.clear()
        yield c
