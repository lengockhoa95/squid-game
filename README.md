# SURVIVAL PARTY

Game web 3D multiplayer (tối đa 4 người, người thật + NPC) gồm nhiều minigame loại trực tiếp.
Three.js + React + Vite (client), Node.js + Colyseus (server), TypeScript toàn bộ.

> Trạng thái: Phase 0–8 xong — chơi được đầy đủ: phòng, lobby, NPC 4 cấp độ, 5 minigame, loại trực tiếp, spectator, người thắng, chế độ Nguyên tố. Xem [PROGRESS.md](PROGRESS.md).
> Hướng dẫn test 4 người: [TESTING.md](TESTING.md).

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
| `npm run e2e` | E2E bằng Chrome thật (cần `./scripts/dev.sh` đang chạy) |
| `npm run sim -- 500` | Mô phỏng 500 trận toàn NPC, in tỉ lệ thắng theo độ khó |
| `./scripts/docker-up.sh` | Build và chạy bằng Docker (client :8080, server :2567) |
| `./scripts/docker-logs.sh [server\|client]` | Xem log Docker |
| `./scripts/docker-down.sh` | Tắt Docker |

## Chạy local (phát triển)

```bash
npm install
npm run dev:server     # http://localhost:2567
npm run dev:client     # http://localhost:5173
```

Mở http://localhost:5173 → nhập tên → **Tạo phòng** (hoặc **Sân thử (offline)**).

### Cấu hình

| Biến | Nơi đặt | Mặc định | Ý nghĩa |
|---|---|---|---|
| `PORT` | server | `2567` | Cổng Colyseus |
| `VITE_SERVER_URL` | client (lúc build) | `http(s)://<host đang mở trang>:2567` | Địa chỉ server khi deploy khác máy/cổng |
| `COLYSEUS_LATENCY` | server | – | Giả lập độ trễ (ms) để thử prediction |
| `SP_GAMES` | server | – (tất cả) | Chỉ chơi các minigame này khi test, ví dụ `SP_GAMES=RLGL,OBSTACLE_RACE` |

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

## Cách chơi

1. Nhập tên → **Tạo phòng** → gửi mã 5 ký tự cho bạn bè (tối đa 4 người).
2. Host chỉnh số NPC và độ khó (Dễ / Thường / Khó / Thông minh). NPC tự lấp chỗ trống khi bấm **Bắt đầu**.
3. Mỗi trận 3–5 minigame chọn ngẫu nhiên (không lặp liên tiếp). Thua thì bị loại và chuyển sang xem.
   Trận kết thúc khi còn 1 người.

| Minigame | Cách chơi |
|---|---|
| Đèn Xanh – Đèn Đỏ | Click/W để chạy khi đèn xanh, dừng khi đèn đỏ (nhấp chuột phải / thả phím) |
| Cầu Kính | Click tấm kính hàng kế tiếp (A/D). Mọi người chơi cùng lúc |
| Vượt Chướng Ngại | Click/WASD để chạy, Space/chuột giữa để nhảy qua hố và tường |
| Kéo Co | Click/Space khi kim vào vùng xanh |
| Phản Xạ Nhanh | Click/Space khi màn hình chuyển xanh (BẤM!) |

### Chế độ Nguyên tố (bật mặc định, host tắt được trong lobby)

Lúc hiện luật mỗi vòng, chọn 1 trong 9 nguyên tố. Khi chơi, bấm nút nguyên tố (góc phải dưới) rồi click xuống đất để ngắm,
hoặc nhấn **F** để dùng ngay tại con trỏ. Chiêu không giới hạn số lần, chỉ có thời gian hồi. Cố tình không cân bằng: vui là chính.

| Nguyên tố | Tác dụng |
|---|---|
| Đất | Dựng cột đá chặn đường 4s |
| Nước | Vũng lầy, người khác đi chậm còn 35% |
| Lôi | Sét đánh người gần con trỏ, choáng 1s |
| Gió | Thổi văng người xung quanh (đèn đỏ mà bị thổi là bị loại) |
| Lửa | Chạy nhanh gấp đôi 2,5s |
| Hoán đổi | Đổi chỗ với người gần con trỏ nhất |
| Phân thân | 2 bản sao giống hệt chạy lung tung 5s |
| Không gian | Dịch chuyển tức thời tới con trỏ (≤5m) |
| Bóng tối | Che tối màn hình người gần con trỏ |

Cầu Kính chỉ có Lôi / Hoán đổi / Bóng tối (Hoán đổi = đổi tiến độ với người dẫn đầu). Kéo Co và Phản Xạ Nhanh chỉ có Lôi
(khoá thao tác của 1 đối thủ) và Bóng tối (che màn hình mọi đối thủ). NPC cũng dùng nguyên tố.

## Điều khiển

Chuột là chính, bàn phím luôn dùng song song.

| Hành động | Chuột | Bàn phím |
|---|---|---|
| Di chuyển | Click trái lên mặt đất (giữ + kéo để lái liên tục) | WASD / mũi tên |
| Dừng | Nhấp chuột phải | X / thả phím |
| Nhảy | Click chuột giữa | Space |
| Xoay camera | Giữ chuột phải + kéo | Q / E |
| Zoom | Con lăn | + / − |
| Dùng nguyên tố | Nút nguyên tố → click xuống đất (chuột phải huỷ) | F (tại con trỏ) |
| Thông tin hiệu năng | nút F3 trên HUD | F3 |

## Cấu trúc

```
shared/  config (quality, movement, npc, i18n), sim (kinematics dùng chung), minigames (luật/bố cục),
         protocol, schema (state đồng bộ), validation
server/  rooms (MatchRoom), match (controller, scheduler, elimination), npc, minigames/<Game>
         (Logic + NPCStrategy), players, validation (rate limit), network (room code, RTT)
client/  core (engine, render, camera, input), player (model, prediction, interpolation),
         scenes (playground, match), minigames/<Game> (View 3D + Hud), ui, network, audio
e2e/     kịch bản Playwright (Chrome thật)
docs/    spec, kế hoạch, số đo hiệu năng
```

Thiết kế chi tiết: [docs/superpowers/specs/2026-11-26-survival-party-design.md](docs/superpowers/specs/2026-11-26-survival-party-design.md).
