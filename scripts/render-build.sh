#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export COREPACK_ENABLE_AUTO_PIN=0
export NEXT_TELEMETRY_DISABLED=1

# Build and first-start seeding both need the declared dev dependencies.
corepack pnpm@10.30.3 install --frozen-lockfile --prod=false
export NODE_PATH="$PWD/node_modules/.pnpm/node_modules${NODE_PATH:+:$NODE_PATH}"
corepack pnpm@10.30.3 build
