#!/usr/bin/env bash
# Typecheck + unit test + build production — chạy trước khi commit/push.
source "$(dirname "$0")/_common.sh"
require_node
ensure_deps
info "Typecheck";  npm run typecheck
info "Unit test";  npx vitest run
info "Build";      npm run build -w @sp/client
ok "Tất cả đều qua"
