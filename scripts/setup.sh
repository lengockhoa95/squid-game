#!/usr/bin/env bash
# Kiểm tra môi trường và cài dependency.
source "$(dirname "$0")/_common.sh"
require_node
info "Node $(node -v) · npm $(npm -v)"
npm install
ok "Sẵn sàng. Chạy ./scripts/dev.sh để bắt đầu."
