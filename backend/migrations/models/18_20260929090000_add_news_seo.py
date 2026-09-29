"""Optional editorial SEO overrides; existing news continues using automatic metadata."""
from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "t_news" ADD COLUMN IF NOT EXISTS "seo_title" VARCHAR(120);
        ALTER TABLE "t_news" ADD COLUMN IF NOT EXISTS "seo_description" VARCHAR(300);
    """


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "t_news" DROP COLUMN IF EXISTS "seo_description";
        ALTER TABLE "t_news" DROP COLUMN IF EXISTS "seo_title";
    """


MODELS_STATE = ""
