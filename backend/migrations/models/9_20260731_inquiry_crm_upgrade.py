"""询盘 CRM 升级（2026-07-31，P0.4）：
- 新增 assigned_user(FK→AdminUser) / follow_notes(JSONB) / last_contact_time / tags(JSONB) 四个字段
- 状态兼容：现有数据 status 若为 REPLIED→CONTACTING、ARCHIVED→LOST（软迁移）
"""
from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "t_inquiry"
            ADD "assigned_user_id" BIGINT,
            ADD "follow_notes" JSONB DEFAULT '[]',
            ADD "last_contact_time" TIMESTAMPTZ,
            ADD "tags" JSONB DEFAULT '[]';
        ALTER TABLE "t_inquiry"
            ADD CONSTRAINT "fk_t_inquiry_t_admin_user_f7ee8391" FOREIGN KEY ("assigned_user_id")
                REFERENCES "t_admin_user" ("id") ON DELETE SET NULL;
        COMMENT ON COLUMN "t_inquiry"."assigned_user_id" IS '负责跟进的销售人员';
        COMMENT ON COLUMN "t_inquiry"."follow_notes" IS '跟进时间线：[{time,user,note}]';
        COMMENT ON COLUMN "t_inquiry"."last_contact_time" IS '最近一次联系时间';
        COMMENT ON COLUMN "t_inquiry"."tags" IS '标签数组，如 ["VIP","sample_request"]';

        -- 历史数据软迁移：REPLIED → CONTACTING, ARCHIVED → LOST
        UPDATE "t_inquiry" SET status = 'CONTACTING' WHERE status = 'REPLIED';
        UPDATE "t_inquiry" SET status = 'LOST' WHERE status = 'ARCHIVED';"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        -- 回退状态：CONTACTING → REPLIED, LOST → ARCHIVED（DEAL 无法回退，留原值）
        UPDATE "t_inquiry" SET status = 'REPLIED' WHERE status = 'CONTACTING';
        UPDATE "t_inquiry" SET status = 'ARCHIVED' WHERE status IN ('LOST', 'DEAL');
        UPDATE "t_inquiry" SET status = 'ARCHIVED' WHERE status = 'QUOTED';

        ALTER TABLE "t_inquiry"
            DROP CONSTRAINT IF EXISTS "fk_t_inquiry_t_admin_user_f7ee8391",
            DROP COLUMN "assigned_user_id",
            DROP COLUMN "follow_notes",
            DROP COLUMN "last_contact_time",
            DROP COLUMN "tags";"""

# ⚠️ MODELS_STATE 需在开发机上运行 `aerich migrate` 自动生成替换下方占位符
MODELS_STATE = "PLACEHOLDER_run_aerich_migrate_to_generate"
