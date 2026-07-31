"""新增 Product 模型 seo_title / seo_description 字段（2026-07-31，P0.3）。"""
from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "t_product"
            ADD "seo_title" VARCHAR(120),
            ADD "seo_description" VARCHAR(300);
        COMMENT ON COLUMN "t_product"."seo_title" IS 'SEO 页面标题（覆盖 title，推荐 ~60 字符）';
        COMMENT ON COLUMN "t_product"."seo_description" IS 'SEO Meta 描述（覆盖 content_html 截取，推荐 120-160 字符）';"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "t_product"
            DROP COLUMN "seo_title",
            DROP COLUMN "seo_description";"""

# ⚠️ MODELS_STATE 需在开发机上运行 `aerich migrate` 自动生成��替换下方占位符
MODELS_STATE = "PLACEHOLDER_run_aerich_migrate_to_generate"
