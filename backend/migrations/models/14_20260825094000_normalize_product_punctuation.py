"""Remove a legacy full-width closing parenthesis from product copy."""
from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        UPDATE "t_product"
        SET "summary" = replace("summary", 'interpolation）', 'interpolation'),
            "content_html" = replace("content_html", 'interpolation）', 'interpolation')
        WHERE "summary" LIKE '%interpolation）%'
           OR "content_html" LIKE '%interpolation）%';
    """


async def downgrade(db: BaseDBAsyncClient) -> str:
    return ""


MODELS_STATE = ""
