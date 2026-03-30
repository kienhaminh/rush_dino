#!/usr/bin/env bash
# RushDino Performance Benchmark — competitor comparison
# Measures: binary/package size, boot time, idle memory, peak memory, HTTP latency
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
RSS_SAMPLE_INTERVAL=0.2  # seconds between RSS samples during load test

# ---- Competitor reference data (published benchmarks / public docs) ----------
# Values are not measured locally — sourced from each project's documentation.

REF_OPENCLAW_LANG="TypeScript";  REF_OPENCLAW_SIZE="28 MB + Node.js"; REF_OPENCLAW_DOCKER="—"; REF_OPENCLAW_RAM="> 1 GB";  REF_OPENCLAW_STARTUP="> 5 s";   REF_OPENCLAW_HW="\$599+ Mac Mini"
REF_ZEROCLAW_LANG="Rust";        REF_ZEROCLAW_SIZE="3.4 MB";          REF_ZEROCLAW_DOCKER="—"; REF_ZEROCLAW_RAM="< 5 MB";  REF_ZEROCLAW_STARTUP="< 10 ms"; REF_ZEROCLAW_HW="\$10 edge"
REF_PICOCLAW_LANG="Go";          REF_PICOCLAW_SIZE="~8 MB";           REF_PICOCLAW_DOCKER="—"; REF_PICOCLAW_RAM="< 10 MB"; REF_PICOCLAW_STARTUP="< 1 s";   REF_PICOCLAW_HW="\$10 edge"
REF_GOCLAW_LANG="Go";            REF_GOCLAW_SIZE="~25 MB (base)";     REF_GOCLAW_DOCKER="~50 MB (Alpine)"; REF_GOCLAW_RAM="~35 MB"; REF_GOCLAW_STARTUP="< 1 s"; REF_GOCLAW_HW="\$5 VPS+"

# ---- helpers ----------------------------------------------------------------

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

info()  { echo -e "${GREEN}[bench]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn] ${NC} $*"; }
error() { echo -e "${RED}[error]${NC} $*" >&2; }

cleanup_bench_sessions() {
  local sessions_url="$1"
  python3 - "$sessions_url" <<'PY'
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

sessions_url = sys.argv[1]

try:
    with urllib.request.urlopen(sessions_url, timeout=5) as response:
        data = json.load(response)
except Exception as exc:
    print(f"[warn] benchmark cleanup skipped: could not list sessions ({exc})", file=sys.stderr)
    raise SystemExit(0)

victims = [
    item["id"]
    for item in data.get("items", [])
    if isinstance(item, dict)
    and isinstance(item.get("title"), str)
    and item["title"].startswith("bench ")
]

deleted = 0
for session_id in victims:
    request = urllib.request.Request(
        f"{sessions_url}/{urllib.parse.quote(session_id, safe='')}",
        method="DELETE",
    )
    try:
        with urllib.request.urlopen(request, timeout=5):
            deleted += 1
    except urllib.error.HTTPError as exc:
        print(
            f"[warn] benchmark cleanup skipped session {session_id}: HTTP {exc.code}",
            file=sys.stderr,
        )
    except Exception as exc:
        print(
            f"[warn] benchmark cleanup skipped session {session_id}: {exc}",
            file=sys.stderr,
        )

print(f"[bench] cleaned up {deleted} benchmark session(s)", file=sys.stderr)
PY
}

start_ms() {
  if date +%s%N | grep -v N > /dev/null 2>&1; then
    # GNU date (nanoseconds)
    echo "$(( $(date +%s%N) / 1000000 ))"
  else
    # BSD date fallback (macOS without coreutils)
    python3 -c "import time; print(int(time.time() * 1000))"
  fi
}

# Detect OS for memory unit handling (Linux: rss/vsz in KB; macOS: rss in KB, vsz in bytes)
PS_VSZ_BYTES=false
case "$(uname -s)" in
  Darwin) PS_VSZ_BYTES=true ;;
esac

# Reads RSS (resident set size) in KB for a given PID. Returns 0 on failure.
# Linux and macOS both report RSS in KB. Keep trailing newline so sample files get one value per line.
rss_kb() {
  local pid="$1"
  local v
  v=$(ps -o rss= -p "${pid}" 2>/dev/null | tr -d ' \r')
  echo "${v:-0}"
}

# Reads VSZ (virtual memory size). Returns raw value; unit is KB on Linux, bytes on macOS.
vsz_raw() {
  local pid="$1"
  ps -o vsz= -p "${pid}" 2>/dev/null | tr -d ' \r' || echo 0
}

kb_to_mb() {
  python3 -c "print(f'{int(\"$1\")/1024:.1f}')"
}

bytes_to_mb() {
  python3 -c "print(f'{int(\"$1\")/1048576:.1f}')"
}

# cleanup: kill any background processes we started
RDINO_PID=""
RSS_SAMPLER_PID=""
cleanup() {
  if [[ -n "${RSS_SAMPLER_PID}" ]] && kill -0 "${RSS_SAMPLER_PID}" 2>/dev/null; then
    kill "${RSS_SAMPLER_PID}" 2>/dev/null || true
  fi
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
  while ! curl -4 --connect-timeout 0.1 -sf "${url}" > /dev/null 2>&1; do
    if (( $(start_ms) > deadline )); then
      return 1
    fi
    sleep 0.01
  done
}

# Background RSS sampler: writes one RSS_KB value per line to a temp file.
# Usage: start_rss_sampler <pid> <output_file> <interval_s>
start_rss_sampler() {
  local pid="$1" out="$2" interval="$3"
  (
    while kill -0 "${pid}" 2>/dev/null; do
      rss_kb "${pid}" >> "${out}" 2>/dev/null || true
      sleep "${interval}"
    done
  ) &
  RSS_SAMPLER_PID=$!
}

stop_rss_sampler() {
  if [[ -n "${RSS_SAMPLER_PID}" ]] && kill -0 "${RSS_SAMPLER_PID}" 2>/dev/null; then
    kill "${RSS_SAMPLER_PID}" 2>/dev/null || true
    wait "${RSS_SAMPLER_PID}" 2>/dev/null || true
    RSS_SAMPLER_PID=""
  fi
}

# Compute peak RSS from a sample file (one KB value per line).
# Only consider numeric lines; cap at 10M KB (~10 GB) to ignore macOS ps quirks.
peak_rss_from_file() {
  local file="$1"
  if [[ ! -s "${file}" ]]; then echo 0; return; fi
  awk '$1 ~ /^[0-9]+$/ && $1 <= 10000000 { print $1 }' "${file}" | sort -n | tail -1 || echo 0
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
        ["curl", "-4", "-o", "/dev/null", "-s", "-w", "%{time_total}", url],
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

# Temp file for RSS samples during load test
RSS_SAMPLE_FILE="$(mktemp /tmp/rushdino_rss_XXXXXX)"
trap 'rm -f "${RSS_SAMPLE_FILE}"' EXIT

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

# OpenClaw runtime footprint (optional)
# Repo có thể không include `openclaw/` nên benchmark phải bỏ qua phần này.
OPENCLAW_NM_MB=""
OPENCLAW_DIST_MB=""
OPENCLAW_SRC_MB=""
OPENCLAW_SIZE_HUMAN="N/A (openclaw not present)"

if [[ -d "${OPENCLAW_DIR}" ]]; then
  if [[ -d "${OPENCLAW_DIR}/node_modules" ]]; then
    OPENCLAW_NODE_MODULES_KB=$(du -sk "${OPENCLAW_DIR}/node_modules" | awk '{print $1}')
    OPENCLAW_NM_MB=$(python3 -c "print(f'{${OPENCLAW_NODE_MODULES_KB}*1024/1048576:.1f}')")
    OPENCLAW_SIZE_HUMAN="${OPENCLAW_NM_MB} MB (node_modules)"
  elif [[ -d "${OPENCLAW_DIR}/dist" ]]; then
    OPENCLAW_DIST_KB=$(du -sk "${OPENCLAW_DIR}/dist" | awk '{print $1}')
    OPENCLAW_DIST_MB=$(python3 -c "print(f'{${OPENCLAW_DIST_KB}*1024/1048576:.1f}')")
    OPENCLAW_SIZE_HUMAN="${OPENCLAW_DIST_MB} MB (dist, no node_modules)"
  else
    OPENCLAW_SRC_KB=$(du -sk "${OPENCLAW_DIR}" 2>/dev/null | awk '{print $1}')
    OPENCLAW_SRC_MB=$(python3 -c "print(f'{${OPENCLAW_SRC_KB}*1024/1048576:.1f}')")
    OPENCLAW_SIZE_HUMAN="${OPENCLAW_SRC_MB} MB (full source tree)"
  fi
fi

info "RushDino binary: ${RUSHDINO_SIZE_HUMAN}"
info "OpenClaw footprint: ${OPENCLAW_SIZE_HUMAN}"

# ---- Section C: Boot time (RushDino only) -----------------------------------

info "Measuring RushDino boot time (port ${RUSHDINO_PORT})..."

RUSHDINO_BOOT=""
RUSHDINO_IDLE_RSS_MB=""
RUSHDINO_IDLE_VSZ_MB=""
RUSHDINO_PEAK_RSS_MB=""
RUSHDINO_PHYS_FOOTPRINT="N/A (macOS footprint tool not available)"

if curl -4 -sf "${RUSHDINO_HEALTH}" > /dev/null 2>&1; then
  warn "Port ${RUSHDINO_PORT} already in use; skipping boot time measurement."
  RUSHDINO_BOOT="N/A (port busy)"
  RDINO_PID=""

  # Resolve the listening PID so we can still collect memory metrics
  # lsof may show multiple PIDs; pick the one that is LISTEN (not just connected)
  MEM_PID=$(lsof -i ":${RUSHDINO_PORT}" 2>/dev/null \
    | awk '/LISTEN/{print $2; exit}')
  if [[ -z "${MEM_PID}" ]]; then
    MEM_PID=$(lsof -i ":${RUSHDINO_PORT}" -t 2>/dev/null | head -1)
  fi

  if [[ -n "${MEM_PID}" ]]; then
    IDLE_RSS_KB=$(rss_kb "${MEM_PID}")
    IDLE_VSZ_RAW=$(vsz_raw "${MEM_PID}")
    RUSHDINO_IDLE_RSS_MB=$(kb_to_mb "${IDLE_RSS_KB}")
    if [[ "${PS_VSZ_BYTES}" == true ]]; then
      RUSHDINO_IDLE_VSZ_MB=$(bytes_to_mb "${IDLE_VSZ_RAW}")
    else
      RUSHDINO_IDLE_VSZ_MB=$(kb_to_mb "${IDLE_VSZ_RAW}")
    fi
    info "Pre-running server memory — PID ${MEM_PID}: RSS ${RUSHDINO_IDLE_RSS_MB} MB  VSZ ${RUSHDINO_IDLE_VSZ_MB} MB"
    if command -v footprint &>/dev/null; then
      RUSHDINO_PHYS_FOOTPRINT=$(footprint -p "${MEM_PID}" 2>/dev/null \
        | awk '/phys_footprint:/{gsub("phys_footprint:",""); print $1}')
      [[ -n "${RUSHDINO_PHYS_FOOTPRINT}" ]] && \
        info "Physical footprint (dirty pages): ${RUSHDINO_PHYS_FOOTPRINT}"
    fi
  else
    RUSHDINO_IDLE_RSS_MB="N/A"
    RUSHDINO_IDLE_VSZ_MB="N/A"
    warn "Could not resolve PID for port ${RUSHDINO_PORT}; memory metrics unavailable."
  fi
  RUSHDINO_PEAK_RSS_MB="(measured during latency test)"
else
  # Warm the OS page cache with a throwaway start so the timed measurement
  # reflects real-world restart latency, not post-compilation cold-load overhead.
  info "Warming OS page cache (throwaway start)..."
  "${RUSHDINO_BINARY}" start --foreground > /dev/null 2>&1 &
  _WARM_PID=$!
  if wait_for_http "${RUSHDINO_HEALTH}"; then
    kill "${_WARM_PID}" 2>/dev/null; wait "${_WARM_PID}" 2>/dev/null
  else
    kill "${_WARM_PID}" 2>/dev/null; wait "${_WARM_PID}" 2>/dev/null
  fi
  sleep 0.3

  T0=$(start_ms)
  "${RUSHDINO_BINARY}" start --foreground > /dev/null 2>&1 &
  RDINO_PID=$!

  if wait_for_http "${RUSHDINO_HEALTH}"; then
    T1=$(start_ms)
    RUSHDINO_BOOT="$(( T1 - T0 ))ms"
    info "RushDino boot time: ${RUSHDINO_BOOT}"

    # Resolve the PID that holds the port (more reliable than $! when process tree differs)
    MEM_PID=$(lsof -i ":${RUSHDINO_PORT}" -t 2>/dev/null | head -1)
    [[ -z "${MEM_PID}" ]] && MEM_PID="${RDINO_PID}"

    # ---- Section D: Idle memory (snapshot right after boot) -----------------
    IDLE_RSS_KB=$(rss_kb "${MEM_PID}")
    IDLE_VSZ_RAW=$(vsz_raw "${MEM_PID}")
    RUSHDINO_IDLE_RSS_MB=$(kb_to_mb "${IDLE_RSS_KB}")
    if [[ "${PS_VSZ_BYTES}" == true ]]; then
      RUSHDINO_IDLE_VSZ_MB=$(bytes_to_mb "${IDLE_VSZ_RAW}")
    else
      RUSHDINO_IDLE_VSZ_MB=$(kb_to_mb "${IDLE_VSZ_RAW}")
    fi
    info "RushDino idle RSS: ${RUSHDINO_IDLE_RSS_MB} MB  |  VSZ: ${RUSHDINO_IDLE_VSZ_MB} MB"

    # macOS physical footprint (dirty pages only — truest RAM measure)
    if command -v footprint &>/dev/null; then
      RUSHDINO_PHYS_FOOTPRINT=$(footprint -p "${MEM_PID}" 2>/dev/null \
        | awk '/phys_footprint:/{gsub("phys_footprint:",""); print $1}')
      [[ -n "${RUSHDINO_PHYS_FOOTPRINT}" ]] && \
        info "RushDino physical footprint (dirty pages): ${RUSHDINO_PHYS_FOOTPRINT}"
    fi
  else
    warn "RushDino did not become ready within ${BOOT_TIMEOUT_S}s."
    RUSHDINO_BOOT="timeout (>${BOOT_TIMEOUT_S}s)"
    RUSHDINO_IDLE_RSS_MB="N/A"
    RUSHDINO_IDLE_VSZ_MB="N/A"
    RUSHDINO_PEAK_RSS_MB="N/A"
  fi
fi

# OpenClaw is a CLI tool — no HTTP server to start
OPENCLAW_BOOT="N/A (CLI tool)"
OPENCLAW_RSS="N/A (CLI tool)"

# ---- Section E: HTTP latency + peak RSS (RushDino) --------------------------

RDINO_LATENCY=""
# MEM_PID is set whether we started the server or found a pre-running one
if curl -4 -sf "${RUSHDINO_HEALTH}" > /dev/null 2>&1; then
  info "Measuring HTTP latency (${LATENCY_SAMPLES} requests to ${RUSHDINO_HEALTH})..."

  # Resolve MEM_PID if not already set (should be set by Section C in all paths)
  if [[ -z "${MEM_PID:-}" ]]; then
    MEM_PID=$(lsof -i ":${RUSHDINO_PORT}" 2>/dev/null | awk '/LISTEN/{print $2; exit}')
    [[ -z "${MEM_PID}" ]] && MEM_PID=$(lsof -i ":${RUSHDINO_PORT}" -t 2>/dev/null | head -1)
  fi

  if [[ -n "${MEM_PID:-}" ]]; then
    > "${RSS_SAMPLE_FILE}"
    start_rss_sampler "${MEM_PID}" "${RSS_SAMPLE_FILE}" "${RSS_SAMPLE_INTERVAL}"
    RDINO_LATENCY=$(measure_latency "${RUSHDINO_HEALTH}" "${LATENCY_SAMPLES}")
    stop_rss_sampler
    PEAK_RSS_KB=$(peak_rss_from_file "${RSS_SAMPLE_FILE}")
    RUSHDINO_PEAK_RSS_MB=$(kb_to_mb "${PEAK_RSS_KB}")
    info "RushDino latency: ${RDINO_LATENCY}"
    info "RushDino peak RSS (under load): ${RUSHDINO_PEAK_RSS_MB} MB"
  else
    RDINO_LATENCY=$(measure_latency "${RUSHDINO_HEALTH}" "${LATENCY_SAMPLES}")
    RUSHDINO_PEAK_RSS_MB="N/A (PID unavailable)"
    info "RushDino latency: ${RDINO_LATENCY} (no PID for RSS sampling)"
  fi
else
  warn "RushDino health endpoint not reachable; skipping latency."
  RDINO_LATENCY="N/A"
  RUSHDINO_PEAK_RSS_MB="N/A"
fi

OPENCLAW_LATENCY="N/A (CLI tool)"

# ---- Section I: Parallel concurrency benchmark ------------------------------
#
# Two sub-tests, both require the server to be reachable:
#   I-a  Concurrent GET /healthz  — pure Rust async HTTP baseline.
#         Shows how the server handles N simultaneous clients.
#         Each concurrency level fires (N × 20) total requests.
#
#   I-b  Concurrent POST /api/runs — parallel agent run dispatch.
#         Each POST returns immediately with a run_id; the agent processes the
#         run asynchronously.  This shows parallel sub-agent creation rate.
#         Each level fires (N × 5) submissions (lighter than healthz).
#         Skipped gracefully when the endpoint requires authentication.

# Helper: run N concurrent HTTP requests via Python; prints "tp avg ok total status"
bench_concurrency() {
  local url="$1" method="$2" body="$3" concurrency="$4" n_requests="$5"
  python3 - "${url}" "${method}" "${body}" "${concurrency}" "${n_requests}" <<'PYEOF'
import concurrent.futures, urllib.request, urllib.error, time, sys

url, method, body_s, c, n = (
    sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5])
)
body_b = body_s.encode() if body_s else None

def hit(_):
    req = urllib.request.Request(
        url, data=body_b,
        headers={"Content-Type": "application/json"} if body_b else {},
        method=method,
    )
    t = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            r.read()
            return (time.perf_counter() - t) * 1000, True, r.status
    except urllib.error.HTTPError as e:
        return (time.perf_counter() - t) * 1000, e.code < 500, e.code
    except Exception:
        return (time.perf_counter() - t) * 1000, False, 0

t0 = time.perf_counter()
with concurrent.futures.ThreadPoolExecutor(max_workers=c) as ex:
    rows = [f.result() for f in concurrent.futures.as_completed(
        ex.submit(hit, i) for i in range(n)
    )]
elapsed = time.perf_counter() - t0
ok    = sum(1 for _, ok, _ in rows if ok)
tp    = ok / elapsed if elapsed > 0 else 0
avg   = sum(t for t, _, _ in rows) / len(rows) if rows else 0
first = rows[0][2] if rows else 0
print(f"{tp:.1f} {avg:.0f} {ok} {n} {first}")
PYEOF
}

# scaling_ratio <numerator> <denominator>
scaling_ratio() {
  python3 -c "
a, b = float('$1'), float('$2')
print('1.00x' if b == 0 else f'{a/b:.2f}x')
" 2>/dev/null || echo "--"
}

RUSHDINO_API_RUNS="http://127.0.0.1:${RUSHDINO_PORT}/api/runs"
RUSHDINO_API_SESSIONS="http://127.0.0.1:${RUSHDINO_PORT}/api/sessions"

PARALLEL_HEALTHZ_BENCH=""
PARALLEL_RUNS_BENCH=""
PARALLEL_RUNS_NOTE=""
HEALTHZ_1X_TP=""
RUNS_1X_TP=""

if curl -4 -sf "${RUSHDINO_HEALTH}" > /dev/null 2>&1; then

  # ── I-a: concurrent /healthz ──────────────────────────────────────────────
  info "Running parallel /healthz concurrency benchmark (1–32 clients)..."
  for c in 1 2 4 8 16 32; do
    n=$(( c * 20 ))
    read -r tp avg ok total _status \
      <<< "$(bench_concurrency "${RUSHDINO_HEALTH}" "GET" "" "${c}" "${n}")"
    if [[ -z "${HEALTHZ_1X_TP}" ]]; then
      HEALTHZ_1X_TP="${tp}"
      scaling="1.00×"
    else
      scaling="$(scaling_ratio "${tp}" "${HEALTHZ_1X_TP}")×"
      scaling="${scaling//×× /×}"   # tidy double-× if python already appended one
      scaling=$(python3 -c "print(f'{float(\"${tp}\")/float(\"${HEALTHZ_1X_TP}\"):.2f}×')" 2>/dev/null || echo "--")
    fi
    PARALLEL_HEALTHZ_BENCH="${PARALLEL_HEALTHZ_BENCH}| ${c}× | ${tp} req/s | ${avg}ms | ${scaling} |
"
    info "healthz  c=${c}  tp=${tp} req/s  avg=${avg}ms  ok=${ok}/${total}"
  done

  # ── I-b: concurrent POST /api/runs ────────────────────────────────────────
  info "Probing POST /api/runs accessibility..."
  _probe_body='{"message":"bench probe","session_id":"bench-probe-00"}'
  _probe_status=$(python3 -c "
import urllib.request, urllib.error
try:
    req = urllib.request.Request(
        '${RUSHDINO_API_RUNS}',
        data=b'${_probe_body}',
        headers={'Content-Type':'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=5) as r: print(r.status)
except urllib.error.HTTPError as e: print(e.code)
except Exception: print(0)
" 2>/dev/null || echo "0")

  if [[ "${_probe_status}" == "200" || "${_probe_status}" == "201" ]]; then
    info "POST /api/runs accessible (HTTP ${_probe_status}) — running parallel run-submission benchmark..."
    for c in 1 2 4 8 16 32; do
      n=$(( c * 5 ))
      _body="{\"message\":\"bench ping\",\"session_id\":\"bench-c${c}-$$\"}"
      read -r tp avg ok total _status \
        <<< "$(bench_concurrency "${RUSHDINO_API_RUNS}" "POST" "${_body}" "${c}" "${n}")"
      if [[ -z "${RUNS_1X_TP}" ]]; then
        RUNS_1X_TP="${tp}"
        scaling="1.00×"
      else
        scaling=$(python3 -c "print(f'{float(\"${tp}\")/float(\"${RUNS_1X_TP}\"):.2f}×')" 2>/dev/null || echo "--")
      fi
      PARALLEL_RUNS_BENCH="${PARALLEL_RUNS_BENCH}| ${c}× | ${tp} runs/s | ${avg}ms | ${scaling} |
"
      info "runs  c=${c}  tp=${tp} runs/s  avg=${avg}ms  ok=${ok}/${total}"
    done
    cleanup_bench_sessions "${RUSHDINO_API_SESSIONS}"
  else
    PARALLEL_RUNS_NOTE="> Endpoint returned HTTP ${_probe_status}. Authentication may be required. Skipped."
    warn "POST /api/runs returned HTTP ${_probe_status} — skipping parallel run-submission benchmark."
  fi

else
  warn "RushDino not reachable; skipping parallel concurrency benchmark (Section I)."
  PARALLEL_RUNS_NOTE="> Server not reachable during benchmark run."
fi

# ---- Section F: Shutdown RushDino -------------------------------------------

if [[ -n "${RDINO_PID}" ]] && kill -0 "${RDINO_PID}" 2>/dev/null; then
  info "Stopping RushDino (PID ${RDINO_PID})..."
  kill "${RDINO_PID}" 2>/dev/null || true
  wait "${RDINO_PID}" 2>/dev/null || true
  RDINO_PID=""
fi

# ---- Section G: Compute improvement ratios ----------------------------------

improvement_ratio() {
  local a="$1" b="$2"   # a = RushDino value, b = reference value
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
OS_INFO=$(uname -srm)
GENERATED_AT=$(date)

# Format RushDino boot time for the comparison table.
if [[ "${RUSHDINO_BOOT}" =~ ^([0-9]+)ms$ ]]; then
  _ms="${BASH_REMATCH[1]}"
  RUSHDINO_BOOT_CLEAN=$(python3 -c "
ms = int('${_ms}')
if ms < 1000:
    print(f'< {ms} ms')
else:
    print(f'~{ms/1000:.1f} s')
")
elif [[ "${RUSHDINO_BOOT}" == timeout* ]]; then
  RUSHDINO_BOOT_CLEAN="> ${BOOT_TIMEOUT_S} s"
else
  RUSHDINO_BOOT_CLEAN="—"
fi

info "Writing report to ${REPORT}..."

cat > "${REPORT}" <<MDEOF
# RushDino — Performance Snapshot

Generated: ${GENERATED_AT}

## Competitor Comparison

|  | **RushDino** | OpenClaw | ZeroClaw | PicoClaw | GoClaw |
|---|:---:|---|---|---|---|
| **Language** | **Rust** | ${REF_OPENCLAW_LANG} | ${REF_ZEROCLAW_LANG} | ${REF_PICOCLAW_LANG} | ${REF_GOCLAW_LANG} |
| **Binary size** | **${RUSHDINO_SIZE_HUMAN}** | ${REF_OPENCLAW_SIZE} | ${REF_ZEROCLAW_SIZE} | ${REF_PICOCLAW_SIZE} | ${REF_GOCLAW_SIZE} |
| **Docker image** | — | ${REF_OPENCLAW_DOCKER} | ${REF_ZEROCLAW_DOCKER} | ${REF_PICOCLAW_DOCKER} | ${REF_GOCLAW_DOCKER} |
| **RAM (idle)** | **${RUSHDINO_IDLE_RSS_MB} MB** | ${REF_OPENCLAW_RAM} | ${REF_ZEROCLAW_RAM} | ${REF_PICOCLAW_RAM} | ${REF_GOCLAW_RAM} |
| **Startup** | **${RUSHDINO_BOOT_CLEAN}** | ${REF_OPENCLAW_STARTUP} | ${REF_ZEROCLAW_STARTUP} | ${REF_PICOCLAW_STARTUP} | ${REF_GOCLAW_STARTUP} |
| **Target hardware** | **local Mac / Linux** | ${REF_OPENCLAW_HW} | ${REF_ZEROCLAW_HW} | ${REF_PICOCLAW_HW} | ${REF_GOCLAW_HW} |

> RushDino values measured live on this machine. Competitor values sourced from
> each project's published documentation and benchmarks.

## HTTP Performance (RushDino)

| Metric | Value |
|---|---|
| Latency p50 / p95 / p99 (${LATENCY_SAMPLES} reqs) | ${RDINO_LATENCY} |
| Idle RSS | ${RUSHDINO_IDLE_RSS_MB} MB |
| Peak RSS (under load) | ${RUSHDINO_PEAK_RSS_MB} MB |
| Physical footprint (dirty pages) | ${RUSHDINO_PHYS_FOOTPRINT} |
| Virtual memory (VSZ) | ${RUSHDINO_IDLE_VSZ_MB} MB |

## Parallel Agent Concurrency Benchmark

Measures how RushDino scales when multiple clients dispatch work simultaneously.

### Concurrent GET /healthz (HTTP baseline)

Each level fires \`concurrency × 20\` total requests.

| Concurrency | Throughput | Avg Latency | Scaling vs 1× |
|---|---|---|---|
${PARALLEL_HEALTHZ_BENCH}
### Parallel Agent Run Submissions (POST /api/runs)

Each request dispatches an agent run processed asynchronously by the Rust \`AgentEngine\`.
Each level fires \`concurrency × 5\` total submissions.

${PARALLEL_RUNS_NOTE}
| Concurrency | Throughput | Avg Submit Latency | Scaling vs 1× |
|---|---|---|---|
${PARALLEL_RUNS_BENCH}
## Environment

| Property | Value |
|---|---|
| OS | ${OS_INFO} |
| RushDino version | ${RDINO_VERSION} |
| Health endpoint | \`${RUSHDINO_HEALTH}\` |
| Latency samples | ${LATENCY_SAMPLES} |
| Date | ${GENERATED_AT} |

## Methodology

- **Binary size**: \`stat\` on the release binary.
- **Boot time**: wall-clock ms from process spawn until first successful \`curl\` to \`/healthz\`, polled every 10 ms.
- **Idle RSS**: \`ps -o rss=\` immediately after the server becomes ready, before any requests are served.
- **Peak RSS**: highest RSS sample taken during the latency test, sampled every ${RSS_SAMPLE_INTERVAL}s.
- **HTTP latency**: ${LATENCY_SAMPLES} sequential \`curl\` requests; sorted to derive p50/p95/p99.
- **Concurrency**: Python \`ThreadPoolExecutor\`; throughput = successful requests ÷ wall-clock seconds.
MDEOF

info "Done. Report written to: ${REPORT}"
echo ""
echo "================================================================"
echo "  Binary size  : ${RUSHDINO_SIZE_HUMAN}"
echo "  Startup      : ${RUSHDINO_BOOT_CLEAN}"
echo "  Idle RSS     : ${RUSHDINO_IDLE_RSS_MB} MB"
echo "  Peak RSS     : ${RUSHDINO_PEAK_RSS_MB} MB"
echo "  Latency      : ${RDINO_LATENCY}"
echo "================================================================"
