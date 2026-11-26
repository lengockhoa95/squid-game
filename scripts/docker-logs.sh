#!/usr/bin/env bash
# Xem log Docker. Ví dụ: ./scripts/docker-logs.sh server
source "$(dirname "$0")/_common.sh"
require_docker
docker compose logs -f --tail=100 "$@"
