#!/bin/bash
# Runs e2e/harness/tool.ts with the harness environment. Usage: e2e/harness/tool.sh <command> [args]
HARNESS="$(cd "$(dirname "$0")" && pwd)"
CORE="$(cd "$HARNESS/../.." && pwd)"
export NODE_PATH="$CORE/node_modules"
export TS_NODE_PROJECT="$CORE/tsconfig.json"
export TS_NODE_TRANSPILE_ONLY=true
cd "$CORE"
exec "$CORE/node_modules/.bin/ts-node" "$HARNESS/tool.ts" "$@"
