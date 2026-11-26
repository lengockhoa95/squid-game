#!/usr/bin/env bash
# Tự chuyển sang bash nếu bị gọi bằng `sh` (dash).
[ -n "${BASH_VERSION:-}" ] || exec bash "$0" "$@"
# Build và chạy toàn bộ bằng Docker (client :8080, server :2567).
source "$(dirname "$0")/_common.sh"
require_docker
docker compose up --build -d
docker compose ps
ok "Mở http://localhost:8080  ·  xem log: ./scripts/docker-logs.sh  ·  tắt: ./scripts/docker-down.sh"
