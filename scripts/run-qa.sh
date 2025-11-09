#!/bin/bash
set -e

echo "🔍 Prize-Manager QA Suite"
echo "========================="
echo ""

# Use pnpm if available, fallback to npm
if command -v pnpm &> /dev/null; then
  PKG_MGR="pnpm"
else
  PKG_MGR="npm"
fi

echo "📦 Package Manager: $PKG_MGR"
echo ""

# Step 1: Guardrail check
echo "🛡️  Step 1/5: Verifying Excel-only guardrail..."
$PKG_MGR run assert:no-csv
echo "✅ Guardrail check passed"
echo ""

# Step 2: Build
echo "🏗️  Step 2/5: Building project..."
$PKG_MGR run build
echo "✅ Build complete"
echo ""

# Step 3: Import tests
echo "📥 Step 3/5: Running Swiss-Manager import tests..."
$PKG_MGR test tests/import-swiss-manager.spec.ts || {
  echo "❌ Import tests failed"
  exit 1
}
echo "✅ Import tests complete"
echo ""

# Step 4: Allocator null-safety tests
echo "🔒 Step 4/5: Running allocator null-safety tests..."
$PKG_MGR test tests/allocator-null-safety.spec.ts || {
  echo "❌ Allocator tests failed"
  exit 1
}
echo "✅ Allocator tests complete"
echo ""

# Step 5: Generate report reminder
echo "📊 Step 5/5: SQL verification"
echo "Please run the SQL queries in QA_REPORT.md manually in Supabase SQL Editor"
echo ""

echo "✅ QA Suite Complete!"
echo "See QA_REPORT.md for detailed results"
