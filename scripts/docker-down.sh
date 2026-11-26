#!/usr/bin/env bash
# Tắt các container Docker của game.
source "$(dirname "$0")/_common.sh"
require_docker
docker compose down
ok "Đã tắt"
