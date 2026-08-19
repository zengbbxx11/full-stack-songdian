from __future__ import annotations

from fastapi import APIRouter, Response

from common.result import Result
from content_revision.services import decode_preview_token
from news import services as news_services
from product import services as product_services

router = APIRouter(prefix="/api/v1", tags=["preview"])


@router.get("/preview/{token}", summary="读取短期签名草稿预览")
async def get_preview(token: str, response: Response) -> Result:
    response.headers["Cache-Control"] = "private, no-store, max-age=0"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    resource_type, resource_id = decode_preview_token(token)
    if resource_type == "product":
        content = await product_services.get_product_preview(resource_id)
    else:
        content = await news_services.get_news_preview(resource_id)
    return Result.ok({"resource_type": resource_type, "content": content.model_dump(mode="json")})
