#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${ROOT_DIR}/.skuare/dev/skuare-svc.pid"
LOG_FILE="${ROOT_DIR}/.skuare/dev/skuare-svc.log"
ADDR_DEFAULT="127.0.0.1:15657"

is_skuare_svc_pid() {
  local pid="$1"
  [ -n "${pid}" ] || return 1
  kill -0 "${pid}" 2>/dev/null || return 1
  ps -p "${pid}" -o args= 2>/dev/null | grep -q "cmd/skuare-svc"
}

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
  echo "${ADDR_DEFAULT}"
}

if [ ! -f "${PID_FILE}" ]; then
  echo "status: down"
  echo "addr: $(resolve_addr)"
  echo "log: ${LOG_FILE}"
  exit 1
fi

PID="$(cat "${PID_FILE}" 2>/dev/null || true)"
if is_skuare_svc_pid "${PID}"; then
  echo "status: up"
  echo "pid: ${PID}"
  echo "addr: $(resolve_addr)"
  echo "log: ${LOG_FILE}"
  exit 0
fi

echo "status: down (stale pid file)"
echo "addr: $(resolve_addr)"
echo "log: ${LOG_FILE}"
exit 1
