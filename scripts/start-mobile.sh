#!/usr/bin/env bash
set -euo pipefail

# Ensure we are at repo root
cd "$(dirname "$0")/.."

log() { printf "\n[mobile-start] %s\n" "$*"; }

log "Starting mobile dev server with environment bootstrap"

# Bootstrap Node via nvm or fallback Homebrew
TARGET_MAJOR=20
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # nvm complains if npm_config_prefix is set (common in some CI shells)
  if [ -n "${npm_config_prefix:-}" ]; then
    unset npm_config_prefix || true
  fi
  # shellcheck disable=SC1090
  . "$HOME/.nvm/nvm.sh"
  CURRENT_NODE=$(command -v node >/dev/null 2>&1 && node -v || echo "")
  CURRENT_MAJOR=${CURRENT_NODE#v}
  CURRENT_MAJOR=${CURRENT_MAJOR%%.*}
  if [ "$CURRENT_MAJOR" != "$TARGET_MAJOR" ]; then
    log "Switching to Node $TARGET_MAJOR via nvm (current: ${CURRENT_NODE:-none})"
    if ! nvm ls "$TARGET_MAJOR" >/dev/null 2>&1; then
      nvm install "$TARGET_MAJOR"
    fi
    nvm use "$TARGET_MAJOR"
  fi
elif ! command -v node >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    log "Using Homebrew node (installing if missing)"
    brew list node >/dev/null 2>&1 || brew install node
  else
    log "No node found and neither nvm nor brew available. Please install Node $TARGET_MAJOR manually."
    exit 1
  fi
else
  CURRENT_NODE=$(node -v)
  CURRENT_MAJOR=${CURRENT_NODE#v}
  CURRENT_MAJOR=${CURRENT_MAJOR%%.*}
  if [ "$CURRENT_MAJOR" != "$TARGET_MAJOR" ]; then
    log "Warning: running Node $CURRENT_NODE (expected major $TARGET_MAJOR). Consider using nvm to align versions."
  fi
fi

log "Node version: $(node -v)"

# Ensure corepack/pnpm
if ! command -v pnpm >/dev/null 2>&1; then
  log "Enabling corepack & preparing pnpm"
  corepack enable || true
  corepack prepare pnpm@latest --activate || true
fi
log "pnpm version: $(pnpm -v || echo missing)"

# Apply patches & ensure deps (fast if already installed)
log "Installing workspace dependencies (if needed)"
pnpm install --prefer-offline --ignore-scripts --reporter=silent || pnpm install

# Android reverse for Metro and Supabase (8081 + optional 54321 example)
if command -v adb >/dev/null 2>&1; then
  adb reverse tcp:8081 tcp:8081 || true
fi

# Start Expo (LAN to avoid tunnel DNS issues). Do NOT pass --android/--ios automatically to let user choose.
log "Launching Expo (LAN mode, dev-client)"
exec pnpm --filter doWhat-mobile exec expo start --dev-client --lan "$@"
