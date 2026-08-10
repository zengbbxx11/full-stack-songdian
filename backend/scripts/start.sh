#!/bin/sh
# Resolve the Docker bridge gateway at runtime when no proxy address is supplied.
# OpenResty runs on the host and reaches this container through the published
# loopback port, so the backend observes the bridge gateway rather than 127.0.0.1.
set -eu

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
