"""应用配置 — 环境变量 + 数据库连接
────────────────────────────────────────────────
两个作用：
1. Settings 类 — 读取 .env 配置（数据库地址/JWT密钥/Redis等）
2. init_db() / close_db() — 连接和断开数据库（Tortoise ORM）
"""
from __future__ import annotations

import logging
import os
import secrets
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict
from tortoise import Tortoise, run_async

logger = logging.getLogger(__name__)

# 后端项目根目录（common/config.py 位于 backend/common/，故 parent.parent = backend）
BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """全局配置单例。所有环境变量默认值遵循设计文档 §4.3 与 .env.example。"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── 数据库 ──
    database_url: str = "sqlite://./dev.db"
    # Tortoise modules 列表（单 app 标签 "models"）
    tortoise_modules: list[str] = [
        "product.models",
        "news.models",
        "inquiry.models",
        "content.models",
        "migration.models",
        "uploads.models",
        "common.settings_model",
    ]

    # ── Redis（未配置或连不上 → 内存降级，绝不阻断启动）──
    redis_url: str = ""

    # ── JWT ──
    # 生产环境必须通过环境变量 JWT_SECRET 注入 ≥32 字节随机值（见 model_post_init 启动守卫）。
    jwt_secret: str = ""
    jwt_alg: str = "HS256"
    access_token_ttl: int = 7200          # 2h
    refresh_token_ttl: int = 604800       # 7d

    # ── 运行环境（security-audit F-13 / F-14）──
    # production 下缺失/占位 JWT_SECRET 或启用 OpenAPI 文档将直接拒绝启动。
    app_env: str = "production"
    # 是否暴露 /docs /redoc /openapi.json（仅开发环境允许，生产默认关闭）。
    openapi_docs_enabled: bool = False

    # ── SMTP（未配置 → 询盘仅持久化，BD-02/MOCK）──
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    inquiry_email_from: str = ""
    inquiry_email_to: str = ""

    # ── 限流阈值（§3.5.3）──
    rate_global_qps: int = 500
    rate_ip_qps: int = 60
    rate_user_qps: int = 30
    rate_login_per_min: int = 10

    # ── CORS（security-audit F-09）：显式来源，禁用凭据，避免通配 + cookie 风险 ──
    # 逗号分隔，如 "http://localhost:3000,http://localhost:3001"。Bearer 鉴权无需凭据。
    cors_origins: str = "http://localhost:3000,http://localhost:3001"

    # ── 受信代理（security-audit F-06）：仅这些直连 IP 的 X-Forwarded-For 才被信任 ──
    # 逗号分隔，如 "10.0.0.1,127.0.0.1"。为空则一律不信任 XFF。
    trusted_proxies: str = ""

    # ── 安全失败策略（security-audit F-07）：Redis 不可用时安全关键操作 fail-closed ──
    security_fail_closed: bool = True

    # ── 单租户常量（§1.3 / §8.2）──
    tenant_id: str = "songdian"

    # ── 种子数据 ──
    seed_on_start: bool = True
    # 初始管理员密码：不再硬编码默认值（security-audit F-04）。
    # 通过环境变量 ADMIN_PASSWORD 注入；若为空，种子将生成一次性随机密码并打印到日志。
    admin_password: str = ""

    # ── 服务监听 ──
    host: str = "0.0.0.0"
    port: int = 8000

    # ── 媒体文件（迁移图片落盘 / 静态服务）──
    # media_root 为后端根目录下的相对（或绝对）存储目录；media_url 为对外暴露的 URL 前缀。
    media_root: str = "uploads"
    media_url: str = "/uploads"

    # ── 文件上传（T03）──
    # 单文件大小上限（MB）；前端/后端均据此校验。
    max_upload_mb: int = 10
    # 批量上传上限（数量 / 总大小 MB），防磁盘耗尽 DoS（security-audit F-10）。
    max_upload_files: int = 20
    max_upload_total_mb: int = 100
    # 存储后端：当前仅 "local"（本地磁盘）；未来可扩展 "oss" / "cos"。
    storage_backend: str = "local"

    # ── 迁移源站白名单（security-audit F-03，防 SSRF）──
    # 迁移时仅允许向这些主机发起 HTTP 请求（拉取 WP REST 与图片）。
    # 默认即本地 WP（镜像源）；生产可改为实际 WP 域名，或用逗号分隔多个。
    migration_wp_host: str = "localhost:10004"
    migration_allowed_hosts: str = ""

    def _as_list(self, raw: str) -> list[str]:
        """逗号分隔字符串转去空白列表。"""
        return [p.strip() for p in raw.split(",") if p.strip()]

    @property
    def cors_origin_list(self) -> list[str]:
        return self._as_list(self.cors_origins)

    @property
    def trusted_proxy_list(self) -> list[str]:
        return self._as_list(self.trusted_proxies)

    @property
    def migration_allowed_host_list(self) -> list[str]:
        hosts = self._as_list(self.migration_allowed_hosts)
        if self.migration_wp_host:
            hosts.append(self.migration_wp_host)
        # 去重保序
        seen: set[str] = set()
        result: list[str] = []
        for h in hosts:
            if h not in seen:
                seen.add(h)
                result.append(h)
        return result

    def model_post_init(self, __context) -> None:
        """初始化后安全校验（H5 / security-audit F-13 / F-14）。

        - ``app_env != "production"``（开发环境）：JWT_SECRET 缺失/占位时自动生成临时随机密钥，
          仅本地开发用，重启即失效；OpenAPI 文档默认开启。
        - ``app_env == "production"``（生产环境）：JWT_SECRET 缺失或仍为占位符则**直接拒绝启动**，
          避免被伪造令牌；OpenAPI 文档默认关闭（需显式 openapi_docs_enabled=true）。
        """
        is_prod = self.app_env.strip().lower() == "production"
        placeholder = "change-me-strong-random"
        if not self.jwt_secret or self.jwt_secret == placeholder:
            if is_prod:
                raise RuntimeError(
                    "安全启动守卫：生产环境下 JWT_SECRET 缺失或为占位符，已拒绝启动。"
                    "请通过环境变量 JWT_SECRET 注入 ≥32 字节随机值。"
                )
            # 开发环境：生成临时密钥，不阻断启动。
            self.jwt_secret = secrets.token_urlsafe(32)
            logger.warning(
                "JWT_SECRET 未配置，已使用临时随机密钥（重启即失效），"
                "生产环境务必通过环境变量注入 ≥32 字节随机值"
            )
        if is_prod and not self.openapi_docs_enabled:
            # 生产环境默认关闭文档（可在开发环境或显式开启）。
            self.openapi_docs_enabled = False


# 全局单例
settings = Settings()

# 媒体文件绝对根目录：media_root 为相对路径时拼接 backend 根；为绝对路径时直接使用。
MEDIA_ROOT = (
    Path(settings.media_root)
    if os.path.isabs(settings.media_root)
    else (BACKEND_ROOT / settings.media_root)
).resolve()

# aerich 使用的标准 Tortoise 配置（供迁移工具加载并生成 DDL）。
# - connections.default 取自 .env 的 DATABASE_URL（生产 PG / 本地可切 SQLite）。
# - apps.models.models 指向全部 5 个领域模型模块（product / news / inquiry / content / migration），
#   与运行时 init_db() 注册的模型集合保持一致，保证建表与运行态一致。
TORTOISE_ORM = {
    "connections": {"default": settings.database_url},
    "apps": {
        "models": {
            "models": settings.tortoise_modules,  # 5 个领域模型模块
            "default_connection": "default",
        }
    },
}


def is_sqlite() -> bool:
    """判断是否使用 SQLite（影响 TSVector / 搜索降级路径）。"""
    return settings.database_url.strip().startswith("sqlite")


async def init_db() -> None:
    """连接数据库并注册所有数据表模型。

    SQLite 模式下会自动建表（CREATE TABLE IF NOT EXISTS）。
    PostgreSQL 模式下需要用 aerich 工具手动跑迁移（见 README §3）。
    """
    # Tortoise.init 连数据库 + 注册全部 model
    await Tortoise.init(
        db_url=settings.database_url,
        modules={"models": settings.tortoise_modules},
        _enable_global_fallback=True,  # 允许在非 async context 中访问 ORM
    )
    # SQLite 自动建表；PG 由 aerich 迁移负责
    if is_sqlite():
        await Tortoise.generate_schemas()


async def close_db() -> None:
    """断开数据库连接（应用关闭时调用）"""
    await Tortoise.close_connections()


if __name__ == "__main__":
    # 便捷：``python -m common.config`` 可单独建表（SQLite）
    run_async(init_db())
    print("Tortoise initialized with modules:", settings.tortoise_modules)
