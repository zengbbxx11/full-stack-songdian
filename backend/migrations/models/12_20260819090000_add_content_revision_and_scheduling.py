"""Add content revisions and scheduled publishing."""
from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "t_product" ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMPTZ;
        CREATE INDEX IF NOT EXISTS "idx_product_publish_schedule"
            ON "t_product" ("status", "published_at");
        CREATE INDEX IF NOT EXISTS "idx_news_publish_schedule"
            ON "t_news" ("status", "published_at");
        CREATE TABLE IF NOT EXISTS "t_content_revision" (
            "id" BIGSERIAL NOT NULL PRIMARY KEY,
            "resource_type" VARCHAR(20) NOT NULL,
            "resource_id" BIGINT NOT NULL,
            "version" INT NOT NULL,
            "change_type" VARCHAR(30) NOT NULL DEFAULT 'UPDATE',
            "snapshot" JSONB NOT NULL,
            "created_by" VARCHAR(100),
            "created_time" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "uid_content_revision_resource_version"
                UNIQUE ("resource_type", "resource_id", "version")
        );
        CREATE INDEX IF NOT EXISTS "idx_content_revision_resource"
            ON "t_content_revision" ("resource_type", "resource_id", "version");
    """


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "t_content_revision";
        DROP INDEX IF EXISTS "idx_news_publish_schedule";
        DROP INDEX IF EXISTS "idx_product_publish_schedule";
        ALTER TABLE "t_product" DROP COLUMN IF EXISTS "published_at";
    """


MODELS_STATE = ""
