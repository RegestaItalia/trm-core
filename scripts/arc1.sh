#!/usr/bin/env bash
set -euo pipefail

# Resolve project root relative to this script.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load project-local environment variables.
set -a
source "$PROJECT_ROOT/.env"
set +a

exec npx -y arc-1@latest