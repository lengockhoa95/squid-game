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

## Phase 2 — Multiplayer (Colyseus) ⏳ chưa bắt đầu
## Phase 3 — NPC ⏳
## Phase 4 — Match / Round / Elimination ⏳
## Phase 5 — Red Light Green Light ⏳
## Phase 6 — 4 minigame còn lại ⏳
## Phase 7 — Polish, anti-cheat, reconnect, tối ưu ⏳
