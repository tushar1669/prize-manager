#!/usr/bin/env bash
set -o pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REGISTRY_DEFAULT="${NPM_CONFIG_REGISTRY:-https://registry.npmjs.org/}"
export NPM_CONFIG_REGISTRY="$REGISTRY_DEFAULT"
echo "Resolved npm registry: $NPM_CONFIG_REGISTRY"

printf '\n==> Installing dependencies with pnpm --frozen-lockfile...\n'
if command -v pnpm >/dev/null 2>&1; then
  if pnpm install --frozen-lockfile; then
    echo '✅ pnpm install completed successfully.'
    exit 0
  else
    status=$?
    echo "⚠️  pnpm install failed (exit ${status}). Checking for registry/network issues and falling back to npm ci..."
  fi
else
  echo '⚠️  pnpm is not installed. Falling back to npm ci...'
fi

if command -v npm >/dev/null 2>&1; then
  if npm ci; then
    echo '✅ npm ci completed successfully.'
    exit 0
  else
    status=$?
    cat <<'MSG'
❌ npm ci failed.
Please verify network access to the configured registry or your authentication token.
See the logs above for the specific error (common causes: 403 Forbidden or network timeouts).
MSG
    exit "$status"
  fi
else
  cat <<'MSG'
❌ Neither pnpm nor npm is available on PATH.
Install pnpm (preferred) or npm, then rerun scripts/bootstrap.sh.
MSG
  exit 1
fi
