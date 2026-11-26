#!/usr/bin/env bash
# Tự chuyển sang bash nếu bị gọi bằng `sh` (dash).
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"
# Tắt các container Docker của game.
source "$(dirname "$0")/_common.sh"
require_docker
docker compose down
ok "Đã tắt"
