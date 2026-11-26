#!/usr/bin/env bash
# Shared helpers for scripts/*.sh — sourced, not executed directly.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

info()  { printf '\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()    { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
fail()  { printf '\033[1;31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

require_node() {
  command -v node >/dev/null || fail "Chưa cài Node.js (cần bản 24+)"
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$major" -ge 24 ] || fail "Cần Node.js 24+, đang dùng $(node -v)"
}

ensure_deps() {
  if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
    info "Cài dependency (npm install)…"
    npm install
  fi
}

require_docker() {
  command -v docker >/dev/null || fail "Chưa cài Docker"
  docker compose version >/dev/null 2>&1 || fail "Cần Docker Compose v2 (lệnh 'docker compose')"
}
