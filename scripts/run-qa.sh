#!/usr/bin/env bash
set -euo pipefail

echo "📦 Package Manager: npm"
echo

echo "🏗️ Step 1/4: Build"
npm run build
echo

echo "📥 Step 2/4: Swiss-Manager import tests"
npm run test:swiss
echo

echo "🔒 Step 3/4: Allocator null-safety tests"
npm run test:alloc
echo

echo "✨ Step 4/4: UX improvements tests"
npm run test:ux
echo
echo "✅ QA suite complete"
