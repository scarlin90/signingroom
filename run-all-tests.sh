#!/bin/bash
set -e

# -------------------------------------------------
# Mode 1: Only E2E (used by the matrix jobs)
# -------------------------------------------------
if [ -n "$E2E_SPECS" ]; then
  echo "------------------------------------------------------"
  echo "🚀 RUNNING END-TO-END TESTS ONLY"
  echo "Specs: $E2E_SPECS"
  echo "------------------------------------------------------"
  npx nx e2e client-e2e -- --project=chromium $E2E_SPECS
  echo ""
  echo "✅ E2E specs passed."
  exit 0
fi

# -------------------------------------------------
# Mode 2: Only Unit + Integration tests
# (used by the run-unit-tests job)
# -------------------------------------------------
if [ "$UNIT_ONLY" = "true" ]; then
  echo "------------------------------------------------------"
  echo "🚀 RUNNING CLIENT TESTS"
  echo "------------------------------------------------------"
  npx nx run client:test --ci --code-coverage=true --watch=false

  echo ""
  echo "------------------------------------------------------"
  echo "🚀 RUNNING SDK TESTS"
  echo "------------------------------------------------------"
  npx nx run sdk:test --ci --code-coverage=true --watch=false

  echo "------------------------------------------------------"
  echo "🚀 RUNNING WORKER TESTS"
  echo "------------------------------------------------------"
  npx nx run worker:test --ci --code-coverage=true --watch=false -- --max-workers=1

  echo ""
  echo "✅ Unit + Integration tests passed."
  exit 0
fi

# -------------------------------------------------
# Fallback: full run (only for local convenience)
# -------------------------------------------------
echo "------------------------------------------------------"
echo "🚀 RUNNING FULL TEST SUITE (local mode)"
echo "------------------------------------------------------"

npx nx run client:test --ci --code-coverage=true --watch=false
npx nx run sdk:test --ci --code-coverage=true --watch=false
npx nx run worker:test --ci --code-coverage=true --watch=false -- --max-workers=1
npx nx e2e client-e2e -- --project=chromium src/specs

echo ""
echo "✅ All test suites passed."