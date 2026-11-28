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

## Phase 8 — Chế độ Nguyên tố ✅

Thiết kế: [docs/superpowers/specs/2026-11-26-elements-design.md](docs/superpowers/specs/2026-11-26-elements-design.md). Không cân bằng (theo yêu cầu: vui là chính).

- [x] 9 nguyên tố: Đất, Nước, Lôi, Gió, Lửa, Hoán đổi, Phân thân, Không gian, Bóng tối; danh sách riêng cho game không di chuyển
- [x] Host bật/tắt trong lobby; chọn lúc hiện luật/đếm ngược; nút HUD + click ngắm hoặc phím F tại con trỏ
- [x] Server quyết định mọi thứ (phase, hồi chiêu, choáng, tầm xa, mục tiêu); hiệu ứng di chuyển dùng chung `effectStep` cho server và client prediction
- [x] NPC dùng nguyên tố theo luật (nhắm người dẫn đầu / người ở gần)
- [x] Hiệu ứng 3D (cột, vũng, sét, vòng gió, dịch chuyển, bản sao, choáng, lửa), lớp phủ bóng tối, âm thanh
- [x] Test: 139 unit/integration; mô phỏng trận bật/tắt nguyên tố; E2E `e2e/elements.mjs` (chọn + dùng chiêu bằng nút và phím F)
- [x] `SP_GAMES` để giới hạn minigame khi test

## Phase 9 — Không bị loại, nhân vật nhỏ, ngoại hình nguyên tố ✅

- [x] Chế độ Không bị loại (host bật/tắt): đủ 5 vòng, điểm theo thứ hạng, bảng điểm cuối trận, điểm trên HUD
- [x] Nhân vật nhỏ lại (×0.75, bán kính va chạm 0.32) và linh hoạt hơn (tăng tốc/phanh nhanh hơn, điều khiển trên không 0.85, tốc độ 6.5)
- [x] Ngoại hình theo nguyên tố: hình xăm ngực + vòng tay + vật thể bay quanh đầu; bản sao Phân thân mang cùng ngoại hình
- [x] Test: 142 unit/integration (mô phỏng trận không bị loại, chọn người thắng khi bằng điểm, toggle qua phòng thật); E2E `NO_ELIM=1 node e2e/elements.mjs`

## Phase 10 — Map lớn hơn, va chạm, thẻ kỹ năng, hướng dẫn ✅

Thiết kế: [docs/superpowers/specs/2026-11-27-collision-cards-design.md](docs/superpowers/specs/2026-11-27-collision-cards-design.md).

- [x] Map lớn hơn:
  - Đèn Xanh – Đèn Đỏ: đường 80m, rộng hơn, 90s.
  - Cầu Kính: 3 tấm mỗi hàng (1 vỡ), số người + 3 hàng, 80s.
  - Vượt Chướng Ngại: thêm nửa chặng sau (hố, 2 tường, 3 khối đẩy, 2 thanh quét, 3 checkpoint), 150s.
  - Kéo Co 45s; Phản Xạ Nhanh 5 lượt.
- [x] Va chạm người chơi: server tách theo khối lượng và truyền lực húc; client prediction coi người khác là vật cản.
- [x] 8 thẻ kỹ năng, 3 cấp, thức tỉnh ở cấp 3 (hào quang + thông báo cả phòng).
  - Chọn thẻ sau mỗi vòng; người xếp cuối được 4 lựa chọn; NPC tự chọn.
  - Host bật/tắt trong lobby.
- [x] Mắt Thần gửi gợi ý riêng (không nằm trong state chung); NPC có Mắt Thần cũng dùng.
- [x] Hướng dẫn chơi trong màn chờ (4 tab, chuột là chính), tự mở lần đầu.
- [x] Sửa:
  - NPC đua bị kẹt trước tường: tự nhảy khi đứng yên.
  - Animation `rise`/`pop` ghi đè transform căn giữa làm overlay giật.
- [x] Test: 158 unit/integration; E2E chọn thẻ + hướng dẫn trong `e2e/elements.mjs`.

## Phase 11 — Game di chuyển mới, chọn game/nguyên tố ✅

- [x] Bỏ Kéo Co và Phản Xạ Nhanh. Thêm 4 game di chuyển:
  - **Sàn Sụp:** 3 tầng 16×16; tầng phía trên nhân vật tự làm mờ.
  - **Tháp Leo:** 42 bục xoắn ốc, có bục trượt và bục ma; dung nham dâng nhanh dần.
  - **Mê Cung:** 15×15 tạo từ seed, có lối vòng; Minotaur tìm đường bằng BFS, nhanh dần; bị bắt thì thua.
  - **Parkour:** 8 loại chướng ngại, 7 checkpoint.
- [x] NPC riêng cho từng game:
  - Sàn Sụp: luôn chạy, nhảy cóc.
  - Tháp Leo: chờ bục ma, nhảy theo khoảng cách.
  - Mê Cung: đi đường ngắn nhất; Khó/Thông minh né Minotaur, có do dự và rẽ nhầm.
  - Parkour: đi theo điểm mốc, nhảy ở mép.
- [x] Host tick bỏ minigame (luôn còn ít nhất 1) và nguyên tố trong màn chờ.
- [x] Camera tự xoay ra sau lưng khi chạy về phía trước (đi ngang thì không xoay).
- [x] Hộp va chạm có mặt dưới (sàn nhiều tầng); nguyên tố và hiệu ứng theo độ cao người dùng.
- [x] Test: 166 unit/integration.

## Phase 12 — Cầu Kính tự do, chuột kiểu bắn súng, nhân vật Kenney ✅

- [x] Cầu Kính thành game di chuyển: đi/nhảy trên kính, đáp xuống tấm vỡ là rơi; mọi nguyên tố dùng được
- [x] Xoay camera bằng chuột kiểu bắn súng (khoá con trỏ, tâm ngắm qua vai), tắt được trong Cài đặt
- [x] Tên người chơi trên đầu nhân vật (cả bản sao Phân thân)
- [x] 20 nhân vật Kenney Mini Characters (glTF, CC0) với animation đứng/đi/chạy/nhảy/ngã/ăn mừng; nhân vật vẽ bằng code là dự phòng khi tải lỗi
- [x] Chọn nhân vật trong màn chờ; NPC tự lấy nhân vật chưa ai chọn; Minotaur là zombie Kenney có sừng
- [x] Test: 166 unit/integration; E2E trận đầy đủ + multiplayer qua với model mới

## Phase 13 — Điều khiển cảm ứng ✅

- [x] Kiểu game bắn súng trên iPad, tự bật trên màn cảm ứng:
  - Nửa trái: cần điều khiển nổi (analog).
  - Nửa phải: vuốt xoay camera, chạm để dùng nguyên tố.
  - Nút: Nhảy và nguyên tố (dùng tại tâm ngắm).
- [x] Đa chạm (vừa đi vừa xoay camera); tâm ngắm luôn hiện; gợi ý cảm ứng thay cho gợi ý bàn phím.
- [x] Máy tính có màn cảm ứng: dùng chuột thì tự quay về điều khiển chuột.

## Phase 14 — 5 game mới ✅

- [x] **Đua Băng Trơn:** đường uốn khúc, thông số trượt riêng; bot nhìn trước theo độ khó.
- [x] **Cửa Thần May Mắn:** cửa giả chỉ server biết; client chỉ va chạm với cửa đã lộ.
- [x] **Sơn Lãnh Thổ:** sàn 24×24 ô, bảng đếm ô trực tiếp.
- [x] **Zombie Lây Lan:** hệ số tốc độ `moveMul` dùng chung cho dự đoán; đổi thân thành zombie Kenney khi bị lây.
- [x] **Leo Dây Nhện:** ván lắc theo sóng, gió giật; tính giống nhau trên server và client.
- [x] Mỗi game có NPC riêng và đã cân bằng bằng `server/scripts/round-check.ts`.
- [x] Test: 172 unit/integration; E2E chơi thử cả 5 game trên Chrome.

## Phase 15 — Nhảy đôi, Vượt Biển Cá Mập ✅

- [x] Ai cũng nhảy đôi được: lần 2 yếu hơn một chút và nhân vật lộn mèo một vòng.
- [x] Thẻ Chân Thỏ thức tỉnh: nhảy 3 lần.
- [x] **Vượt Biển Cá Mập:**
  - Bơi chậm hơn đi bộ; bậc thềm để leo lên đảo.
  - 6 cá mập tuần tra theo làn, lao tới đớp rồi nghỉ.
  - Bot né theo dự đoán vị trí cá mập.
- [x] Test: 173 unit/integration.

## Phase 16 — Thủ Thành ✅

- [x] Quái Quaternius (CC0, FBX): slime, xương, dơi, rồng, kèm thanh máu.
- [x] Chuột phải (hoặc nút "Đánh" trên cảm ứng) để đánh theo hướng nhìn.
  - Vũ khí Kenney cầm trên tay: kiếm, giáo (cận chiến), cung, súng (bắn xa).
- [x] Vũ khí rơi có 4 bậc (Thường, Hiếm, Huyền thoại, Truyền thuyết); đợt sau rơi đồ xịn hơn.
  - Boss rơi đồ Huyền thoại trở lên cho mỗi người.
- [x] Đợt quái tự sinh, chủ phòng chọn 5/10/15/20 đợt; cứ 5 đợt có Rồng boss (bay, đáp xuống, phun lửa).
- [x] Sau mỗi đợt chọn 1 trong 3 thẻ vũ khí: Sức Mạnh, Tốc Đánh, Tầm Xa, Chí Mạng, Rèn Vũ Khí.
  - Thẻ cấp 3 mở chiêu cuối: Địa Chấn, Bão Đạn, Mưa Tên, Thiên Lôi; vũ khí Truyền thuyết có chiêu riêng.
  - Chiêu cuối bắn ra khi thanh Nộ đầy.
- [x] Bot nhặt vũ khí tốt hơn, chọn thẻ, né lửa rồng.
- [x] Test: 177 unit/integration.
- [x] Sửa: vũ khí giờ hiện trên tay (trước đó chưa tải model trong trận) và cầm đúng tư thế.
- [x] Chuột trái đánh theo tâm ngắm (quay lưng vẫn đánh được), chuột phải dùng nguyên tố.
- [x] Nguyên tố đánh quái thay vì người: Lôi, Gió, Bóng tối, Hoán đổi, Đất, Nước, Lửa, Phân thân.
- [x] Map dựng bằng Kenney Castle Kit; hiệu ứng đạn, chém, lửa rồng, tia lửa khi trúng bằng Kenney Particle Pack.
- [x] Cầm vũ khí bằng tư thế "holding-right" của Kenney (tay giơ ra trước), vũ khí gắn đúng nắm tay.
- [x] Tầm đánh xa hơn (kiếm 3.4m, giáo 5m, cung 26m, súng 24m); vệt chém dạng dải cung đặc, đạn có đầu sáng + đuôi chấm sáng.
- [x] Lâu đài nhiều tầng (tháp chính 4 tầng, tháp phụ), tường bao quanh sân thành và hai bên chiến trường.
- [x] Mặt đất cỏ vẽ bằng code + con đường đất từ hang quái tới cổng.
- [x] Map tái sử dụng các game khác:
  - Hào nước có cá mập + 2 cầu gỗ (Vượt Biển Cá Mập).
  - Sàn sụp gần hang quái: quái rơi chết, người rơi mất máu (Sàn sụp).
  - Băng chuyền hai bên + bệ nhảy lên tường thành (Parkour).
- [x] Ra vào cổng thành được (quái vẫn bị chặn), cầu thang đá lên tường, tường/tháp/tháp chính có va chạm.
- [x] Boss xoay vòng: Vua Slime (nhảy dậm, tách slime con) → Minotaur (lấy đà rồi húc) → Rồng; đợt cuối luôn là Rồng.
- [x] Máu người chơi: quái/cá mập/rơi hố làm mất máu, tự hồi máu.
  - Hết máu thì gục; đồng đội đứng cạnh 2 giây để cứu, hoặc tự dậy ở lâu đài sau 15 giây (bị trừ điểm).
- [x] Đổi nguyên tố giữa các đợt (chuột được thả ra để chọn).
- [x] Thẻ mới: Lốc Kiếm, Đạn Nảy, Thương Xuyên Thấu. Quái đông hơn ~1.5 lần.
- [x] Test: 181 unit/integration.

## Hạn chế đã biết

- **FPS trên máy thật chưa đo** — xem [docs/perf/phase1-measurements.md](docs/perf/phase1-measurements.md).
- Trận 4 người thường 2–3 vòng: trận dừng khi còn 1 người; 4–5 vòng chỉ khi có vòng không ai bị loại.
- Điều khiển cảm ứng (iPad/điện thoại) mới thử trên Chrome giả lập iPad, chưa thử trên máy thật; game chưa được deploy lên link công khai.
- Camera chưa tránh tường; khi FPS < 10 nhân vật của mình đi chậm hơn.
- Room code duy nhất trong 1 tiến trình server (đủ cho triển khai 1 server).
- Va chạm ở client dự đoán theo vị trí người khác ở snapshot gần nhất, nên khi chen nhau nhân vật có thể giật nhẹ.
- Gợi ý Mắt Thần mất nếu tải lại trang giữa vòng Cầu Kính.
- Chế độ Nguyên tố cố tình không cân bằng; hiệu ứng tức thời (gió, hoán đổi, dịch chuyển) làm nhân vật của mình giật nhẹ một lần do server sửa vị trí.
- Ở chế độ dev, lần E2E đầu tiên ngay sau khi Vite khởi động có thể lỗi do Vite tự tải lại trang khi tối ưu dependency.
