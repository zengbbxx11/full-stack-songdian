"""新闻域路由（M2，§3.2.M2.2）。

路径前缀 /api/v1。公开：/news、/news/{slug}、/news-categories。
后台写：/admin/news、/admin/news/{id}、/admin/news/{id} DELETE，需 RBAC + 审计。
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from common.audit import audit
from common.deps import optional_permission, require_permission
from common.exceptions import BizException, ErrorCode
from common.idempotency import acquire_idempotency, idempotency_key_dependency
from common.result import PageRequest, PageResponse, Result
from content.models import AdminUser
from content.permissions import NEWS_PUBLISH
from news import services
from news.schemas import (
    NewsCategoryCreate,
    NewsCategoryReorderReq,
    NewsCategoryUpdate,
    NewsCreateRequest,
    NewsUpdateRequest,
)

router = APIRouter(prefix="/api/v1", tags=["news"])


@router.get("/news", summary="新闻分页列表")
async def list_news(
    req: PageRequest = Depends(),
    category_id: int | None = Query(default=None),
    keyword: str | None = Query(default=None),
) -> Result:
    # security-audit F-02：公开列表强制仅返回已发布内容，拒绝客户端传入 DRAFT 等状态。
    items, total = await services.list_news(req, category_id, "PUBLISHED", keyword)
    return Result.ok(PageResponse.build([i.model_dump(mode="json") for i in items], total, req).model_dump())


@router.get("/news/{slug}", summary="新闻详情")
async def get_detail(slug: str) -> Result:
    vo = await services.get_news_detail(slug)
    return Result.ok(vo.model_dump(mode="json"))


@router.get("/news-categories", summary="新闻分类列表")
async def list_categories() -> Result:
    items = await services.list_categories()
    return Result.ok([i.model_dump(mode="json") for i in items])


@router.post("/admin/news", summary="创建新闻")
@audit(action="news.create", resource="news:{slug}")
async def create_news(
    data: NewsCreateRequest,
    request: Request,
    current_user: AdminUser = Depends(require_permission("news:create")),
    can_publish: bool = Depends(optional_permission(NEWS_PUBLISH)),
    idem_key: str | None = Depends(idempotency_key_dependency),
) -> Result:
    if idem_key:
        if not await acquire_idempotency(f"news:{idem_key}"):
            raise BizException(ErrorCode.C400001, "重复提交，请使用新的幂等键")
    # security-audit F-11：无发布权限时服务层将 PUBLISHED 降级为 DRAFT。
    vo = await services.create_news(data, operator=current_user.username, can_publish=can_publish)
    return Result.ok(vo.model_dump(mode="json"))


@router.put("/admin/news/{news_id}", summary="更新新闻")
@audit(action="news.update", resource="news:{news_id}")
async def update_news(
    news_id: int,
    data: NewsUpdateRequest,
    request: Request,
    current_user: AdminUser = Depends(require_permission("news:update")),
    can_publish: bool = Depends(optional_permission(NEWS_PUBLISH)),
) -> Result:
    # security-audit F-11：无发布权限时服务层将 PUBLISHED 降级为 DRAFT。
    vo = await services.update_news(news_id, data, operator=current_user.username, can_publish=can_publish)
    return Result.ok(vo.model_dump(mode="json"))


@router.delete("/admin/news/{news_id}", summary="删除新闻")
@audit(action="news.delete", resource="news:{news_id}")
async def delete_news(
    news_id: int,
    request: Request,
    current_user: AdminUser = Depends(require_permission("news:delete")),
) -> Result:
    await services.delete_news(news_id, operator=current_user.username)
    return Result.ok(msg="已删除")


# ─────────────── 后台按 ID 详情（T04）───────────────
@router.get("/admin/news/{news_id}", summary="后台新闻详情（按 ID）")
async def get_news_admin(
    news_id: int,
    _user: AdminUser = Depends(require_permission("news:read")),
) -> Result:
    # 绕过软删过滤，admin 可读取/编辑已软删项。
    vo = await services.get_news_by_id(news_id)
    return Result.ok(vo.model_dump(mode="json"))


# ─────────────── 后台新闻分类写/排序（T02）───────────────
@router.get("/admin/news-categories", summary="后台新闻分类列表（分页）")
async def list_news_categories_admin(
    req: PageRequest = Depends(),
    _user: AdminUser = Depends(require_permission("news:category:read")),
) -> Result:
    items, total = await services.list_news_categories_page(req)
    return Result.ok(
        PageResponse.build([i.model_dump(mode="json") for i in items], total, req).model_dump()
    )


@router.post("/admin/news-categories", summary="创建新闻分类")
@audit(action="news.category.create", resource="news:category:{slug}")
async def create_news_category(
    data: NewsCategoryCreate,
    request: Request,
    current_user: AdminUser = Depends(require_permission("news:category:create")),
) -> Result:
    vo = await services.create_news_category(data, operator=current_user.username)
    return Result.ok(vo.model_dump(mode="json"))


@router.put("/admin/news-categories/{news_category_id}", summary="更新新闻分类")
@audit(action="news.category.update", resource="news:category:{news_category_id}")
async def update_news_category(
    news_category_id: int,
    data: NewsCategoryUpdate,
    request: Request,
    current_user: AdminUser = Depends(require_permission("news:category:update")),
) -> Result:
    vo = await services.update_news_category(news_category_id, data, operator=current_user.username)
    return Result.ok(vo.model_dump(mode="json"))


@router.delete("/admin/news-categories/{news_category_id}", summary="删除新闻分类（软删）")
@audit(action="news.category.delete", resource="news:category:{news_category_id}")
async def delete_news_category(
    news_category_id: int,
    request: Request,
    current_user: AdminUser = Depends(require_permission("news:category:delete")),
) -> Result:
    await services.delete_news_category(news_category_id, operator=current_user.username)
    return Result.ok(msg="已删除")


@router.put("/admin/news-categories/sort", summary="新闻分类拖拽排序")
@audit(action="news.category.sort", resource="news:category:sort")
async def reorder_news_categories(
    data: NewsCategoryReorderReq,
    request: Request,
    current_user: AdminUser = Depends(require_permission("news:category:update")),
) -> Result:
    await services.reorder_news_category(data.ids)
    return Result.ok(msg="已排序")
