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
echo "Backend, website and admin smoke checks passed."
