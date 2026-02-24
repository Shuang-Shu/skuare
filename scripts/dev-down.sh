#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${ROOT_DIR}/.skuare/dev/skuare-svc.pid"

is_skuare_svc_pid() {
  local pid="$1"
  [ -n "${pid}" ] || return 1
  kill -0 "${pid}" 2>/dev/null || return 1
  ps -p "${pid}" -o args= 2>/dev/null | grep -q "cmd/skuare-svc"
}

if [ ! -f "${PID_FILE}" ]; then
  echo "skuare-svc is not running (no pid file)"
  exit 0
fi

PID="$(cat "${PID_FILE}" 2>/dev/null || true)"
if [ -z "${PID}" ]; then
  rm -f "${PID_FILE}"
  echo "skuare-svc is not running (empty pid file)"
  exit 0
fi

if is_skuare_svc_pid "${PID}"; then
  echo "stopping skuare-svc (pid=${PID})"
  kill "${PID}" 2>/dev/null || true
  for _ in $(seq 1 20); do
    if ! is_skuare_svc_pid "${PID}"; then
      rm -f "${PID_FILE}"
      echo "skuare-svc stopped"
      exit 0
    fi
    sleep 0.25
  done
  echo "force killing skuare-svc (pid=${PID})"
  kill -9 "${PID}" 2>/dev/null || true
fi

rm -f "${PID_FILE}"
echo "skuare-svc stopped"
