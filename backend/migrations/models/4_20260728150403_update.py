from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "t_setting" (
    "key" VARCHAR(100) NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "description" VARCHAR(500) NOT NULL
);
COMMENT ON TABLE "t_setting" IS '键值对配置表。';
        ALTER TABLE "t_product_category" ALTER COLUMN "sort_order" TYPE DOUBLE PRECISION USING "sort_order"::DOUBLE PRECISION;
        ALTER TABLE "t_news_category" ALTER COLUMN "sort_order" TYPE DOUBLE PRECISION USING "sort_order"::DOUBLE PRECISION;
        ALTER TABLE "t_news" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
        DROP TABLE IF EXISTS "t_migration_record";
        DROP TABLE IF EXISTS "t_migration_batch";"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "t_news" ALTER COLUMN "status" SET DEFAULT 'PUBLISHED';
        ALTER TABLE "t_news_category" ALTER COLUMN "sort_order" TYPE INT USING "sort_order"::INT;
        ALTER TABLE "t_product_category" ALTER COLUMN "sort_order" TYPE INT USING "sort_order"::INT;"""


MODELS_STATE = (
    "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"
    "MEvbYKngITkBMczOqsy+/x++vvba"
)
