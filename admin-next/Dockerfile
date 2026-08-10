# 管理后台（Next.js 16 standalone 镜像）
# 构建期镜像负责 npm install + next build；运行期镜像只保留最小 standalone 产物。
FROM node:24-alpine AS builder

WORKDIR /app

# 先仅复制依赖清单并安装，充分利用 Docker 层缓存（仅改代码时不必重装依赖）
COPY package.json package-lock.json ./
RUN npm ci

# NEXT_PUBLIC_API_URL：构建期内联变量（浏览器直连的 API 地址），需 ARG/ENV 注入
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# BACKEND_PROXY_URL：服务端 /api、/uploads 代理目标（next.config 的 rewrites 在
# 构建期求值）。默认容器间直连 backend:8000，避免回环公网域名走 OpenResty。
ARG BACKEND_PROXY_URL=http://backend:8000
ENV BACKEND_PROXY_URL=$BACKEND_PROXY_URL

# 复制业务源码并构建
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- 运行期 ----
FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

# JWT_SECRET 仅通过运行期环境变量或 Docker Secret 注入，绝不写入构建层。

# 复制 standalone 最小服务器（含 .next/standalone/server.js）
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3001
# standalone server.js 读取 PORT 环境变量；管理后台用 3001（由 compose 注入）
CMD ["node", "server.js"]
