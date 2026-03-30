#!/bin/bash
# Exit immediately if a command exits with a non-zero status
set -e 

echo "------------------------------------------------------"
echo "🚀 RUNNING WORKER TESTS"
echo "------------------------------------------------------"
# Using --ci and --code-coverage=true
npx nx run worker:test --ci --code-coverage=true --watch=false -- --max-workers=1

echo ""
echo "------------------------------------------------------"
echo "🚀 RUNNING CLIENT TESTS"
echo "------------------------------------------------------"
npx nx run client:test --ci --code-coverage=true --watch=false

echo ""
echo "✅ All test suites passed coverage requirements."