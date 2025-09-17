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

exec expo start --dev-client --ios -c
