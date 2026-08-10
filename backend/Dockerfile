# 后端 FastAPI 容器镜像
# 基础：Python 3.14（与项目冻结栈一致）+ Debian bookworm（自带 tzdata、编译工具链）
FROM python:3.14-slim-bookworm

# 中文注释：系统依赖说明
# - tzdata：Python 3.14 在容器内需系统时区数据（ZoneInfo），否则写带时区字段会失败
# - build-essential / libpq-dev：asyncpg 等可能需就地编译并链接 libpq 客户端库
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

# 工作目录（compose build context = backend/，故代码根即 /app/backend）
WORKDIR /app/backend

# 用 uv 安装生产依赖：先放 pyproject.toml，uv sync 会按需生成/复用 uv.lock（确定性构建）
COPY pyproject.toml uv.lock ./
RUN pip install --no-cache-dir uv \
    && uv sync --frozen --no-dev

# uv sync 默认创建 .venv 虚拟环境（新版 uv 已移除 --system 参数），
# 把 .venv/bin 加入 PATH，使 aerich / uvicorn 等命令可直接调用
ENV PATH="/app/backend/.venv/bin:$PATH"

# 复制业务代码（.dockerignore 已排除 .venv / .env / uploads / db 等非镜像内容）
COPY . .

# 暴露端口（与 OpenResty 反代目标 8000 一致）
EXPOSE 8000

# 启动：多 worker 提升并发
# --proxy-headers 信任前端代理(OpenResty)透传的 X-Forwarded-*
# 可信代理地址由 scripts/start.sh 在容器运行时读取：可显式传 TRUSTED_PROXIES，
# 否则自动识别 Docker 网桥网关，避免将宿主机 OpenResty 错当成 127.0.0.1。
CMD ["sh", "./scripts/start.sh"]
