#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export COREPACK_ENABLE_AUTO_PIN=0
export NODE_ENV=production
export NEXT_TELEMETRY_DISABLED=1
export DATABASE_URL="${DATABASE_URL:-file:./prisma/dev.db}"
# 무료 플랜의 디스크는 재시작·재배포 때 지워진다. 원격 libSQL(Turso)을 대시보드에 넣으면 그걸 쓴다.
if [ -n "${TURSO_DATABASE_URL:-}" ]; then
  export DATABASE_URL="$TURSO_DATABASE_URL"
fi

node scripts/render-db.mjs
exec corepack pnpm@10.30.3 start --hostname 0.0.0.0 --port "${PORT:-10000}"
