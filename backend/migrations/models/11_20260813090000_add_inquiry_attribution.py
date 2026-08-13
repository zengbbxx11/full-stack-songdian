"""Add optional inquiry attribution fields and per-user notification read state."""
from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "t_inquiry" ADD COLUMN IF NOT EXISTS "landing_page" VARCHAR(1000);
        ALTER TABLE "t_inquiry" ADD COLUMN IF NOT EXISTS "source_product" VARCHAR(200);
        ALTER TABLE "t_inquiry" ADD COLUMN IF NOT EXISTS "referrer" VARCHAR(1000);
        ALTER TABLE "t_inquiry" ADD COLUMN IF NOT EXISTS "utm_source" VARCHAR(200);
        ALTER TABLE "t_inquiry" ADD COLUMN IF NOT EXISTS "utm_medium" VARCHAR(200);
        ALTER TABLE "t_inquiry" ADD COLUMN IF NOT EXISTS "utm_campaign" VARCHAR(200);
        ALTER TABLE "t_inquiry" ADD COLUMN IF NOT EXISTS "utm_term" VARCHAR(200);
        ALTER TABLE "t_inquiry" ADD COLUMN IF NOT EXISTS "utm_content" VARCHAR(200);
        CREATE TABLE IF NOT EXISTS "t_notification_read_state" (
            "id" BIGSERIAL NOT NULL PRIMARY KEY,
            "notification_key" VARCHAR(255) NOT NULL,
            "read_time" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "user_id" BIGINT NOT NULL REFERENCES "t_admin_user" ("id") ON DELETE CASCADE,
            CONSTRAINT "uid_t_notificat_user_id_40b1de" UNIQUE ("user_id", "notification_key")
        );
        CREATE INDEX IF NOT EXISTS "idx_t_notificat_user_id_338598"
            ON "t_notification_read_state" ("user_id");
    """


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "t_notification_read_state";
        ALTER TABLE "t_inquiry" DROP COLUMN IF EXISTS "utm_content";
        ALTER TABLE "t_inquiry" DROP COLUMN IF EXISTS "utm_term";
        ALTER TABLE "t_inquiry" DROP COLUMN IF EXISTS "utm_campaign";
        ALTER TABLE "t_inquiry" DROP COLUMN IF EXISTS "utm_medium";
        ALTER TABLE "t_inquiry" DROP COLUMN IF EXISTS "utm_source";
        ALTER TABLE "t_inquiry" DROP COLUMN IF EXISTS "referrer";
        ALTER TABLE "t_inquiry" DROP COLUMN IF EXISTS "source_product";
        ALTER TABLE "t_inquiry" DROP COLUMN IF EXISTS "landing_page";
    """


MODELS_STATE = ""
