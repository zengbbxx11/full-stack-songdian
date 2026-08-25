#!/usr/bin/env bash
set -Eeuo pipefail

retry_url() {
  local url="$1"
  local attempts="${2:-30}"
  for ((i=1; i<=attempts; i++)); do
    if curl --fail --silent --show-error --max-time 10 "$url" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  echo "Health check failed: $url" >&2
  return 1
}

retry_url "${BACKEND_READY_URL:-http://127.0.0.1:8000/readyz}"
retry_url "${FRONTEND_HEALTH_URL:-http://127.0.0.1:3000/}"
retry_url "${ADMIN_HEALTH_URL:-http://127.0.0.1:3001/signin}"

SEARCH_URL="${SEARCH_SMOKE_URL:-http://127.0.0.1:8000/api/v1/search?q=camera&type=all&page_size=50}"
SEARCH_JSON="$(curl --fail --silent --show-error --max-time 15 "$SEARCH_URL")"
export SEARCH_JSON
PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1 && [[ ! -x "$PYTHON_BIN" ]]; then
  echo "Search smoke failed: Python interpreter not found: $PYTHON_BIN" >&2
  exit 1
fi
"$PYTHON_BIN" - <<'PY'
import json
import os
from datetime import datetime

payload = json.loads(os.environ["SEARCH_JSON"])
if str(payload.get("code")) != "0":
    raise SystemExit(f"Search smoke failed: API code={payload.get('code')!r}")

data = payload.get("data") or {}
items = data.get("items") or []
kinds = [item.get("kind") for item in items]
if "news" in kinds and "product" in kinds[kinds.index("news"):]:
    raise SystemExit("Search smoke failed: a product appears after the news group")

news_dates = [
    datetime.fromisoformat(item["created_time"].replace("Z", "+00:00"))
    for item in items
    if item.get("kind") == "news" and item.get("created_time")
]
if any(previous < current for previous, current in zip(news_dates, news_dates[1:])):
    raise SystemExit("Search smoke failed: news is not newest-first")

note = str(data.get("note") or "")
if any("\u4e00" <= char <= "\u9fff" for char in note):
    raise SystemExit("Search smoke failed: degraded note is not English-only")
PY

echo "Backend, website, admin and search smoke checks passed."
