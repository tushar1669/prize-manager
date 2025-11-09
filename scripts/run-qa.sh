#!/usr/bin/env bash
set -euo pipefail

echo "📦 Package Manager: npm"
echo

echo "🔍 Step 1/5: CSV guard"
npm run assert:no-csv
echo

echo "🏗️ Step 2/5: Build"
npm run build
echo

echo "📥 Step 3/5: Swiss-Manager import tests"
npm run test:swiss
echo

echo "🔒 Step 4/5: Allocator null-safety tests"
npm run test:alloc
echo

echo "✨ Step 5/5: UX improvements tests"
npm run test:ux
echo
echo "✅ QA suite complete"
