"""搜索域模型（M3，§3.2.M3）。

搜索为读模型（投影自 Product/News），**无独立表**。本文件仅作占位与值对象说明，
实际查询在 ``services.py`` 中跨 t_product / t_news 执行。
"""
from __future__ import annotations

# 搜索结果项（值对象），具体定义在 schemas.SearchItemVO。
# 此处预留 SearchDocument 投影结构说明，便于未来引入独立读模型。
SEARCH_KINDS = ("product", "news")
