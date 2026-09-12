#!/bin/sh
# Resolve the Docker bridge gateway at runtime when no proxy address is supplied.
# OpenResty runs on the host and reaches this container through the published
# loopback port, so the backend observes the bridge gateway rather than 127.0.0.1.
set -eu

# ── 启动前：同步镜像内置图片资产到媒体卷，并清理媒体根目录残留的代码文件 ──
# 这段逻辑放在脚本文件里而不是 compose 的字符串 command：
# compose 会对 command 做变量插值与 shlex 处理，`$$d`、`\( \)` 这类转义在
# 「compose 插值 → 外层 /bin/sh -c → 内层 dash」的多层传递中容易被吃掉，
# 曾导致生产容器 `sh: 1: Syntax error: "(" unexpected` 启动失败、
# 以及 "$d" 被插值为空后把整个 uploads/（含源码模块）复制进公开媒体目录。
# 放进脚本文件后只受一层 shell 解析，且可用 `sh -n` 本地校验。
mkdir -p uploads_data
for d in products news 2026; do
  [ -d "uploads/$d" ] && cp -rn "uploads/$d" uploads_data/ || true
done
find uploads_data -maxdepth 1 -type f \
  \( -name '*.py' -o -name '*.pyc' -o -name '*.pyo' -o -name '*.pyd' -o -name '*.sh' \
     -o -name '*.env' -o -name '*.ini' -o -name '*.toml' -o -name '*.cfg' \
     -o -name '*.sql' -o -name '*.log' -o -name '*.md' \) -delete || true

if [ -z "${TRUSTED_PROXIES:-}" ]; then
  TRUSTED_PROXIES="$(python -c '
from pathlib import Path

for line in Path("/proc/net/route").read_text().splitlines()[1:]:
    fields = line.split()
    if len(fields) >= 3 and fields[1] == "00000000":
        gateway = int(fields[2], 16)
        print(".".join(str((gateway >> shift) & 0xFF) for shift in (0, 8, 16, 24)))
        break
')"
fi

# Fall back to loopback for direct local execution where no default route exists.
export TRUSTED_PROXIES="${TRUSTED_PROXIES:-127.0.0.1}"

exec uvicorn main:app --host 0.0.0.0 --port 8000 \
  --proxy-headers --forwarded-allow-ips="$TRUSTED_PROXIES" --workers 4
