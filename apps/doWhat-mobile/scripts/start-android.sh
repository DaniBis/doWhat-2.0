#!/usr/bin/env bash
set -euo pipefail

kill_port() {
  local port=$1
  local pids
  if pids=$(lsof -ti tcp:"$port" 2>/dev/null) && [[ -n "$pids" ]]; then
    echo "Killing processes on port $port: $pids"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
  fi
}

kill_port 8081
kill_port 8082
kill_port 19000
kill_port 19001

PROJECT_DIR=$(cd "$(dirname "$0")/.." && pwd)
REPO_ROOT=$(cd "${PROJECT_DIR}/../.." && pwd)
WEB_PROJECT_DIR=$(cd "${PROJECT_DIR}/../doWhat-web" && pwd)
METRO_PORT=${EXPO_METRO_PORT:-8081}
WEB_DEV_PORT=${EXPO_PUBLIC_WEB_PORT:-${EXPO_PUBLIC_SITE_PORT:-3002}}
WEB_DEV_LOG_FILE="${REPO_ROOT}/web-dev.log"

wait_for_port() {
  local port=$1
  local retries=${2:-15}
  local delay=${3:-1}
  for ((i = 0; i < retries; i++)); do
    if lsof -ti tcp:"${port}" >/dev/null 2>&1; then
      return 0
    fi
    sleep "${delay}"
  done
  return 1
}

start_web_dev_server() {
  if [[ "${SKIP_WEB_DEV_SERVER:-0}" == "1" ]]; then
    echo "Skipping Next.js dev server bootstrap (SKIP_WEB_DEV_SERVER=1)."
    return
  fi

  if lsof -ti tcp:"${WEB_DEV_PORT}" >/dev/null 2>&1; then
    echo "Detected Next.js dev server on port ${WEB_DEV_PORT}."
    return
  fi

  if [[ ! -d "${WEB_PROJECT_DIR}" ]]; then
    echo "Warning: Unable to locate web project directory at ${WEB_PROJECT_DIR}."
    return
  fi

  echo "Starting Next.js dev server on port ${WEB_DEV_PORT}..."
  (
    cd "${REPO_ROOT}" &&
      pnpm --filter dowhat-web dev >>"${WEB_DEV_LOG_FILE}" 2>&1
  ) &
  local web_pid=$!
  disown "${web_pid}" 2>/dev/null || true
  echo "Next.js dev server launched (pid ${web_pid}); logs streaming to ${WEB_DEV_LOG_FILE}."

  if ! wait_for_port "${WEB_DEV_PORT}" 20 0.5; then
    echo "Warning: Next.js dev server did not open port ${WEB_DEV_PORT} after waiting."
  fi
}

ensure_adb_reverse() {
  if ! command -v adb >/dev/null 2>&1; then
    echo "adb not found; skipping reverse proxy setup."
    return
  fi

  local has_device
  has_device=$(adb devices | awk 'NR>1 && $2=="device" {print $1; exit}')
  if [[ -z "${has_device}" ]]; then
    echo "No Android device/emulator connected; skipping adb reverse."
    return
  fi

  adb reverse tcp:${METRO_PORT} tcp:${METRO_PORT} >/dev/null 2>&1 || true
  adb reverse tcp:${WEB_DEV_PORT} tcp:${WEB_DEV_PORT} >/dev/null 2>&1 || true
  echo "Configured adb reverse for Metro ${METRO_PORT} and web API ${WEB_DEV_PORT}."
}

start_web_dev_server
ensure_adb_reverse

if [[ -z "${EXPO_PUBLIC_WEB_URL:-}" ]]; then
  export EXPO_PUBLIC_WEB_URL="http://127.0.0.1:${WEB_DEV_PORT}"
fi

echo "Starting Expo Android dev-client on localhost:${METRO_PORT}."
exec expo start --dev-client --android --host localhost --port "${METRO_PORT}" -c
