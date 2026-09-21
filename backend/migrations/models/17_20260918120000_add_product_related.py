"""Products can hand-pick their related products (one-way, at most four)."""

from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "t_product_related" (
            "id" BIGSERIAL NOT NULL PRIMARY KEY,
            "sort_order" DOUBLE PRECISION NOT NULL DEFAULT 0,
            "product_id" BIGINT NOT NULL REFERENCES "t_product" ("id") ON DELETE CASCADE,
            "related_id" BIGINT NOT NULL REFERENCES "t_product" ("id") ON DELETE CASCADE,
            CONSTRAINT "uid_product_related_product_related" UNIQUE ("product_id", "related_id")
        );
        CREATE INDEX IF NOT EXISTS "idx_product_related_product_sort_order"
            ON "t_product_related" ("product_id", "sort_order");
        CREATE INDEX IF NOT EXISTS "idx_product_related_related"
            ON "t_product_related" ("related_id");
    """


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP INDEX IF EXISTS "idx_product_related_related";
        DROP INDEX IF EXISTS "idx_product_related_product_sort_order";
        DROP TABLE IF EXISTS "t_product_related";
    """


MODELS_STATE = ""
