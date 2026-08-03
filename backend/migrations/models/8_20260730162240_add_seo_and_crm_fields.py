"""兼容已部署数据库的第 8 号迁移。

该版本曾在云端执行后被仓库重命名/合并，导致 aerich 表仍记录本文件而仓库缺失。
保留原版本号并使用幂等 DDL，确保新库可重放、已完成第 8 号迁移的云库不会重复变更。
后续清理旧字段和规范外键由第 9 号迁移负责。
"""
from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "t_product" ADD COLUMN IF NOT EXISTS "seo_title" VARCHAR(120);
        ALTER TABLE "t_product" ADD COLUMN IF NOT EXISTS "seo_description" VARCHAR(300);
        ALTER TABLE "t_inquiry" ADD COLUMN IF NOT EXISTS "assigned_user_id" BIGINT;
        ALTER TABLE "t_inquiry" ADD COLUMN IF NOT EXISTS "follow_notes" JSONB DEFAULT '[]';
        ALTER TABLE "t_inquiry" ADD COLUMN IF NOT EXISTS "last_contact_time" TIMESTAMPTZ;
        ALTER TABLE "t_inquiry" ADD COLUMN IF NOT EXISTS "tags" JSONB DEFAULT '[]';
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'fk_t_inquiry_t_admin_user_f7ee8391'
            ) THEN
                ALTER TABLE "t_inquiry"
                    ADD CONSTRAINT "fk_t_inquiry_t_admin_user_f7ee8391"
                    FOREIGN KEY ("assigned_user_id")
                    REFERENCES "t_admin_user" ("id") ON DELETE SET NULL;
            END IF;
        END $$;
    """


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "t_inquiry" DROP CONSTRAINT IF EXISTS "fk_t_inquiry_t_admin_user_f7ee8391";
        ALTER TABLE "t_inquiry" DROP COLUMN IF EXISTS "assigned_user_id";
        ALTER TABLE "t_inquiry" DROP COLUMN IF EXISTS "follow_notes";
        ALTER TABLE "t_inquiry" DROP COLUMN IF EXISTS "last_contact_time";
        ALTER TABLE "t_inquiry" DROP COLUMN IF EXISTS "tags";
        ALTER TABLE "t_product" DROP COLUMN IF EXISTS "seo_title";
        ALTER TABLE "t_product" DROP COLUMN IF EXISTS "seo_description";
    """


# 该文件用于修复已应用迁移的版本链；模型状态由后续 9 号迁移提供。
MODELS_STATE = "PLACEHOLDER_compatibility_migration"
