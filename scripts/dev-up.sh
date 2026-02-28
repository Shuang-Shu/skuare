#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPEC_DIR="${SPEC_DIR:-$HOME/.skuare}"
GOCACHE_DIR="${GOCACHE:-/tmp/go-cache-skuare}"
LOCAL_MODE="${LOCAL_MODE:-true}"
AUTHORIZED_KEYS_FILE="${AUTHORIZED_KEYS_FILE:-}"
AUTH_MAX_SKEW_SEC="${AUTH_MAX_SKEW_SEC:-300}"
BE_ARGS="${BE_ARGS:-}"

DEV_DIR="${ROOT_DIR}/.skuare/dev"
PID_FILE="${DEV_DIR}/skuare-svc.pid"
LOG_FILE="${DEV_DIR}/skuare-svc.log"

read_addr_from_config() {
  local cfg="$1"
  [ -f "${cfg}" ] || return 1
  node -e '
const fs = require("node:fs");
const p = process.argv[1];
try {
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  const a = j?.remote?.address;
  const port = j?.remote?.port;
  if (typeof a === "string" && a.trim() !== "" && Number.isInteger(port) && port > 0 && port <= 65535) {
    process.stdout.write(`${a.trim().replace(/^https?:\/\//, "").replace(/\/$/, "")}:${port}`);
    process.exit(0);
  }
} catch {}
process.exit(1);
' "${cfg}" 2>/dev/null
}

resolve_addr() {
  if [ -n "${ADDR:-}" ]; then
    echo "${ADDR}"
    return 0
  fi
  if [ -n "${SKUARE_SVC_URL:-}" ]; then
    echo "${SKUARE_SVC_URL}" | sed -E 's#^https?://##; s#/$##'
    return 0
  fi

  local ws_cfg="${ROOT_DIR}/.skuare/config.json"
  local global_cfg="${HOME}/.skuare/config.json"
  local cfg_addr=""

  if cfg_addr="$(read_addr_from_config "${ws_cfg}")"; then
    echo "${cfg_addr}"
    return 0
  fi
  if cfg_addr="$(read_addr_from_config "${global_cfg}")"; then
    echo "${cfg_addr}"
    return 0
  fi

  echo "127.0.0.1:15657"
}

is_skuare_svc_pid() {
  local pid="$1"
  [ -n "${pid}" ] || return 1
  kill -0 "${pid}" 2>/dev/null || return 1
  ps -p "${pid}" -o args= 2>/dev/null | grep -q "cmd/skuare-svc"
}

mkdir -p "${DEV_DIR}"
ADDR="$(resolve_addr)"

if [ -f "${PID_FILE}" ]; then
  OLD_PID="$(cat "${PID_FILE}" 2>/dev/null || true)"
  if is_skuare_svc_pid "${OLD_PID}"; then
    echo "skuare-svc already running (pid=${OLD_PID})"
    echo "log: ${LOG_FILE}"
    exit 0
  fi
  rm -f "${PID_FILE}"
fi

SPEC_ABS="${SPEC_DIR}"
case "${SPEC_ABS}" in
  /*) ;;
  *) SPEC_ABS="${ROOT_DIR}/${SPEC_ABS}" ;;
esac
mkdir -p "${SPEC_ABS}"

echo "starting skuare-svc ..."
(
  cd "${ROOT_DIR}/skuare-svc"
  cmd=(go run ./cmd/skuare-svc --addr "${ADDR}" --spec-dir "${SPEC_ABS}" --local="${LOCAL_MODE}" --auth-max-skew-sec "${AUTH_MAX_SKEW_SEC}")
  if [ -n "${AUTHORIZED_KEYS_FILE}" ]; then
    cmd+=(--authorized-keys-file "${AUTHORIZED_KEYS_FILE}")
  fi
  if [ -n "${BE_ARGS}" ]; then
    # shellcheck disable=SC2206
    extra_args=(${BE_ARGS})
    cmd+=("${extra_args[@]}")
  fi

  nohup env GOCACHE="${GOCACHE_DIR}" SKUARE_LOCAL_MODE="${LOCAL_MODE}" "${cmd[@]}" >>"${LOG_FILE}" 2>&1 &
  echo $! >"${PID_FILE}"
)

PID="$(cat "${PID_FILE}")"

for _ in $(seq 1 40); do
  if ! is_skuare_svc_pid "${PID}"; then
    echo "skuare-svc exited unexpectedly. recent logs:" >&2
    tail -n 30 "${LOG_FILE}" >&2 || true
    rm -f "${PID_FILE}"
    exit 1
  fi
  if curl -fsS "http://${ADDR}/healthz" >/dev/null 2>&1; then
    echo "skuare-svc is up (pid=${PID}, addr=${ADDR})"
    echo "log: ${LOG_FILE}"
    echo "example: ${ROOT_DIR}/skr --server http://${ADDR} health"
    exit 0
  fi
  sleep 0.25
done

echo "skuare-svc started but health check timed out. check log: ${LOG_FILE}" >&2
exit 1
