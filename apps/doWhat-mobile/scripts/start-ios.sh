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

IOS_SIMULATOR_NAME=${IOS_SIMULATOR_NAME:-"iPhone 16 Pro"}
APP_BUNDLE_ID=${APP_BUNDLE_ID:-"com.dowhat.app"}
PROJECT_DIR=$(cd "$(dirname "$0")/.." && pwd)
SENTINEL_FILE="${PROJECT_DIR}/.native-dev-client-signature"

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

# Boot the simulator if it's not already running
if ! xcrun simctl list devices booted | grep -q "${IOS_SIMULATOR_NAME}"; then
  echo "Booting iOS simulator: ${IOS_SIMULATOR_NAME}"
  xcrun simctl boot "${IOS_SIMULATOR_NAME}" 2>/dev/null || true
  open -a Simulator
  # Give the simulator a few seconds to boot
  sleep 5
fi


rebuild_dev_client() {
  echo "Rebuilding Expo dev client with native module updates..."
  pnpm --filter doWhat-mobile run prebuild:ios
  pnpm --filter doWhat-mobile run run:ios:sim
  echo "${DESIRED_SIGNATURE}" > "${SENTINEL_FILE}"
}

# Build/install the dev client when missing or when native module signature changed.
if ! xcrun simctl get_app_container booted "${APP_BUNDLE_ID}" data >/dev/null 2>&1; then
  echo "Dev client not found for ${APP_BUNDLE_ID}. Building and installing on ${IOS_SIMULATOR_NAME}..."
  rebuild_dev_client
elif [[ "${needs_rebuild}" == true ]]; then
  echo "Detected native dependency/config changes. Reinstalling dev client on ${IOS_SIMULATOR_NAME}..."
  rebuild_dev_client
fi

HOST_TYPE=${EXPO_HOST_TYPE:-"localhost"}
echo "Starting Expo dev server for ${IOS_SIMULATOR_NAME} using host '${HOST_TYPE}'."
exec expo start --dev-client --ios --host "${HOST_TYPE}" -c

# Tip: if you need to rebuild the dev client, run:
#   pnpm --filter doWhat-mobile run prebuild:ios
#   (cd ios && LANG=en_US.UTF-8 pod install)
#   pnpm --filter doWhat-mobile run run:ios:sim
