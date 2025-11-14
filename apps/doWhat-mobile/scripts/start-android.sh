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

# Metro typically uses 8081 and Expo falls back to 8082 when the default is busy.
kill_port 8081
kill_port 8082

# Expo dev tools commonly use these ports as well; clearing them avoids stale servers.
kill_port 19000
kill_port 19001

ANDROID_EMULATOR_NAME=${ANDROID_EMULATOR_NAME:-"Pixel_API_34"}
APP_PACKAGE_ID=${APP_PACKAGE_ID:-"com.dowhat.app"}
PROJECT_DIR=$(cd "$(dirname "$0")/.." && pwd)
REPO_ROOT=$(cd "${PROJECT_DIR}/../.." && pwd)
WEB_PROJECT_DIR=$(cd "${PROJECT_DIR}/../doWhat-web" && pwd)
SENTINEL_FILE="${PROJECT_DIR}/.native-dev-client-signature"
METRO_PORT=${EXPO_METRO_PORT:-8081}
WEB_DEV_PORT=${EXPO_PUBLIC_WEB_PORT:-${EXPO_PUBLIC_SITE_PORT:-3002}}
WEB_DEV_LOG_FILE="${REPO_ROOT}/web-dev.log"
LAN_HOST_SCRIPT="${PROJECT_DIR}/scripts/resolve-metro-host.js"

compute_signature() {
  node -e 'const crypto = require("crypto");
    const fs = require("fs");
    const path = require("path");
    const projectRoot = process.argv[1];
    const pkgPath = path.join(projectRoot, "package.json");
    const configPath = path.join(projectRoot, "app.config.js");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

    const sortObject = (obj = {}) =>
      Object.keys(obj)
        .sort()
        .reduce((acc, key) => {
          acc[key] = obj[key];
          return acc;
        }, {});

    const dependencies = sortObject(pkg.dependencies);
    const configHash = fs.existsSync(configPath)
      ? crypto.createHash("sha1").update(fs.readFileSync(configPath, "utf8")).digest("hex")
      : null;

    const signature = crypto
      .createHash("sha1")
      .update(JSON.stringify({ dependencies, configHash }))
      .digest("hex");

    process.stdout.write(signature);
  ' "${PROJECT_DIR}"
}

DESIRED_SIGNATURE=$(compute_signature)

needs_rebuild=true
if [[ -f "${SENTINEL_FILE}" ]]; then
  CURRENT_SIGNATURE=$(cat "${SENTINEL_FILE}" 2>/dev/null || echo "")
  if [[ "${CURRENT_SIGNATURE}" == "${DESIRED_SIGNATURE}" ]]; then
    needs_rebuild=false
  fi
fi

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

# Check if Android SDK is available
if ! command -v adb >/dev/null 2>&1; then
  if [[ -n "${ANDROID_HOME:-}" ]]; then
    export PATH="${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/emulator:${PATH}"
  elif [[ -n "${ANDROID_SDK_ROOT:-}" ]]; then
    export PATH="${ANDROID_SDK_ROOT}/platform-tools:${ANDROID_SDK_ROOT}/emulator:${PATH}"
  fi
fi

if ! command -v adb >/dev/null 2>&1; then
  echo "Error: adb not found. Please ensure Android SDK is installed and ANDROID_HOME is set."
  exit 1
fi

# Boot the emulator if it's not already running
is_emulator_running() {
  adb devices | grep -q "emulator.*device$"
}

wait_for_emulator_boot() {
  local timeout=120
  local elapsed=0
  while ! is_emulator_running; do
    if [[ $elapsed -ge $timeout ]]; then
      echo "Warning: Emulator did not start within ${timeout} seconds."
      return 1
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  return 0
}

if ! is_emulator_running; then
  echo "Starting Android emulator: ${ANDROID_EMULATOR_NAME}"
  
  # Check if emulator command exists
  if command -v emulator >/dev/null 2>&1; then
    # Start the emulator in the background
    emulator -avd "${ANDROID_EMULATOR_NAME}" -no-snapshot-load &
    
    # Wait for the emulator to boot
    echo "Waiting for emulator to boot..."
    if wait_for_emulator_boot; then
      echo "Emulator is now running."
      # Wait a bit more for the emulator to be fully ready
      sleep 5
    fi
  else
    echo "Warning: emulator command not found. Please ensure Android SDK emulator is installed."
    echo "Attempting to continue anyway..."
  fi
fi

resolve_dev_host() {
  if [[ "${EXPO_PREFER_LAN:-0}" != "1" ]]; then
    echo "127.0.0.1"
    return
  fi

  if [[ ! -f "${LAN_HOST_SCRIPT}" ]]; then
    echo "127.0.0.1"
    return
  fi

  local host
  if host=$(EXPO_LAN_INTERFACES="${EXPO_LAN_INTERFACES:-en0,en1,eth0,wlan0}" node "${LAN_HOST_SCRIPT}" 2>/dev/null); then
    if [[ -n "${host}" ]]; then
      echo "${host}"
      return
    fi
  fi

  echo "127.0.0.1"
}

rebuild_dev_client() {
  echo "Rebuilding Expo dev client with native module updates..."
  pnpm --filter doWhat-mobile run prebuild:android
  pnpm --filter doWhat-mobile run run:android:emu
  echo "${DESIRED_SIGNATURE}" > "${SENTINEL_FILE}"
}

# Check if the dev client is installed on the emulator
is_app_installed() {
  if ! is_emulator_running; then
    return 1
  fi
  adb shell pm list packages | grep -q "${APP_PACKAGE_ID}"
}

# Build/install the dev client when missing or when native module signature changed.
if ! is_app_installed; then
  echo "Dev client not found for ${APP_PACKAGE_ID}. Building and installing on Android emulator..."
  rebuild_dev_client
elif [[ "${needs_rebuild}" == true ]]; then
  echo "Detected native dependency/config changes. Reinstalling dev client on Android emulator..."
  rebuild_dev_client
fi

start_web_dev_server

DEV_SERVER_HOST=${EXPO_DEV_SERVER_HOST:-$(resolve_dev_host)}
HOST_TYPE=${EXPO_HOST_TYPE:-}

if [[ -z "${HOST_TYPE}" ]]; then
  if [[ "${DEV_SERVER_HOST}" == "127.0.0.1" || "${DEV_SERVER_HOST}" == "localhost" ]]; then
    HOST_TYPE="localhost"
  else
    HOST_TYPE="lan"
  fi
fi

if [[ "${HOST_TYPE}" == "lan" ]]; then
  export EXPO_DEV_SERVER_LISTEN_ADDRESS="${DEV_SERVER_HOST}"
else
  unset EXPO_DEV_SERVER_LISTEN_ADDRESS
fi

if [[ -z "${EXPO_PUBLIC_WEB_URL:-}" ]]; then
  if [[ "${HOST_TYPE}" == "localhost" ]]; then
    export EXPO_PUBLIC_WEB_URL="http://127.0.0.1:${WEB_DEV_PORT}"
  else
    export EXPO_PUBLIC_WEB_URL="http://${DEV_SERVER_HOST}:${WEB_DEV_PORT}"
  fi
fi

# Set up ADB reverse proxy for Metro and web server
if is_emulator_running; then
  echo "Setting up ADB reverse proxy for Metro (port ${METRO_PORT}) and web server (port ${WEB_DEV_PORT})..."
  adb reverse "tcp:${METRO_PORT}" "tcp:${METRO_PORT}" || true
  adb reverse "tcp:${WEB_DEV_PORT}" "tcp:${WEB_DEV_PORT}" || true
fi

echo "Starting Expo dev server for Android emulator using host '${DEV_SERVER_HOST}' (${HOST_TYPE}) on port ${METRO_PORT}."
exec expo start --dev-client --android --host "${HOST_TYPE}" --port "${METRO_PORT}" -c

# Tip: if you need to rebuild the dev client, run:
#   pnpm --filter doWhat-mobile run prebuild:android
#   pnpm --filter doWhat-mobile run run:android:emu
