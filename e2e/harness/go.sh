#!/bin/bash
# Launches one action spec in the background.
# Usage: e2e/harness/go.sh <spec name in <work>/inputs | path to a spec .json>
# Output: <work>/logs/<spec name>.out (stdout), plus the per-run files written by run.ts.
set -e
HARNESS="$(cd "$(dirname "$0")" && pwd)"
CORE="$(cd "$HARNESS/../.." && pwd)"
WORK="${E2E_WORK:-$CORE/e2e/work}"
SPEC="$1"
[ -f "$SPEC" ] || SPEC="$WORK/inputs/$1.json"
[ -f "$SPEC" ] || { echo "spec not found: $1" >&2; exit 1; }
NAME="$(basename "$SPEC" .json)"
mkdir -p "$WORK/ipc" "$WORK/logs"
rm -f "$WORK"/ipc/*
export NODE_PATH="$CORE/node_modules"
export TS_NODE_PROJECT="$CORE/tsconfig.json"
export TS_NODE_TRANSPILE_ONLY=true
export E2E_WORK="$WORK"
cd "$CORE"
nohup "$CORE/node_modules/.bin/ts-node" "$HARNESS/run.ts" "$SPEC" > "$WORK/logs/$NAME.out" 2>&1 &
echo $! > "$WORK/ipc/pid"
echo "started pid $! ($NAME)"
