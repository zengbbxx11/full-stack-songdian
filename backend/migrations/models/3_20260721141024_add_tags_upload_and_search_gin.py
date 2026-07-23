from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "t_upload_record" (
    "created_time" TIMESTAMPTZ,
    "updated_time" TIMESTAMPTZ,
    "id" BIGSERIAL NOT NULL PRIMARY KEY,
    "url" VARCHAR(500) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "size" INT NOT NULL,
    "uploaded_by" VARCHAR(64)
);
COMMENT ON COLUMN "t_upload_record"."url" IS '相对/绝对访问 URL';
COMMENT ON COLUMN "t_upload_record"."file_name" IS '原始文件名';
COMMENT ON COLUMN "t_upload_record"."size" IS '字节数';
COMMENT ON COLUMN "t_upload_record"."uploaded_by" IS '上传人（管理员用户名）';
COMMENT ON TABLE "t_upload_record" IS '上传记录（图片/媒体溯源）。';
        ALTER TABLE "t_product" ADD "tags" JSONB;
        CREATE INDEX IF NOT EXISTS ix_t_product_search_vector ON "t_product" USING GIN ("search_vector");
        CREATE INDEX IF NOT EXISTS ix_t_news_search_vector ON "t_news" USING GIN ("search_vector");"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        DROP INDEX IF EXISTS ix_t_product_search_vector;
        DROP INDEX IF EXISTS ix_t_news_search_vector;
        ALTER TABLE "t_product" DROP COLUMN "tags";
        DROP TABLE IF EXISTS "t_upload_record";"""


MODELS_STATE = (
    "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"
    "5fpT0heoOr597MfvwfagXWuw=="
)
