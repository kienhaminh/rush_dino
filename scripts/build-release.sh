#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if command -v pnpm >/dev/null 2>&1; then
  package_manager=(pnpm)
elif command -v corepack >/dev/null 2>&1; then
  package_manager=(corepack pnpm)
else
  echo "pnpm or corepack is required to build the desktop UI." >&2
  exit 1
fi

"${package_manager[@]}" --dir crates/desktop-app/ui install --frozen-lockfile
"${package_manager[@]}" --dir crates/desktop-app/ui build

cargo build --release -p rushdino-cli

echo "Built: target/release/rushdino"
