#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./scripts/open-dev-route.sh ios /onboarding/sports
  ./scripts/open-dev-route.sh android /map

Notes:
  - Opens Expo development build project URL first.
  - Then opens app-specific deep link using doWhat scheme.
  - This avoids development-client route boot failures caused by Expo Go style /--/ paths.
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

PLATFORM="$1"
shift
if [[ "${1:-}" == "--" ]]; then
  shift
fi
RAW_ROUTE="${1:-/home}"
APP_ID="${APP_ID:-com.dowhat.app}"
PROJECT_URL="${EXPO_DEV_URL:-http://127.0.0.1:8081}"
SCHEME_PREFIX="${EXPO_DEV_SCHEME_PREFIX:-exp+dowhat-mobile://expo-development-client/?url=}"
BOOT_WAIT_SECONDS="${BOOT_WAIT_SECONDS:-4}"
ROUTE_RETRY_DELAY_SECONDS="${ROUTE_RETRY_DELAY_SECONDS:-3}"
RETRY_ROUTE_OPEN="${RETRY_ROUTE_OPEN:-1}"

if [[ "$RAW_ROUTE" == "/" ]]; then
  ROUTE_PATH="home"
else
  ROUTE_PATH="${RAW_ROUTE#/}"
fi

if [[ -z "$ROUTE_PATH" ]]; then
  ROUTE_PATH="home"
fi

APP_ROUTE_URL="dowhat://${ROUTE_PATH}"
ENCODED_PROJECT_URL="$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$PROJECT_URL")"
DEV_CLIENT_URL="${SCHEME_PREFIX}${ENCODED_PROJECT_URL}"

case "$PLATFORM" in
  ios)
    xcrun simctl openurl booted "$DEV_CLIENT_URL"
    sleep "$BOOT_WAIT_SECONDS"
    xcrun simctl openurl booted "$APP_ROUTE_URL"
    if [[ "$RETRY_ROUTE_OPEN" == "1" ]]; then
      sleep "$ROUTE_RETRY_DELAY_SECONDS"
      xcrun simctl openurl booted "$APP_ROUTE_URL"
    fi
    ;;
  android)
    app_running="0"
    if adb shell pidof "$APP_ID" >/dev/null 2>&1; then
      app_running="1"
    fi
    if [[ "$app_running" == "0" ]]; then
      adb shell am start -W -a android.intent.action.VIEW -d "$DEV_CLIENT_URL" "$APP_ID" >/dev/null
      sleep "$BOOT_WAIT_SECONDS"
    fi
    adb shell am start -W -a android.intent.action.VIEW -d "$APP_ROUTE_URL" "$APP_ID" >/dev/null
    if [[ "$RETRY_ROUTE_OPEN" == "1" ]]; then
      sleep "$ROUTE_RETRY_DELAY_SECONDS"
      adb shell am start -W -a android.intent.action.VIEW -d "$APP_ROUTE_URL" "$APP_ID" >/dev/null
    fi
    ;;
  *)
    echo "Unsupported platform '$PLATFORM'. Use 'ios' or 'android'."
    exit 1
    ;;
esac

echo "Opened route '${APP_ROUTE_URL}' on ${PLATFORM} via development client."
