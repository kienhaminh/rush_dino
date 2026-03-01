#!/usr/bin/env bash
# RushDino vs OpenClaw Performance Benchmark
# Measures: binary/package size, boot time, idle memory, HTTP latency
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
RESULTS_DIR="${SCRIPT_DIR}/results"
REPORT="${RESULTS_DIR}/COMPARISON.md"

RUSHDINO_BINARY="${REPO_ROOT}/target/release/rushdino"
OPENCLAW_DIR="${REPO_ROOT}/openclaw"

# RushDino default port (from crates/common/src/config.rs)
RUSHDINO_PORT=28847
RUSHDINO_HEALTH="http://127.0.0.1:${RUSHDINO_PORT}/healthz"

BOOT_TIMEOUT_S=30   # max seconds to wait for server ready
LATENCY_SAMPLES=100 # number of curl requests for latency percentiles

# ---- helpers ----------------------------------------------------------------

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

info()  { echo -e "${GREEN}[bench]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn] ${NC} $*"; }
error() { echo -e "${RED}[error]${NC} $*" >&2; }

start_ms() { python3 -c "import time; print(int(time.time() * 1000))"; }

# cleanup: kill any background processes we started
RDINO_PID=""
cleanup() {
  if [[ -n "${RDINO_PID}" ]] && kill -0 "${RDINO_PID}" 2>/dev/null; then
    kill "${RDINO_PID}" 2>/dev/null || true
    wait "${RDINO_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# wait for HTTP endpoint, timeout after $BOOT_TIMEOUT_S seconds
wait_for_http() {
  local url="$1"
  local deadline
  deadline=$(( $(start_ms) + BOOT_TIMEOUT_S * 1000 ))
  while ! curl -sf "${url}" > /dev/null 2>&1; do
    if (( $(start_ms) > deadline )); then
      return 1
    fi
    sleep 0.05
  done
}

# compute p50/p95/p99 from N curl requests; prints "p50=Xms p95=Xms p99=Xms"
measure_latency() {
  local url="$1"
  local samples="$2"
  python3 - "${url}" "${samples}" <<'PYEOF'
import subprocess, sys
url, samples = sys.argv[1], int(sys.argv[2])
times = []
for _ in range(samples):
    r = subprocess.run(
        ["curl", "-o", "/dev/null", "-s", "-w", "%{time_total}", url],
        capture_output=True, text=True,
    )
    try:
        times.append(float(r.stdout.strip()) * 1000)
    except ValueError:
        pass
times.sort()
n = len(times)
if n == 0:
    print("p50=N/A p95=N/A p99=N/A")
else:
    p50 = times[n // 2]
    p95 = times[min(int(n * 0.95), n - 1)]
    p99 = times[min(int(n * 0.99), n - 1)]
    print(f"p50={p50:.1f}ms p95={p95:.1f}ms p99={p99:.1f}ms")
PYEOF
}

# ---- Section 0: prerequisites -----------------------------------------------

info "Checking prerequisites..."
missing=()
for cmd in cargo node python3 curl bc; do
  command -v "${cmd}" &>/dev/null || missing+=("${cmd}")
done
if (( ${#missing[@]} )); then
  error "Missing required tools: ${missing[*]}"
  exit 1
fi
info "All prerequisites satisfied."

mkdir -p "${RESULTS_DIR}"

# ---- Section A: Build -------------------------------------------------------

info "Building RushDino release binary..."
(cd "${REPO_ROOT}" && cargo build --release --quiet)
if [[ ! -f "${RUSHDINO_BINARY}" ]]; then
  error "Binary not found at ${RUSHDINO_BINARY} after build."
  exit 1
fi
info "Build complete."

# ---- Section B: Binary / package size ---------------------------------------

info "Measuring sizes..."

RUSHDINO_SIZE_BYTES=$(stat -f%z "${RUSHDINO_BINARY}" 2>/dev/null \
  || stat --format="%s" "${RUSHDINO_BINARY}" 2>/dev/null)
RUSHDINO_SIZE_MB=$(python3 -c "print(f'{${RUSHDINO_SIZE_BYTES}/1048576:.1f}')")
RUSHDINO_SIZE_HUMAN="${RUSHDINO_SIZE_MB} MB"

# OpenClaw runtime footprint: prefer node_modules, fall back to dist/, then source tree
OPENCLAW_NM_MB=""
OPENCLAW_DIST_MB=""
OPENCLAW_SRC_MB=""
if [[ -d "${OPENCLAW_DIR}/node_modules" ]]; then
  OPENCLAW_NODE_MODULES_KB=$(du -sk "${OPENCLAW_DIR}/node_modules" | awk '{print $1}')
  OPENCLAW_NM_MB=$(python3 -c "print(f'{${OPENCLAW_NODE_MODULES_KB}*1024/1048576:.1f}')")
  OPENCLAW_SIZE_HUMAN="${OPENCLAW_NM_MB} MB (node_modules)"
elif [[ -d "${OPENCLAW_DIR}/dist" ]]; then
  OPENCLAW_DIST_KB=$(du -sk "${OPENCLAW_DIR}/dist" | awk '{print $1}')
  OPENCLAW_DIST_MB=$(python3 -c "print(f'{${OPENCLAW_DIST_KB}*1024/1048576:.1f}')")
  OPENCLAW_SIZE_HUMAN="${OPENCLAW_DIST_MB} MB (dist, no node_modules)"
else
  OPENCLAW_SRC_KB=$(du -sk "${OPENCLAW_DIR}" | awk '{print $1}')
  OPENCLAW_SRC_MB=$(python3 -c "print(f'{${OPENCLAW_SRC_KB}*1024/1048576:.1f}')")
  OPENCLAW_SIZE_HUMAN="${OPENCLAW_SRC_MB} MB (full source tree)"
fi

info "RushDino binary: ${RUSHDINO_SIZE_HUMAN}"
info "OpenClaw footprint: ${OPENCLAW_SIZE_HUMAN}"

# ---- Section C: Boot time (RushDino only) -----------------------------------

info "Measuring RushDino boot time (port ${RUSHDINO_PORT})..."

RUSHDINO_BOOT=""
RUSHDINO_RSS_MB=""

if curl -sf "${RUSHDINO_HEALTH}" > /dev/null 2>&1; then
  warn "Port ${RUSHDINO_PORT} already in use; skipping boot measurement."
  RUSHDINO_BOOT="N/A (port busy)"
  RUSHDINO_RSS_MB="N/A"
  RDINO_PID=""
else
  T0=$(start_ms)
  "${RUSHDINO_BINARY}" start --foreground > /dev/null 2>&1 &
  RDINO_PID=$!

  if wait_for_http "${RUSHDINO_HEALTH}"; then
    T1=$(start_ms)
    RUSHDINO_BOOT="$(( T1 - T0 ))ms"
    info "RushDino boot time: ${RUSHDINO_BOOT}"

    # ---- Section D: Idle memory ---------------------------------------------
    RSS_KB=$(ps -o rss= -p "${RDINO_PID}" 2>/dev/null | tr -d ' ' || echo 0)
    RUSHDINO_RSS_MB=$(python3 -c "print(f'{${RSS_KB}/1024:.1f}')")
    info "RushDino idle RSS: ${RUSHDINO_RSS_MB} MB"
  else
    warn "RushDino did not become ready within ${BOOT_TIMEOUT_S}s."
    RUSHDINO_BOOT="timeout (>${BOOT_TIMEOUT_S}s)"
    RUSHDINO_RSS_MB="N/A"
  fi
fi

# OpenClaw is a CLI tool -- no simple HTTP gateway to start
OPENCLAW_BOOT="N/A (CLI tool)"
OPENCLAW_RSS_MB="N/A (CLI tool)"

# ---- Section E: HTTP latency (RushDino) -------------------------------------

RDINO_LATENCY=""
if curl -sf "${RUSHDINO_HEALTH}" > /dev/null 2>&1; then
  info "Measuring HTTP latency (${LATENCY_SAMPLES} requests to ${RUSHDINO_HEALTH})..."
  RDINO_LATENCY=$(measure_latency "${RUSHDINO_HEALTH}" "${LATENCY_SAMPLES}")
  info "RushDino latency: ${RDINO_LATENCY}"
else
  warn "RushDino health endpoint not reachable; skipping latency."
  RDINO_LATENCY="N/A"
fi

OPENCLAW_LATENCY="N/A (CLI tool)"

# ---- Section F: Shutdown RushDino -------------------------------------------

if [[ -n "${RDINO_PID}" ]] && kill -0 "${RDINO_PID}" 2>/dev/null; then
  info "Stopping RushDino (PID ${RDINO_PID})..."
  kill "${RDINO_PID}" 2>/dev/null || true
  wait "${RDINO_PID}" 2>/dev/null || true
  RDINO_PID=""
fi

# ---- Section G: Compute improvement ratios ----------------------------------

improvement_ratio() {
  local a="$1" b="$2"   # a = RushDino value (MB), b = OpenClaw value (MB)
  python3 - "${a}" "${b}" <<'PYEOF'
import sys
try:
    a, b = float(sys.argv[1]), float(sys.argv[2])
    if a <= 0 or b <= 0:
        print("--")
    else:
        print(f"{b/a:.1f}x")
except Exception:
    print("--")
PYEOF
}

# determine OpenClaw numeric size
OPENCLAW_SIZE_NUM=""
if [[ -n "${OPENCLAW_NM_MB}" ]]; then
  OPENCLAW_SIZE_NUM="${OPENCLAW_NM_MB}"
elif [[ -n "${OPENCLAW_DIST_MB}" ]]; then
  OPENCLAW_SIZE_NUM="${OPENCLAW_DIST_MB}"
else
  OPENCLAW_SIZE_NUM="${OPENCLAW_SRC_MB}"
fi

SIZE_RATIO=$(improvement_ratio "${RUSHDINO_SIZE_MB}" "${OPENCLAW_SIZE_NUM}")

# ---- Section H: Generate report ---------------------------------------------

RDINO_VERSION=$("${RUSHDINO_BINARY}" --version 2>/dev/null || echo "unknown")
NODE_VERSION=$(node --version 2>/dev/null || echo "unknown")
OS_INFO=$(uname -srm)
GENERATED_AT=$(date)

info "Writing report to ${REPORT}..."

cat > "${REPORT}" <<MDEOF
# RushDino vs OpenClaw -- Performance Comparison

Generated: ${GENERATED_AT}

> **Note:** OpenClaw is a full-featured CLI tool (TypeScript/Node.js) without a
> standalone HTTP server entry point, so boot time, idle memory, and HTTP
> latency comparisons are marked N/A. Binary size is compared against the
> node_modules footprint (the closest equivalent runtime dependency set).

## Summary

| Metric | RushDino (Rust) | OpenClaw (Node.js) | Ratio |
|---|---|---|---|
| Binary / package size | ${RUSHDINO_SIZE_HUMAN} | ${OPENCLAW_SIZE_HUMAN} | ${SIZE_RATIO} smaller |
| Boot time (first HTTP ready) | ${RUSHDINO_BOOT} | ${OPENCLAW_BOOT} | -- |
| Idle memory RSS | ${RUSHDINO_RSS_MB} MB | ${OPENCLAW_RSS_MB} | -- |
| HTTP latency (${LATENCY_SAMPLES} reqs) | ${RDINO_LATENCY} | ${OPENCLAW_LATENCY} | -- |

## Environment

| Property | Value |
|---|---|
| OS | ${OS_INFO} |
| RushDino version | ${RDINO_VERSION} |
| Node.js version | ${NODE_VERSION} |
| Health endpoint | \`${RUSHDINO_HEALTH}\` |
| Latency samples | ${LATENCY_SAMPLES} |
| Date | ${GENERATED_AT} |

## Raw Results

### RushDino

- Binary path: \`${RUSHDINO_BINARY}\`
- Binary size: **${RUSHDINO_SIZE_HUMAN}** (${RUSHDINO_SIZE_BYTES} bytes)
- Boot time: **${RUSHDINO_BOOT}**
- Idle RSS: **${RUSHDINO_RSS_MB} MB**
- HTTP latency: **${RDINO_LATENCY}**

### OpenClaw

- Source root: \`${OPENCLAW_DIR}\`
- Runtime footprint: **${OPENCLAW_SIZE_HUMAN}**
- Boot time: ${OPENCLAW_BOOT}
- Idle RSS: ${OPENCLAW_RSS_MB}
- HTTP latency: ${OPENCLAW_LATENCY}

## Methodology

- **Size**: \`stat\` on the release binary vs \`du\` on node_modules (or dist/).
- **Boot time**: wall-clock ms from process spawn until first successful
  \`curl\` to the health endpoint (\`/healthz\`), polled every 50 ms.
- **Idle RSS**: \`ps -o rss=\` immediately after the server becomes ready,
  before any conversations are processed.
- **HTTP latency**: ${LATENCY_SAMPLES} sequential \`curl\` requests with
  \`%{time_total}\`; sorted to derive p50/p95/p99.
MDEOF

info "Done. Report written to: ${REPORT}"
echo ""
echo "----------------------------------------------------------------"
echo "  Binary size : ${RUSHDINO_SIZE_HUMAN}  vs  ${OPENCLAW_SIZE_HUMAN}"
echo "  Boot time   : ${RUSHDINO_BOOT}"
echo "  Idle RSS    : ${RUSHDINO_RSS_MB} MB"
echo "  Latency     : ${RDINO_LATENCY}"
echo "----------------------------------------------------------------"
