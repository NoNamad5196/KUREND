#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export COREPACK_ENABLE_AUTO_PIN=0
export NODE_ENV=production
export NEXT_TELEMETRY_DISABLED=1
export DATABASE_URL="${DATABASE_URL:-file:./prisma/dev.db}"
# 무료 플랜의 로컬 디스크는 재배포·인스턴스 교체 때 보존을 보장하지 않는다. 원격 libSQL 설정을 우선한다.
if [ -n "${TURSO_DATABASE_URL:-}" ]; then
  export DATABASE_URL="$TURSO_DATABASE_URL"
fi

node scripts/render-db.mjs
exec corepack pnpm@10.30.3 start --hostname 0.0.0.0 --port "${PORT:-10000}"
