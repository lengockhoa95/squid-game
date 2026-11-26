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
## Phase 3 — NPC ✅

- [x] NPC chạy trên server, không có WebSocket giả; input của NPC đi qua **cùng đường** với người thật (PlayerSim / handlePlayerInput)
- [x] 4 cấp độ (thời gian phản ứng, tỉ lệ sai, độ lệch, tốc độ ≤ người, mức liều) + 3 tính cách + RNG riêng → mỗi NPC chơi khác nhau
- [x] Mỗi minigame có chiến thuật riêng (FSM/rule-based); SMART đọc thời gian còn lại, ô kính đã lộ, lực đội…
- [x] NPC chỉ đọc thông tin công khai (không biết đường kính an toàn)
- [x] Host cấu hình số NPC + độ khó từng NPC; tự lấp khi START; NPC có tên/màu riêng, nhãn BOT

## Phase 4 — Match / Round / Elimination ✅

- [x] `MatchController` + bảng chuyển trạng thái (chặn chuyển sai); chạy theo bước thời gian cố định → mô phỏng được cả trận không cần trình duyệt
- [x] `RoundScheduler`: 3–5 vòng, không lặp game liên tiếp, Kéo Co chỉ khi số người chẵn, ưu tiên game chưa chơi
- [x] `EliminationPolicy`: thua thì loại; vòng cuối còn đúng 1; không bao giờ loại hết; trước vòng cuối giữ ít nhất 2 người
- [x] Spectator (click để đổi người xem), màn kết quả từng vòng, màn người thắng, tự về phòng chờ
- [x] Người rời giữa trận bị xử thua; host rời thì chuyển host

## Phase 5–6 — 5 minigame ✅

Đèn Xanh – Đèn Đỏ · Cầu Kính (cùng lúc) · Vượt Chướng Ngại · Kéo Co · Phản Xạ Nhanh — mỗi game có luật server, NPC strategy, view 3D (tải lazy), HUD, hướng dẫn, đếm ngược, timer, kết quả.

## Phase 7 — Polish / anti-cheat / reconnect / test ✅

- [x] Âm thanh tổng hợp WebAudio (không file), bật/tắt trong cài đặt
- [x] Anti-cheat: kiểm tra payload, phase, người đã bị loại, rate limit + kick, ngân sách bước mô phỏng, thời gian đo ở server, RTT do server đo (không giả được)
- [x] Reconnect giữa trận (rớt mạng / tải lại trang)
- [x] Sửa lỗi kết nối đồng thời (StrictMode / bấm 2 lần) làm mất phiên khi tải lại trang
- [x] Test: 118 unit/integration; mô phỏng 500 trận NPC; E2E Chrome: 4 người lobby, 1 người + 3 NPC cả trận, 2 người + 2 NPC (reload giữa trận, host rời giữa trận) — qua trên bản build, dev và Docker

### Số liệu mô phỏng (500 trận, EASY/NORMAL/HARD/SMART)

Tỉ lệ thắng: EASY 0% · NORMAL 4% · HARD 28% · SMART 68%. Trung bình 2,7 vòng/trận (4 người).

## Hạn chế đã biết

- **FPS trên máy thật chưa đo** — xem [docs/perf/phase1-measurements.md](docs/perf/phase1-measurements.md).
- Trận 4 người thường 2–3 vòng: trận dừng khi còn 1 người; 4–5 vòng chỉ khi có vòng không ai bị loại.
- Chỉ hỗ trợ chuột + bàn phím (chưa có điều khiển cảm ứng).
- Camera chưa tránh tường; khi FPS < 10 nhân vật của mình đi chậm hơn.
- Room code duy nhất trong 1 tiến trình server (đủ cho triển khai 1 server).
- Ở chế độ dev, lần E2E đầu tiên ngay sau khi Vite khởi động có thể lỗi do Vite tự tải lại trang khi tối ưu dependency.
