# Tiến độ

## Phase 0 — Khởi tạo ✅ (2026-11-26)

- [x] Monorepo npm workspaces: `shared`, `server`, `client`
- [x] Kiểm chứng: TypeScript 7.0.2 + `@colyseus/core` 0.18 + `@colyseus/schema` 5 (builder `t.*`) + Node 24 chạy `.ts` trực tiếp
- [x] Docker: image server + client (nginx), `docker-compose.yml`

## Phase 1 — Nền tảng 3D ✅ (2026-11-26)

- [x] `shared/sim`: kinematics tất định (tăng tốc, trọng lực, nhảy, va chạm hộp, bước lên bậc thấp, giới hạn bản đồ, chống vector hướng quá lớn) — sẽ dùng chung cho server và client prediction
- [x] RenderManager: preset LOW/MEDIUM/HIGH, giới hạn FPS 30/60, thống kê render
- [x] InputManager ưu tiên chuột: click-to-move, chuột phải dừng/xoay camera, con lăn zoom, chuột giữa nhảy; bàn phím song song
- [x] CameraManager third-person: làm mượt, giới hạn pitch 10°–60° và khoảng cách 6–14m, tự xoay ra sau lưng khi đang click-to-move
- [x] Nhân vật low-poly procedural + animation procedural (đứng, chạy, nhảy), 4 màu/phụ kiện
- [x] Sân thử: chướng ngại vật nhiều độ cao, cây/đá/hàng rào bằng InstancedMesh, 3 nhân vật demo đi lang thang
- [x] Debug overlay (F3): FPS, draw calls, triangles, geometries, textures, heap, entity
- [x] Lazy loading: three.js + engine chỉ tải khi vào màn 3D; giải phóng tài nguyên khi đổi màn
- [x] 33 unit test xanh; typecheck + build sạch; smoke test trên Chrome headless không có lỗi console

### Chưa làm / lưu ý

- FPS trên máy thật **chưa đo** — xem [docs/perf/phase1-measurements.md](docs/perf/phase1-measurements.md) để điền số liệu.
- 3 nhân vật demo trong sân thử chỉ đi lang thang ngẫu nhiên; hệ thống NPC thật làm ở Phase 3.
- Camera chưa tránh vật cản (camera có thể đi xuyên tường cao).

## Phase 2 — Multiplayer (Colyseus) ✅ (2026-11-26)

- [x] `MatchRoom` (Colyseus 0.18): room code 5 ký tự dễ đọc, tối đa 4 người, khoá phòng khi bắt đầu
- [x] Lobby: tên (đã lọc ký tự nguy hiểm), slot/màu riêng, Ready, HOST, trạng thái kết nối, Người/BOT
- [x] Host START (chỉ host, chỉ khi mọi người thật đã sẵn sàng) → đếm ngược 3s → vào sân; host "Về phòng chờ"
- [x] Chuyển host khi host rời phòng
- [x] Server-authoritative movement: client chỉ gửi intent theo lô (20 msg/s); server mô phỏng 60Hz bằng cùng `stepCharacter`
- [x] Anti-cheat cơ bản: kiểm tra payload, giới hạn độ dài vector, ngân sách bước/tick (không speed-hack được), rate limit theo loại message + kick khi lạm dụng, chặn input sai phase
- [x] Client prediction + reconciliation (làm mượt sai lệch), người khác nội suy trễ 100ms
- [x] Reconnect: rớt mạng → SDK tự nối lại; tải lại trang → nối lại bằng token (giữ chỗ 20s)
- [x] 76 test (unit + integration với server thật); E2E 4 người (3 Chrome + 1 client SDK) qua 15/15 bước, chạy 2 lần liên tiếp
- [x] Docker image cập nhật và đã kiểm tra tạo/vào phòng qua container

### Chưa làm / lưu ý

- NPC tự lấp chỗ trống: Phase 3. Hiện chơi 1 mình vẫn START được (chỉ có 1 nhân vật).
- Người rời hẳn khi đang chơi bị xoá khỏi phòng; Phase 4 sẽ đổi thành "bị loại".
- Room code chỉ đảm bảo duy nhất trong 1 tiến trình server (đủ cho triển khai 1 server).
- Khi FPS rất thấp (< 10) nhân vật của mình đi chậm hơn (giới hạn 6 bước mô phỏng/khung hình để tránh treo).
## Phase 3 — NPC ⏳
## Phase 4 — Match / Round / Elimination ⏳
## Phase 5 — Red Light Green Light ⏳
## Phase 6 — 4 minigame còn lại ⏳
## Phase 7 — Polish, anti-cheat, reconnect, tối ưu ⏳
