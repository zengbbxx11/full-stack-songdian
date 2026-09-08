"""Fail CI when required production columns are missing after migrations."""
from __future__ import annotations

import asyncio

from tortoise import Tortoise

from common.config import TORTOISE_ORM


REQUIRED_COLUMNS = {
    ("t_product", "sort_order"),
    ("t_news", "sort_order"),
    ("t_admin_user", "session_version"),
    ("t_background_job", "payload"),
    ("t_background_job", "lease_token"),
}


async def verify_schema() -> None:
    await Tortoise.init(config=TORTOISE_ORM)
    try:
        connection = Tortoise.get_connection("default")
        rows = await connection.execute_query_dict(
            """
            SELECT table_name, column_name
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND (table_name, column_name) IN (
                  ('t_product', 'sort_order'),
                  ('t_news', 'sort_order'),
                  ('t_admin_user', 'session_version'),
                  ('t_background_job', 'payload'),
                  ('t_background_job', 'lease_token')
              )
            """
        )
        present = {(row["table_name"], row["column_name"]) for row in rows}
        missing = sorted(REQUIRED_COLUMNS - present)
        if missing:
            formatted = ", ".join(f"{table}.{column}" for table, column in missing)
            raise RuntimeError(f"Missing required database columns after migration: {formatted}")
        print("Schema verification passed:", ", ".join(f"{t}.{c}" for t, c in sorted(REQUIRED_COLUMNS)))
    finally:
        await Tortoise.close_connections()


if __name__ == "__main__":
    asyncio.run(verify_schema())
