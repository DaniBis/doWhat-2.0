#!/usr/bin/env bash
set -euo pipefail

# Ensure we are at repo root
cd "$(dirname "$0")/.."

log() { printf "\n[mobile-start] %s\n" "$*"; }

log "Starting mobile dev server with environment bootstrap"

# Bootstrap Node via nvm or fallback Homebrew
if ! command -v node >/dev/null 2>&1; then
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    log "Sourcing nvm"
    # shellcheck disable=SC1090
    . "$HOME/.nvm/nvm.sh"
    NVM_NODE_VERSION="20"
    if ! nvm ls "$NVM_NODE_VERSION" >/dev/null 2>&1; then
      log "Installing Node $NVM_NODE_VERSION via nvm"
      nvm install "$NVM_NODE_VERSION"
    fi
    nvm use "$NVM_NODE_VERSION"
  elif command -v brew >/dev/null 2>&1; then
    log "Using Homebrew node (installing if missing)"
    brew list node >/dev/null 2>&1 || brew install node
  else
    log "No node found and neither nvm nor brew available. Please install Node 20 manually."
    exit 1
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
