# SURVIVAL PARTY

Game web 3D multiplayer (tối đa 4 người, người thật + NPC) gồm nhiều minigame loại trực tiếp.
Three.js + React + Vite (client), Node.js + Colyseus (server), TypeScript toàn bộ.

> Trạng thái: Phase 0–8 xong — chơi được đầy đủ: phòng, lobby, NPC 4 cấp độ, 5 minigame, loại trực tiếp, spectator, người thắng, chế độ Nguyên tố, chế độ Không bị loại, va chạm người chơi, thẻ kỹ năng. Xem [PROGRESS.md](PROGRESS.md).
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
| `SP_GAMES` | server | – (tất cả) | Chỉ chơi các minigame này khi test, ví dụ `SP_GAMES=MAZE,PARKOUR` (RLGL, GLASS_BRIDGE, OBSTACLE_RACE, FLOOR_COLLAPSE, TOWER_CLIMB, MAZE, PARKOUR, ICE_RACE, LUCKY_DOORS, PAINT, ZOMBIE, ROPE_CLIMB, SHARK_SWIM, CASTLE) |

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
| Đèn Xanh – Đèn Đỏ | W để chạy khi đèn xanh, thả phím khi đèn đỏ (đường 80m) |
| Cầu Kính | Mỗi hàng 3 tấm, 1 tấm vỡ khi có người đáp xuống. Đi WASD, nhảy Space sang hàng kế. Mọi người chơi cùng lúc, húc nhau được |
| Vượt Chướng Ngại | WASD để chạy, Space để nhảy qua hố và tường, né khối đẩy và thanh quét |
| Sàn Sụp | 3 tầng gạch; ô vừa đứng lên sẽ sụp. Rơi khỏi tầng cuối là thua |
| Tháp Leo | Nhảy bục xoắn ốc lên đỉnh tháp trước khi dung nham dâng tới |
| Mê Cung | Tìm cổng ra, Minotaur được thả sau 5 giây và đuổi theo, ngày càng nhanh |
| Parkour | Đá nhảy, rào, cầu thăng bằng, bệ bật, búa trượt, băng chuyền, thanh quét, bục di động |
| Đua Băng Trơn | Đường đua uốn khúc trên băng: tăng tốc chậm, phanh không ăn, cua dễ trượt ra ngoài |
| Cửa Thần May Mắn | 8 hàng cửa, mỗi hàng 2 thật 2 giả; đâm cửa giả bị bật ngược, cửa lộ ra cho người sau |
| Sơn Lãnh Thổ | Đi tới đâu sàn đổi màu mình tới đó, cướp ô người khác; ít ô nhất bị loại |
| Zombie Lây Lan | 1 người hoá zombie, chạm ai lây người đó (đổi luôn thành nhân vật zombie); hết giờ còn là người thì qua |
| Leo Dây Nhện | Cầu ván lắc lư nối các bệ cao dần, gió giật ngang từng đợt |
| Vượt Biển Cá Mập | Bơi (chậm hơn đi bộ) từ bãi biển sang đảo; cá mập tuần tra và lao tới đớp, nhảy đôi để né |
| Thủ Thành | Giữ cổng thành trước các đợt quái (slime, xương, dơi), cứ 5 đợt có Rồng boss. Chuột trái để đánh theo tâm ngắm, chuột phải dùng nguyên tố (nguyên tố đánh quái: Lôi choáng, Gió thổi văng, Bóng tối làm quái lạc đường, Hoán đổi đẩy quái về hang…). Quái rớt vũ khí (kiếm, giáo, cung, súng) 4 bậc: Thường, Hiếm, Huyền thoại, Truyền thuyết. Sau mỗi đợt chọn 1 trong 3 thẻ vũ khí (phím 1/2/3); thẻ cấp 3 hoặc vũ khí Truyền thuyết mở chiêu cuối khi đầy Nộ. Chủ phòng chọn số đợt (5/10/15/20) |

Mỗi người chọn nhân vật trong màn chờ (20 nhân vật [Kenney Mini Characters](https://kenney.nl/assets/mini-characters-1), CC0 — cảm ơn Kenney); NPC tự lấy nhân vật chưa ai chọn. Tên người chơi hiện trên đầu nhân vật.

Vũ khí, map lâu đài ([Castle Kit](https://kenney.nl/assets/castle-kit)) và hiệu ứng ([Particle Pack](https://kenney.nl/assets/particle-pack)): Kenney (CC0). Quái vật: [LowPoly Animated Monsters](https://quaternius.itch.io/lowpoly-animated-monsters) của Quaternius (CC0) — cảm ơn Quaternius.

Host tick để bỏ bớt minigame và nguyên tố ngay trong màn chờ (mặc định bật tất cả, luôn còn ít nhất 1 game).

Trong màn chờ có nút **Hướng dẫn chơi** (tự mở ở lần đầu): điều khiển bằng chuột, nguyên tố, thẻ kỹ năng, minigame.

### Va chạm

Người chơi húc được nhau. Chạy vào người khác sẽ đẩy họ đi, nên bị húc lúc đèn đỏ là bị loại.

### Thẻ kỹ năng (bật mặc định, host tắt được)

Đầu trận mỗi người nhận 1 thẻ. Sau mỗi vòng, ở màn kết quả, **click chọn 1 trong 3 thẻ** (người xếp cuối được 4).
Thẻ tự có tác dụng, không cần bấm gì. Chọn trùng thẻ thì lên cấp; **cấp 3 thức tỉnh**: có hiệu ứng đặc biệt, hào quang dưới chân và cả phòng được thông báo.

| Thẻ | Cấp 1 → 2 | Thức tỉnh (cấp 3) |
|---|---|---|
| Chân Thỏ | Nhảy cao +15% → +30% | Nhảy 3 lần |
| Giày Gió | Chạy +8% → +15% | +25%, không bị vũng lầy |
| Da Trâu | Khó bị đẩy, giảm lực gió | Gần như bất động |
| Cú Húc | Húc mạnh ×1.6 → ×2.2 | Húc khi đang chạy làm đối thủ bay lên |
| Mạng Phụ | 1 → 2 mạng mỗi vòng (thoát bị bắt / rơi kính / rơi vực) | 3 mạng, được cứu thì chạy x2 |
| Nạp Nhanh | Hồi chiêu nguyên tố −20% → −35% | −50%, dùng được ngay từ đầu vòng |
| Phản Xạ | Bị choáng ngắn hơn 40% → 70% | Lôi / Hoán đổi / Bóng tối dội ngược người dùng |
| Mắt Thần | Cầu Kính: biết ô vỡ ở hàng 1 → 3 hàng đầu | Biết ô vỡ ở mọi hàng |

### Chế độ Không bị loại (tắt mặc định, host bật trong lobby)

Thua vòng vẫn chơi tiếp. Trận luôn đủ 5 vòng; mỗi vòng cộng điểm theo thứ hạng (4 người: 4/3/2/1 điểm).
Hết trận ai nhiều điểm nhất thắng, bằng điểm thì ai xếp trên ở vòng cuối thắng. Điểm hiện cạnh tên trong danh sách người chơi.

### Chế độ Nguyên tố (bật mặc định, host tắt được trong lobby)

Lúc hiện luật mỗi vòng, chọn 1 trong 9 nguyên tố. Khi chơi, click chuột trái xuống chỗ muốn dùng (hoặc bấm nút nguyên tố góc phải dưới),
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

Mọi minigame đều dùng được cả 9 nguyên tố, trừ những nguyên tố host đã bỏ trong màn chờ. NPC cũng dùng nguyên tố.
Mỗi nguyên tố đổi ngoại hình nhân vật: hình xăm phát sáng trên ngực, vòng xăm ở hai tay và vật thể nhỏ bay quanh đầu (đá, giọt nước, tia sét…).

## Điều khiển

Bàn phím để di chuyển, chuột để dùng nguyên tố và chọn kỹ năng.

| Hành động | Bàn phím | Chuột |
|---|---|---|
| Di chuyển | WASD / mũi tên | — |
| Nhảy | Space (bấm lần 2 trên không = nhảy đôi, lộn mèo) | — |
| Xoay camera | Q / E | Giữ chuột phải + kéo |
| Zoom | + / − | Con lăn |
| Dùng nguyên tố | F (tại con trỏ) | Click trái xuống chỗ muốn dùng (hoặc nút nguyên tố góc phải dưới) |
| Chọn nguyên tố / thẻ | — | Click vào ô / thẻ |
| Thông tin hiệu năng | F3 | nút F3 trên HUD |

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
