#!/usr/bin/env bash
# Tự chuyển sang bash nếu bị gọi bằng `sh` (dash).
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"
# Kiểm tra môi trường và cài dependency.
source "$(dirname "$0")/_common.sh"
require_node
info "Node $(node -v) · npm $(npm -v)"
npm install
ok "Sẵn sàng. Chạy ./scripts/dev.sh để bắt đầu."
