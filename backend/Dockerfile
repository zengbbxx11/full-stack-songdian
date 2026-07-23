# 松典后端镜像（多阶段，非 root，uvicorn 启动）
FROM python:3.13-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# 运行时依赖
COPY pyproject.toml ./
RUN pip install --upgrade pip && \
    pip install "fastapi>=0.115,<0.116" "uvicorn[standard]>=0.30" \
    "tortoise-orm>=0.21,<0.24" "pydantic>=2.7,<3" "pydantic-settings>=2.3,<3" \
    "aerich>=0.7,<0.8" "aiosqlite>=0.20" "asyncpg>=0.29" "redis>=5.0" \
    "pyjwt>=2.8" "bcrypt>=4.1" "bleach>=6.1" "httpx>=0.27" "python-multipart>=0.0.9" "tzdata>=2024"

# 非 root 用户
RUN useradd -m -u 10001 appuser

COPY . /app
RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
