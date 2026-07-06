#!/bin/bash
# Exit immediately if a command exits with a non-zero status
set -e 

echo ""
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
# Using --ci and --code-coverage=true
npx nx run worker:test --ci --code-coverage=true --watch=false -- --max-workers=1

echo "------------------------------------------------------"
echo "🚀 RUNNING END-TO-END TESTS (PLAYWRIGHT)"
echo "------------------------------------------------------"

npx nx e2e client-e2e

echo ""
echo "✅ All test suites passed requirements."