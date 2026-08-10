"""统一询盘负责人外键，修复 8/9 迁移在干净库中产生的重复约束。"""
from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "t_inquiry"
            DROP CONSTRAINT IF EXISTS "fk_t_inquiry_t_admin_user_f7ee8391";
        ALTER TABLE "t_inquiry"
            DROP CONSTRAINT IF EXISTS "fk_t_inquir_t_admin__24769a2e";
        ALTER TABLE "t_inquiry"
            DROP CONSTRAINT IF EXISTS "fk_t_inquiry_assigned_user";
        ALTER TABLE "t_inquiry"
            ALTER COLUMN "assigned_user_id" TYPE BIGINT USING "assigned_user_id"::BIGINT;
        ALTER TABLE "t_inquiry"
            ADD CONSTRAINT "fk_t_inquiry_assigned_user"
            FOREIGN KEY ("assigned_user_id") REFERENCES "t_admin_user" ("id")
            ON DELETE SET NULL;
    """


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "t_inquiry"
            DROP CONSTRAINT IF EXISTS "fk_t_inquiry_assigned_user";
    """


# 本迁移不改变 ORM 模型；复用上一版的模型快照，避免后续 aerich diff 误报。
MODELS_STATE = ""
