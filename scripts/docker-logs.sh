#!/usr/bin/env bash
# Tự chuyển sang bash nếu bị gọi bằng `sh` (dash).
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"
# Xem log Docker. Ví dụ: ./scripts/docker-logs.sh server
source "$(dirname "$0")/_common.sh"
require_docker
docker compose logs -f --tail=100 "$@"
