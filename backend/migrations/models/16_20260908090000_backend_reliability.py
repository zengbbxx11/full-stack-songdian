"""Durable jobs and account session versions; existing records are preserved."""

from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "t_admin_user" ADD COLUMN IF NOT EXISTS "session_version" INT NOT NULL DEFAULT 0;
        CREATE TABLE IF NOT EXISTS "t_background_job" (
            "id" BIGSERIAL PRIMARY KEY,
            "kind" VARCHAR(30) NOT NULL,
            "payload" JSONB NOT NULL,
            "attempts" INT NOT NULL DEFAULT 0,
            "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
            "available_at" TIMESTAMPTZ NOT NULL,
            "lease_token" VARCHAR(64),
            "last_error" VARCHAR(500),
            "created_time" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS "idx_background_job_due"
            ON "t_background_job" ("status", "available_at");
    """


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP TABLE IF EXISTS "t_background_job";
        ALTER TABLE "t_admin_user" DROP COLUMN IF EXISTS "session_version";
    """


MODELS_STATE = ""
