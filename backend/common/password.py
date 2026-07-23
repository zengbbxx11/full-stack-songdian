"""密码哈希封装（Shared Kernel，CRED-04）。

设计约束：直接使用 bcrypt（避开 passlib 维护停滞）。
- ``hash_password``：明文 → bcrypt 哈希串（带 salt）。
- ``verify_password``：明文 + 哈希串 → 是否匹配。
"""
from __future__ import annotations

import bcrypt


def hash_password(plain: str) -> str:
    """返回 bcrypt 哈希串。"""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """校验明文与 bcrypt 哈希是否匹配。"""
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False
