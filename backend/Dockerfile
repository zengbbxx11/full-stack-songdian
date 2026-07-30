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
COPY pyproject.toml ./
RUN pip install --no-cache-dir uv \
    && uv sync --no-dev --system

# 复制业务代码（.dockerignore 已排除 .venv / .env / uploads / db 等非镜像内容）
COPY . .

# 暴露端口（与 OpenResty 反代目标 8000 一致）
EXPOSE 8000

# 启动：多 worker 提升并发
# --proxy-headers 信任前端代理(OpenResty)透传的 X-Forwarded-*
# --forwarded-allow-ips 限定仅宿主机反代(127.0.0.1)的转发头被信任，避免 IP 伪造
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips=127.0.0.1 --workers 4"]
