# SURVIVAL PARTY

Game web 3D multiplayer (tối đa 4 người, người thật + NPC) gồm nhiều minigame loại trực tiếp.
Three.js + React + Vite (client), Node.js + Colyseus (server), TypeScript toàn bộ.

> Trạng thái: Phase 0–1 xong (nền tảng + sân thử 3D). Xem [PROGRESS.md](PROGRESS.md).

## Yêu cầu

- Node.js **24+** (server chạy thẳng file `.ts` nhờ type stripping của Node)
- npm 11+
- (tuỳ chọn) Docker 24+ và Docker Compose v2
- Trình duyệt: Chrome hoặc Edge bản mới

## Script tiện dụng

| Script | Việc làm |
|---|---|
| `./scripts/setup.sh` | Kiểm tra Node 24+ và cài dependency |
| `./scripts/dev.sh` | Chạy server (:2567) + client (:5173) cùng lúc, Ctrl+C tắt cả hai |
| `./scripts/check.sh` | Typecheck + unit test + build (chạy trước khi push) |
| `./scripts/docker-up.sh` | Build và chạy bằng Docker (client :8080, server :2567) |
| `./scripts/docker-logs.sh [server\|client]` | Xem log Docker |
| `./scripts/docker-down.sh` | Tắt Docker |

## Chạy local (phát triển)

```bash
npm install
npm run dev:server     # http://localhost:2567
npm run dev:client     # http://localhost:5173
```

Mở http://localhost:5173 → **Vào sân thử**.

## Chạy bằng Docker

```bash
docker compose up --build -d
# client: http://localhost:8080   ·  server: ws://localhost:2567
docker compose down
```

- `server/Dockerfile`: `node:24-alpine`, chỉ cài dependency production của `server` + `shared`.
- `client/Dockerfile`: build bằng `node:24-slim`, phục vụ file tĩnh bằng `nginx:alpine` (SPA fallback, cache asset 1 năm).

## Lệnh

| Lệnh | Mô tả |
|---|---|
| `npm test` | Chạy toàn bộ unit test (Vitest) |
| `npm run typecheck` | Typecheck cả 3 package |
| `npm run build` | Typecheck + build client production |

## Điều khiển

Chuột là chính, bàn phím luôn dùng song song.

| Hành động | Chuột | Bàn phím |
|---|---|---|
| Di chuyển | Click trái lên mặt đất (giữ + kéo để lái liên tục) | WASD / mũi tên |
| Dừng | Nhấp chuột phải | X / thả phím |
| Nhảy | Click chuột giữa | Space |
| Xoay camera | Giữ chuột phải + kéo | Q / E |
| Zoom | Con lăn | + / − |
| Thông tin hiệu năng | nút F3 trên HUD | F3 |

## Cấu trúc

```
shared/  types, config (quality, movement, i18n), sim (kinematics dùng chung server + client)
server/  Colyseus server (rooms, match, npc, minigames — từ Phase 2)
client/  core (engine, render, camera, input), player, scenes, ui, store
docs/    spec, kế hoạch, số đo hiệu năng
```

Thiết kế chi tiết: [docs/superpowers/specs/2026-11-26-survival-party-design.md](docs/superpowers/specs/2026-11-26-survival-party-design.md).
