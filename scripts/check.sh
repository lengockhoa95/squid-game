#!/usr/bin/env bash
# Tự chuyển sang bash nếu bị gọi bằng `sh` (dash).
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"
# Typecheck + unit test + build production — chạy trước khi commit/push.
source "$(dirname "$0")/_common.sh"
require_node
ensure_deps
info "Typecheck";  npm run typecheck
info "Unit test";  npx vitest run
info "Build";      npm run build -w @sp/client
ok "Tất cả đều qua"
