# 企业官网前端（Next.js 16 standalone 镜像）
# 构建期镜像负责 npm install + next build；运行期镜像只保留最小 standalone 产物。
FROM node:24-alpine AS builder

WORKDIR /app

# 先仅复制依赖清单并安装，充分利用 Docker 层缓存（仅改代码时不必重装依赖）
COPY package.json package-lock.json ./
RUN npm ci

# NEXT_PUBLIC_* 是构建期内联变量（会被写进客户端 JS），必须用 ARG/ENV 注入后再 build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_IMAGE_HOST
ENV NEXT_PUBLIC_IMAGE_HOST=$NEXT_PUBLIC_IMAGE_HOST

# 复制业务源码并构建
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- 运行期 ----
FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 复制 standalone 最小服务器（含 .next/standalone/server.js）
COPY --from=builder /app/.next/standalone ./
# 静态资源由 Next 运行时从 .next/static 读取
COPY --from=builder /app/.next/static ./.next/static
# 站点静态文件（favicon、og 图、banner 等）
COPY --from=builder /app/public ./public

EXPOSE 3000
# standalone server.js 读取 PORT 环境变量（默认 3000）；由 compose 注入
CMD ["node", "server.js"]
