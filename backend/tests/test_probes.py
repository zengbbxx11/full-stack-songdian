"""探针测试（健康检查，§3.1.7 / 蓝图 §6.7）。

/healthz 与 /readyz 返回**纯状态 dict**，不包裹统一 Result（无 code 字段）。

环境说明（无 REDIS_URL → 内存降级 BD-03）：``common/redis_client`` 在 REDIS_URL 为空时
降级为进程内 MemoryBackend，其 ``ping()`` 始终成功，因此 /readyz 在本环境下返回
``redis: True``、``status: "ready"``。本测试只校验探针契约要点：纯状态 dict（不包 Result）、
``status`` 取值域、``db``/``redis`` 为布尔。是否将「内存降级」反映为 ``status=degraded``
属可观测性实现细节，不在本契约断言范围内（已在测试报告中向主理人提示）。
"""
from __future__ import annotations


def test_healthz_plain_status_dict(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    body = r.json()
    # 纯状态 dict，不包裹 Result
    assert "code" not in body, f"探针不应包裹 Result：{body}"
    assert body.get("status") == "alive"


def test_readyz_plain_status_dict(client):
    r = client.get("/readyz")
    assert r.status_code == 200
    body = r.json()
    # 纯状态 dict，不包裹 Result
    assert "code" not in body, f"探针不应包裹 Result：{body}"
    assert body.get("status") in ("ready", "degraded"), body
    assert isinstance(body.get("db"), bool), body
    assert isinstance(body.get("redis"), bool), body
    # 本环境下 DB 探活成功；内存降级 Redis 的 ping 成功 → redis=True
    assert body.get("db") is True, f"DB 应探活成功：{body}"
    assert body.get("redis") is True, f"内存降级 Redis ping 成功：{body}"
