"""产品域路由（M1，§3.2.M1.2）。

路径前缀 /api/v1。公开接口：/products、/products/{slug}、/product-categories。
后台写接口：/admin/products、/admin/products/{id}、/admin/products/{id}/gallery|attributes，
需 ``require_permission`` 校验 RBAC，并加 ``@audit`` 审计。创建类带幂等键。
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from common.audit import audit
from common.deps import optional_permission, require_permission
from common.exceptions import BizException, ErrorCode
from common.idempotency import acquire_idempotency, idempotency_key_dependency
from common.result import PageRequest, PageResponse, Result
from content.models import AdminUser
from content.permissions import PRODUCT_PUBLISH
from product import services
from product.schemas import (
    AttributeCreateRequest,
    CategoryCreate,
    CategoryUpdate,
    GalleryCreateRequest,
    ProductCreateRequest,
    ProductUpdateRequest,
    ReorderReq,
)

router = APIRouter(prefix="/api/v1", tags=["product"])


# ─────────────── 公开（前台）───────────────
@router.get("/products", summary="产品分页列表")
async def list_products(
    req: PageRequest = Depends(),
    category_id: int | None = Query(default=None),
    keyword: str | None = Query(default=None),
) -> Result:
    # security-audit F-02：公开列表强制仅返回已发布内容，拒绝客户端传入 DRAFT 等状态。
    items, total = await services.list_products(req, category_id, "PUBLISHED", keyword)
    return Result.ok(PageResponse.build([i.model_dump(mode="json") for i in items], total, req).model_dump())


@router.get("/products/{slug}", summary="产品详情")
async def get_detail(slug: str) -> Result:
    vo = await services.get_product_detail(slug)
    return Result.ok(vo.model_dump(mode="json"))


@router.get("/product-categories", summary="产品分类列表")
async def list_categories() -> Result:
    items = await services.list_categories()
    return Result.ok([i.model_dump(mode="json") for i in items])


# ─────────────── 后台（写，需 RBAC）───────────────
@router.post("/admin/products", summary="创建产品")
@audit(action="product.create", resource="product:{slug}")
async def create_product(
    data: ProductCreateRequest,
    request: Request,
    current_user: AdminUser = Depends(require_permission("product:create")),
    can_publish: bool = Depends(optional_permission(PRODUCT_PUBLISH)),
    idem_key: str | None = Depends(idempotency_key_dependency),
) -> Result:
    if idem_key:
        if not await acquire_idempotency(f"product:{idem_key}"):
            raise BizException(ErrorCode.C400001, "重复提交，请使用新的幂等键")
    # security-audit F-11：无发布权限时服务层将 PUBLISHED 降级为 DRAFT。
    vo = await services.create_product(data, operator=current_user.username, can_publish=can_publish)
    return Result.ok(vo.model_dump(mode="json"))


@router.put("/admin/products/{product_id}", summary="更新产品")
@audit(action="product.update", resource="product:{product_id}")
async def update_product(
    product_id: int,
    data: ProductUpdateRequest,
    request: Request,
    current_user: AdminUser = Depends(require_permission("product:update")),
    can_publish: bool = Depends(optional_permission(PRODUCT_PUBLISH)),
) -> Result:
    # security-audit F-11：无发布权限时服务层将 PUBLISHED 降级为 DRAFT。
    vo = await services.update_product(product_id, data, operator=current_user.username, can_publish=can_publish)
    return Result.ok(vo.model_dump(mode="json"))


@router.delete("/admin/products/{product_id}", summary="下架/删除产品")
@audit(action="product.delete", resource="product:{product_id}")
async def delete_product(
    product_id: int,
    request: Request,
    current_user: AdminUser = Depends(require_permission("product:delete")),
) -> Result:
    await services.delete_product(product_id, operator=current_user.username)
    return Result.ok(msg="已删除")


@router.post("/admin/products/{product_id}/gallery", summary="添加相册图")
@audit(action="product.gallery.add", resource="product:{product_id}")
async def add_gallery(
    product_id: int,
    data: GalleryCreateRequest,
    request: Request,
    current_user: AdminUser = Depends(require_permission("product:update")),
) -> Result:
    vo = await services.add_gallery(product_id, data)
    return Result.ok(vo.model_dump(mode="json"))


@router.delete("/admin/products/{product_id}/gallery/{gallery_id}", summary="删除相册图")
@audit(action="product.gallery.delete", resource="product:{product_id}")
async def delete_gallery(
    product_id: int,
    gallery_id: int,
    request: Request,
    current_user: AdminUser = Depends(require_permission("product:update")),
) -> Result:
    await services.delete_gallery(product_id, gallery_id)
    return Result.ok(None)


@router.post("/admin/products/{product_id}/attributes", summary="添加规格")
@audit(action="product.attribute.add", resource="product:{product_id}")
async def add_attribute(
    product_id: int,
    data: AttributeCreateRequest,
    request: Request,
    current_user: AdminUser = Depends(require_permission("product:update")),
) -> Result:
    vo = await services.add_attribute(product_id, data)
    return Result.ok(vo.model_dump(mode="json"))


@router.delete("/admin/products/{product_id}/attributes/{attr_id}", summary="删除规格")
@audit(action="product.attribute.delete", resource="product:{product_id}")
async def delete_attribute(
    product_id: int,
    attr_id: int,
    request: Request,
    current_user: AdminUser = Depends(require_permission("product:update")),
) -> Result:
    await services.delete_attribute(product_id, attr_id)
    return Result.ok(None)


# ─────────────── 后台按 ID 详情（T04）───────────────
@router.get("/admin/products/{product_id}", summary="后台产品详情（按 ID）")
async def get_product_admin(
    product_id: int,
    _user: AdminUser = Depends(require_permission("product:read")),
) -> Result:
    # 绕过软删过滤，admin 可读取/编辑已软删项（含 tags/galleries/attributes）。
    vo = await services.get_product_by_id(product_id)
    return Result.ok(vo.model_dump(mode="json"))


# ─────────────── 后台分类写/排序（T02）───────────────
@router.get("/admin/categories", summary="后台分类列表（分页）")
async def list_categories_admin(
    req: PageRequest = Depends(),
    _user: AdminUser = Depends(require_permission("category:read")),
) -> Result:
    items, total = await services.list_categories_page(req)
    return Result.ok(
        PageResponse.build([i.model_dump(mode="json") for i in items], total, req).model_dump()
    )


@router.post("/admin/categories", summary="创建分类")
@audit(action="category.create", resource="category:{slug}")
async def create_category(
    data: CategoryCreate,
    request: Request,
    current_user: AdminUser = Depends(require_permission("category:create")),
) -> Result:
    vo = await services.create_category(data, operator=current_user.username)
    return Result.ok(vo.model_dump(mode="json"))


@router.put("/admin/categories/{category_id}", summary="更新分类")
@audit(action="category.update", resource="category:{category_id}")
async def update_category(
    category_id: int,
    data: CategoryUpdate,
    request: Request,
    current_user: AdminUser = Depends(require_permission("category:update")),
) -> Result:
    vo = await services.update_category(category_id, data, operator=current_user.username)
    return Result.ok(vo.model_dump(mode="json"))


@router.delete("/admin/categories/{category_id}", summary="删除分类（软删）")
@audit(action="category.delete", resource="category:{category_id}")
async def delete_category(
    category_id: int,
    request: Request,
    current_user: AdminUser = Depends(require_permission("category:delete")),
) -> Result:
    await services.delete_category(category_id, operator=current_user.username)
    return Result.ok(msg="已删除")


@router.put("/admin/categories/sort", summary="分类拖拽排序")
@audit(action="category.sort", resource="category:sort")
async def reorder_categories(
    data: ReorderReq,
    request: Request,
    current_user: AdminUser = Depends(require_permission("category:update")),
) -> Result:
    await services.reorder_category(data.ids)
    return Result.ok(msg="已排序")
