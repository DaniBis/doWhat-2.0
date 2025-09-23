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

# Boot the simulator if it's not already running
if ! xcrun simctl list devices booted | grep -q "${IOS_SIMULATOR_NAME}"; then
  echo "Booting iOS simulator: ${IOS_SIMULATOR_NAME}"
  xcrun simctl boot "${IOS_SIMULATOR_NAME}" 2>/dev/null || true
  open -a Simulator
  # Give the simulator a few seconds to boot
  sleep 5
fi

# If the dev client isn't installed on the booted simulator, build and install it.
if ! xcrun simctl get_app_container booted "${APP_BUNDLE_ID}" data >/dev/null 2>&1; then
  echo "Dev client not found for ${APP_BUNDLE_ID}. Building and installing on ${IOS_SIMULATOR_NAME}..."
  pnpm run ios -- --device "${IOS_SIMULATOR_NAME}"
fi

exec expo start --dev-client --ios -c

# Tip: if you need to rebuild the dev client, run:
#   pnpm --filter doWhat-mobile run prebuild:ios
#   (cd ios && LANG=en_US.UTF-8 pod install)
#   pnpm --filter doWhat-mobile run run:ios:sim
