from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        CREATE TABLE IF NOT EXISTS "t_product_category" (
    "created_time" TIMESTAMPTZ,
    "updated_time" TIMESTAMPTZ,
    "deleted" SMALLINT NOT NULL,
    "id" BIGSERIAL NOT NULL PRIMARY KEY,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL UNIQUE,
    "sort_order" INT NOT NULL
);
COMMENT ON COLUMN "t_product_category"."deleted" IS '0 存在 / 1 删除';
CREATE TABLE IF NOT EXISTS "t_product" (
    "created_time" TIMESTAMPTZ,
    "updated_time" TIMESTAMPTZ,
    "deleted" SMALLINT NOT NULL,
    "created_by" VARCHAR(64),
    "updated_by" VARCHAR(64),
    "id" BIGSERIAL NOT NULL PRIMARY KEY,
    "slug" VARCHAR(200) NOT NULL UNIQUE,
    "title" VARCHAR(200) NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "content_html" TEXT NOT NULL,
    "sku" VARCHAR(100),
    "price" DECIMAL(12,2),
    "currency" VARCHAR(10) NOT NULL,
    "stock_status" VARCHAR(20) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "search_vector" TSVECTOR,
    "category_id" BIGINT NOT NULL REFERENCES "t_product_category" ("id") ON DELETE RESTRICT
);
COMMENT ON COLUMN "t_product"."deleted" IS '0 存在 / 1 删除';
CREATE TABLE IF NOT EXISTS "t_product_attribute" (
    "id" BIGSERIAL NOT NULL PRIMARY KEY,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "value" VARCHAR(500) NOT NULL,
    "product_id" BIGINT NOT NULL REFERENCES "t_product" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "t_product_gallery" (
    "id" BIGSERIAL NOT NULL PRIMARY KEY,
    "image_url" VARCHAR(500) NOT NULL,
    "alt" VARCHAR(200),
    "sort_order" INT NOT NULL,
    "product_id" BIGINT NOT NULL REFERENCES "t_product" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "t_news_category" (
    "created_time" TIMESTAMPTZ,
    "updated_time" TIMESTAMPTZ,
    "deleted" SMALLINT NOT NULL,
    "id" BIGSERIAL NOT NULL PRIMARY KEY,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL UNIQUE,
    "sort_order" INT NOT NULL
);
COMMENT ON COLUMN "t_news_category"."deleted" IS '0 存在 / 1 删除';
CREATE TABLE IF NOT EXISTS "t_news" (
    "created_time" TIMESTAMPTZ,
    "updated_time" TIMESTAMPTZ,
    "deleted" SMALLINT NOT NULL,
    "created_by" VARCHAR(64),
    "updated_by" VARCHAR(64),
    "id" BIGSERIAL NOT NULL PRIMARY KEY,
    "slug" VARCHAR(200) NOT NULL UNIQUE,
    "title" VARCHAR(200) NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "content_html" TEXT NOT NULL,
    "author" VARCHAR(100),
    "published_at" TIMESTAMPTZ NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "search_vector" TSVECTOR,
    "category_id" BIGINT NOT NULL REFERENCES "t_news_category" ("id") ON DELETE RESTRICT
);
COMMENT ON COLUMN "t_news"."deleted" IS '0 存在 / 1 删除';
CREATE TABLE IF NOT EXISTS "t_inquiry" (
    "id" BIGSERIAL NOT NULL PRIMARY KEY,
    "name" VARCHAR(50) NOT NULL,
    "email" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(20),
    "company" VARCHAR(100),
    "country" VARCHAR(100),
    "product_interest" VARCHAR(200),
    "message" VARCHAR(2000) NOT NULL,
    "source_page" VARCHAR(500),
    "biz_req_no" VARCHAR(100) NOT NULL UNIQUE,
    "status" VARCHAR(30) NOT NULL,
    "smtp_status" VARCHAR(30) NOT NULL,
    "smtp_retry" INT NOT NULL,
    "reply_note" VARCHAR(1000),
    "created_time" TIMESTAMPTZ,
    "updated_time" TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS "t_audit_log" (
    "id" BIGSERIAL NOT NULL PRIMARY KEY,
    "user_id" BIGINT NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "resource" VARCHAR(200) NOT NULL,
    "result" VARCHAR(30) NOT NULL,
    "ip" VARCHAR(64),
    "created_time" TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS "t_role" (
    "id" BIGSERIAL NOT NULL PRIMARY KEY,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(100) NOT NULL UNIQUE,
    "remark" VARCHAR(200)
);
CREATE TABLE IF NOT EXISTS "t_admin_user" (
    "created_time" TIMESTAMPTZ,
    "updated_time" TIMESTAMPTZ,
    "id" BIGSERIAL NOT NULL PRIMARY KEY,
    "username" VARCHAR(64) NOT NULL UNIQUE,
    "password_hash" VARCHAR(100) NOT NULL,
    "email" VARCHAR(200),
    "status" VARCHAR(30) NOT NULL,
    "last_login" TIMESTAMPTZ,
    "login_fail" INT NOT NULL,
    "role_id" BIGINT NOT NULL REFERENCES "t_role" ("id") ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS "t_role_permission" (
    "id" BIGSERIAL NOT NULL PRIMARY KEY,
    "permission_code" VARCHAR(100) NOT NULL,
    "role_id" BIGINT NOT NULL REFERENCES "t_role" ("id") ON DELETE CASCADE,
    CONSTRAINT "uid_t_role_perm_role_id_f04afd" UNIQUE ("role_id", "permission_code")
);
COMMENT ON TABLE "t_role_permission" IS 'RBAC 多对多：角色 → 权限码（页面+按钮级）。无独立权限实体表。';
CREATE TABLE IF NOT EXISTS "t_migration_batch" (
    "id" BIGSERIAL NOT NULL PRIMARY KEY,
    "batch_no" VARCHAR(100) NOT NULL UNIQUE,
    "scope" VARCHAR(30) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "total" INT NOT NULL,
    "processed" INT NOT NULL,
    "failed" INT NOT NULL,
    "started_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS "t_migration_record" (
    "id" BIGSERIAL NOT NULL PRIMARY KEY,
    "entity_type" VARCHAR(30) NOT NULL,
    "source_id" VARCHAR(100) NOT NULL,
    "target_id" BIGINT,
    "status" VARCHAR(30) NOT NULL,
    "error_msg" VARCHAR(1000),
    "batch_id" BIGINT NOT NULL REFERENCES "t_migration_batch" ("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "aerich" (
    "id" SERIAL NOT NULL PRIMARY KEY,
    "version" VARCHAR(255) NOT NULL,
    "app" VARCHAR(100) NOT NULL,
    "content" JSONB NOT NULL
);"""


async def downgrade(db: BaseDBAsyncClient) -> str:
    return """
        """


MODELS_STATE = (
    "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"
)
