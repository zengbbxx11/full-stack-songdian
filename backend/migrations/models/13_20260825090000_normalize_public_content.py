"""Normalize legacy public category, news, and product copy."""
from tortoise import BaseDBAsyncClient

RUN_IN_TRANSACTION = True


async def upgrade(db: BaseDBAsyncClient) -> str:
    return """
        UPDATE "t_product_category"
        SET "name" = 'Action Camera'
        WHERE "slug" = 'action-camera' AND "name" = 'Action Ccamera';

        UPDATE "t_news"
        SET "summary" = replace(
            replace(
                replace("summary", 'Songdian;s', 'Songdian''s'),
                'R&#038;D', 'R&D'
            ),
            ' lines ,', ' lines,'
        )
        WHERE "summary" LIKE '%Songdian;s%'
           OR "summary" LIKE '%R&#038;D%'
           OR "summary" LIKE '% lines ,%';

        UPDATE "t_product"
        SET "summary" = regexp_replace(
            replace(replace("summary", 'UP to ', 'Up to '), 'anti shaking', 'anti-shake'),
            '([0-9]+(\\.[0-9]+)?)inch', '\\1-inch', 'g'
        ),
        "content_html" = regexp_replace(
            replace(replace("content_html", 'UP to ', 'Up to '), 'anti shaking', 'anti-shake'),
            '([0-9]+(\\.[0-9]+)?)inch', '\\1-inch', 'g'
        )
        WHERE "summary" LIKE '%UP to %'
           OR "summary" LIKE '%inch%'
           OR "summary" LIKE '%anti shaking%'
           OR "content_html" LIKE '%UP to %'
           OR "content_html" LIKE '%inch%'
           OR "content_html" LIKE '%anti shaking%';

        UPDATE "t_product_attribute"
        SET "value" = regexp_replace(
            "value", '([0-9]+(\\.[0-9]+)?)inch', '\\1-inch', 'g'
        )
        WHERE "value" ~ '[0-9]+(\\.[0-9]+)?inch';

    """


async def downgrade(db: BaseDBAsyncClient) -> str:
    # Copy normalization is intentionally non-reversible: the previous values
    # were spelling/formatting defects, not valid business content.
    return ""


MODELS_STATE = ""
