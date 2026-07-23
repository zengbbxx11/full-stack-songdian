"""异常与错误码体系（Shared Kernel）。

设计约束（§3.5.1 错误码全量注册表）：
- A=业务错误（HTTP 200，业务语义失败）/ B=系统错误（HTTP 5xx）/ C=客户端错误（HTTP 4xx）。
- 模块编码：01=产品 02=新闻 03=搜索 04=询盘 05=内容 06=迁移 99=全局。
- ``register_exception_handlers(app)`` 拦截 ``BizException`` 与校验错误，统一包成 ``Result``。
"""
from __future__ import annotations

from typing import Final

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from common.logger import get_logger
from common.result import Result

logger = get_logger(__name__)


class ErrorCode:
    """错误码常量（与设计 §3.5.1 全量注册表逐字对齐）。"""
    A010001 = "A010001"
    A010002 = "A010002"
    A020001 = "A020001"
    A020002 = "A020002"
    A030001 = "A030001"
    A040001 = "A040001"
    A040002 = "A040002"
    A050001 = "A050001"
    A050002 = "A050002"
    A050003 = "A050003"
    A060001 = "A060001"
    A060002 = "A060002"
    B999001 = "B999001"
    C400001 = "C400001"
    C401001 = "C401001"
    C403001 = "C403001"
    C404001 = "C404001"
    C429001 = "C429001"


# (HTTP 状态, 默认文案, i18n)
_ERROR_REGISTRY: Final[dict] = {
    ErrorCode.A010001: (200, "产品不存在或已下架", {"zh-CN": "产品不存在或已下架", "en-US": "Product not found or off-shelf"}),
    ErrorCode.A010002: (200, "产品别名重复", {"zh-CN": "产品别名重复", "en-US": "Product slug duplicated"}),
    ErrorCode.A020001: (200, "新闻不存在", {"zh-CN": "新闻不存在", "en-US": "News not found"}),
    ErrorCode.A020002: (200, "新闻别名重复", {"zh-CN": "新闻别名重复", "en-US": "News slug duplicated"}),
    ErrorCode.A030001: (200, "搜索关键词为空", {"zh-CN": "请输入搜索关键词", "en-US": "Search keyword is empty"}),
    ErrorCode.A040001: (200, "邮箱格式非法", {"zh-CN": "邮箱格式不正确", "en-US": "Invalid email format"}),
    ErrorCode.A040002: (200, "留言过长或必填缺失", {"zh-CN": "请完整填写询盘信息", "en-US": "Inquiry info incomplete"}),
    ErrorCode.A050001: (200, "账号不存在", {"zh-CN": "账号或密码错误", "en-US": "Account or password incorrect"}),
    ErrorCode.A050002: (200, "密码错误", {"zh-CN": "账号或密码错误", "en-US": "Account or password incorrect"}),
    ErrorCode.A050003: (200, "无权限操作", {"zh-CN": "无权访问该资源", "en-US": "No permission"}),
    ErrorCode.A060001: (200, "迁移批次不存在", {"zh-CN": "批次不存在", "en-US": "Migration batch not found"}),
    ErrorCode.A060002: (200, "迁移校验失败", {"zh-CN": "数据校验未通过", "en-US": "Migration validation failed"}),
    ErrorCode.B999001: (500, "系统内部错误", {"zh-CN": "系统繁忙，请稍后再试", "en-US": "System busy, please retry later"}),
    ErrorCode.C400001: (400, "参数校验失败", {"zh-CN": "请求参数错误", "en-US": "Invalid request parameters"}),
    ErrorCode.C401001: (401, "未登录", {"zh-CN": "请先登录", "en-US": "Please login first"}),
    ErrorCode.C403001: (403, "无权限", {"zh-CN": "无权访问", "en-US": "Forbidden"}),
    ErrorCode.C404001: (404, "资源不存在", {"zh-CN": "页面或资源不存在", "en-US": "Resource not found"}),
    ErrorCode.C429001: (429, "触发限流", {"zh-CN": "操作太频繁，请稍后再试", "en-US": "Too many requests"}),
}


def resolve_error(code: str) -> tuple[int, str, dict]:
    """根据错误码返回 (http_status, msg, msg_i18n)。未知码默认系统错误。"""
    if code in _ERROR_REGISTRY:
        return _ERROR_REGISTRY[code]
    return _ERROR_REGISTRY[ErrorCode.B999001]


def _sanitize(obj: object) -> object:
    """递归把不可 JSON 序列化的对象转成 ``str``。

    pydantic ``field_validator`` 抛出的 ``ValueError`` 实例会进入
    ``RequestValidationError.errors()`` 的 ``ctx.error``，该对象不可 JSON 序列化，
    直接 ``json.dumps`` 会 ``TypeError`` 进而拖垮服务端（500）。
    这里把非 (str/int/float/bool/None) 的叶子统一 ``str()``，确保 Result.data 永可序列化。
    """
    if isinstance(obj, dict):
        return {str(k): _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [_sanitize(v) for v in obj]
    if isinstance(obj, (str, int, float, bool)) or obj is None:
        return obj
    return str(obj)


class BizException(Exception):
    """业务异常：绑定错误码，统一返回约定结构。"""

    def __init__(self, code: str, msg: str | None = None, data: object | None = None) -> None:
        self.code = code
        status, default_msg, i18n = resolve_error(code)
        self.http_status = status
        self.msg = msg or default_msg
        self.msg_i18n = i18n
        self.data = data
        super().__init__(self.msg)


def _result_response(code: str, msg: str, msg_i18n: dict, http_status: int,
                     data: object | None = None) -> JSONResponse:
    result = Result.fail(code=code, msg=msg, msg_i18n=msg_i18n, data=data)
    return JSONResponse(status_code=http_status, content=result.model_dump())


def register_exception_handlers(app: FastAPI) -> None:
    """注册全局异常处理器，统一包成 Result。"""

    @app.exception_handler(BizException)
    async def _biz_handler(request: Request, exc: BizException) -> JSONResponse:
        return _result_response(exc.code, exc.msg, exc.msg_i18n, exc.http_status, exc.data)

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        # 校验失败 → C400001（HTTP 400）。
        # pydantic field_validator 抛的 ValueError 会进入 errors() 的 ctx.error，
        # 实例不可 JSON 序列化 → 需递归 str() 后承载，避免 500 拖垮服务端（BD 修复）。
        try:
            raw_errors = exc.errors(include_url=False)
        except Exception:  # noqa: BLE001
            raw_errors = [{"type": "validation_error", "msg": str(exc)}]
        return _result_response(
            ErrorCode.C400001, "参数校验失败", _ERROR_REGISTRY[ErrorCode.C400001][2], 400,
            data=_sanitize(raw_errors),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        mapping = {
            401: ErrorCode.C401001,
            403: ErrorCode.C403001,
            404: ErrorCode.C404001,
            400: ErrorCode.C400001,
            429: ErrorCode.C429001,
        }
        code = mapping.get(exc.status_code, ErrorCode.B999001)
        status, msg, i18n = resolve_error(code)
        return _result_response(code, msg, i18n, exc.status_code)

    @app.exception_handler(Exception)
    async def _unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("未处理异常: %s", exc)
        return _result_response(
            ErrorCode.B999001, "系统内部错误", _ERROR_REGISTRY[ErrorCode.B999001][2], 500
        )
