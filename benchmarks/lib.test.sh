#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmpdir="$(mktemp -d)"
fakebin="${tmpdir}/bin"
state_file="${tmpdir}/python3-count"
mkdir -p "${fakebin}"

cleanup() {
  rm -rf "${tmpdir}"
}
trap cleanup EXIT

cat >"${fakebin}/python3" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
state_file="${FAKE_PYTHON3_STATE_FILE:?}"
count=0
if [[ -f "${state_file}" ]]; then
  count="$(cat "${state_file}")"
fi
count=$((count + 1))
printf '%s' "${count}" > "${state_file}"

# Consume the embedded script from stdin to match the real python3 call shape.
cat >/dev/null

case "${count}" in
  1) printf '0 0\n' ;;
  2) printf '1 1\n' ;;
  *) printf '0 0\n' ;;
esac
EOF
chmod +x "${fakebin}/python3"

export PATH="${fakebin}:${PATH}"
export FAKE_PYTHON3_STATE_FILE="${state_file}"

# shellcheck source=/dev/null
source "${SCRIPT_DIR}/lib.sh"

cleanup_bench_sessions_with_retries "http://example.invalid/api/sessions" 3 0

call_count="$(cat "${state_file}")"
[[ "${call_count}" == "3" ]]

grep -Fq 'conversation_id":"bench-probe-00' "${SCRIPT_DIR}/run.sh"
grep -Fq 'bench-c${c}-$$' "${SCRIPT_DIR}/run.sh"
