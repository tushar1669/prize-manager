#!/usr/bin/env bash
set -u

echo "🔧 Bootstrap starting..."
REG="${NPM_CONFIG_REGISTRY:-https://registry.npmjs.org/}"
echo "📦 Using npm registry: $REG"
export NPM_CONFIG_REGISTRY="$REG"

echo "📥 Installing dependencies with npm ci..."
npm ci
rc=$?
if [ $rc -ne 0 ]; then
  echo "❌ npm ci failed (rc=$rc)."
  echo "   Common causes:"
  echo "   - HTTP 403/ENOTFOUND to registry ($REG)"
  echo "   - Corporate proxy/mirror not configured"
  echo "   Try: export NPM_CONFIG_REGISTRY=<your mirror> then re-run:"
  echo "        NPM_CONFIG_REGISTRY='<mirror>' bash scripts/bootstrap.sh"
  exit 1
fi

echo "✅ Bootstrap complete."
