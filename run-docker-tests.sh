#!/bin/bash
# Exit immediately if a command exits with a non-zero status
set -e 

echo "🐳 Building the Docker test image..."
docker build -t signing-room-tests -f Dockerfile.test .

echo "🚀 Running the test suite inside the isolated container..."
docker run --rm signing-room-tests

echo "✅ Docker test run completed."