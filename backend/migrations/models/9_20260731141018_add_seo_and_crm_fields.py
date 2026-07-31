from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "t_product" DROP COLUMN "use_cases_html";
        ALTER TABLE "t_product" DROP COLUMN "download_files";
        ALTER TABLE "t_product" DROP COLUMN "video_url";
        ALTER TABLE "t_product" DROP COLUMN "seo_keywords";
        ALTER TABLE "t_product" DROP COLUMN "canonical_url";
        ALTER TABLE "t_product" ALTER COLUMN "seo_title" TYPE VARCHAR(120) USING "seo_title"::VARCHAR(120);
        ALTER TABLE "t_product" ALTER COLUMN "seo_description" TYPE VARCHAR(300) USING "seo_description"::VARCHAR(300);
        ALTER TABLE "t_inquiry" ADD "follow_notes" JSONB;
        ALTER TABLE "t_inquiry" DROP COLUMN "assigned_user_name";
        COMMENT ON COLUMN "t_inquiry"."assigned_user_id" IS '负责跟进的销售人员';
        COMMENT ON COLUMN "t_inquiry"."last_contact_time" IS '最近一次联系时间';
        DROP TABLE IF EXISTS "t_inquiry_follow_up";
        ALTER TABLE "t_inquiry" ADD CONSTRAINT "fk_t_inquir_t_admin__24769a2e" FOREIGN KEY ("assigned_user_id") REFERENCES "t_admin_user" ("id") ON DELETE SET NULL;"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        ALTER TABLE "t_inquiry" DROP CONSTRAINT IF EXISTS "fk_t_inquir_t_admin__24769a2e";
        ALTER TABLE "t_inquiry" ADD "assigned_user_name" VARCHAR(64);
        ALTER TABLE "t_inquiry" DROP COLUMN "follow_notes";
        COMMENT ON COLUMN "t_inquiry"."assigned_user_id" IS NULL;
        COMMENT ON COLUMN "t_inquiry"."last_contact_time" IS NULL;
        ALTER TABLE "t_product" ADD "use_cases_html" TEXT;
        ALTER TABLE "t_product" ADD "download_files" JSONB;
        ALTER TABLE "t_product" ADD "video_url" VARCHAR(500);
        ALTER TABLE "t_product" ADD "seo_keywords" VARCHAR(500);
        ALTER TABLE "t_product" ADD "canonical_url" VARCHAR(500);
        ALTER TABLE "t_product" ALTER COLUMN "seo_title" TYPE VARCHAR(200) USING "seo_title"::VARCHAR(200);
        ALTER TABLE "t_product" ALTER COLUMN "seo_description" TYPE VARCHAR(500) USING "seo_description"::VARCHAR(500);"""


MODELS_STATE = (
    "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"
    "rqH9fTe4B3vP25NuZt//DxlV8jg="
)
