#!/usr/bin/env bash
# Build và chạy toàn bộ bằng Docker (client :8080, server :2567).
source "$(dirname "$0")/_common.sh"
require_docker
docker compose up --build -d
docker compose ps
ok "Mở http://localhost:8080  ·  xem log: ./scripts/docker-logs.sh  ·  tắt: ./scripts/docker-down.sh"
