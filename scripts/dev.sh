#!/usr/bin/env bash
# Tự chuyển sang bash nếu bị gọi bằng `sh` (dash).
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"
# Chạy server (:2567) và client (:5173) cùng lúc. Ctrl+C để tắt cả hai.
source "$(dirname "$0")/_common.sh"
require_node
ensure_deps

pids=()
cleanup() {
  trap - INT TERM EXIT
  info "Đang tắt…"
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

info "Server  → ws://localhost:2567"
npm run dev:server 2>&1 | sed -u 's/^/[server] /' &
pids+=($!)

info "Client  → http://localhost:5173"
npm run dev:client 2>&1 | sed -u 's/^/[client] /' &
pids+=($!)

wait -n
