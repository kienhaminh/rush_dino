#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

cargo build --release -p rushdino-desktop-native

echo "Built: target/release/rushdino-desktop-native"
