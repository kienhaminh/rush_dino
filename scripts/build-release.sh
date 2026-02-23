#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

cd frontend
npm install
npm run build
cd ..

cargo build --release -p rushdino-cli

echo "Built: target/release/rushdino"
