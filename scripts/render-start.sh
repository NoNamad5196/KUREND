#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export COREPACK_ENABLE_AUTO_PIN=0
export NODE_ENV=production
export NEXT_TELEMETRY_DISABLED=1
export DATABASE_URL="${DATABASE_URL:-file:./prisma/dev.db}"

node scripts/render-db.mjs
exec corepack pnpm@10.30.3 start --hostname 0.0.0.0 --port "${PORT:-10000}"
