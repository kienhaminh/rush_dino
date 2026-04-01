#!/usr/bin/env bash

cleanup_bench_sessions_once() {
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
    print("0 0")
    raise SystemExit(0)

victims = [
    item["id"]
    for item in data.get("items", [])
    if isinstance(item, dict)
    and (
        (isinstance(item.get("title"), str) and item["title"].startswith("bench "))
        or (isinstance(item.get("id"), str) and item["id"].startswith("bench-"))
    )
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

print(f"{len(victims)} {deleted}")
PY
}

cleanup_bench_sessions_with_retries() {
  local sessions_url="$1"
  local attempts="${2:-6}"
  local delay_s="${3:-0.25}"
  local summary=""
  local victims=0
  local deleted=0

  for attempt in $(seq 1 "${attempts}"); do
    read -r victims deleted <<<"$(cleanup_bench_sessions_once "${sessions_url}")"
    summary="${summary} attempt=${attempt}:victims=${victims},deleted=${deleted}"
    if (( attempt < attempts )); then
      sleep "${delay_s}"
    fi
  done

  echo "[bench] benchmark cleanup complete:${summary}" >&2
}

cleanup_bench_sessions() {
  cleanup_bench_sessions_with_retries "$1"
}
