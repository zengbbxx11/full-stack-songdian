"""Add the ordering columns used by the product and news models."""
from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "t_product"
            ADD COLUMN IF NOT EXISTS "sort_order" DOUBLE PRECISION NOT NULL DEFAULT 0;
        ALTER TABLE "t_news"
            ADD COLUMN IF NOT EXISTS "sort_order" DOUBLE PRECISION NOT NULL DEFAULT 0;
    """


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "t_news" DROP COLUMN IF EXISTS "sort_order";
        ALTER TABLE "t_product" DROP COLUMN IF EXISTS "sort_order";
    """


MODELS_STATE = ""
