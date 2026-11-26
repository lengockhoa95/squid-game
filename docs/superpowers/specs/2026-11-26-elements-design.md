# Chế độ Nguyên tố — thiết kế

Mục tiêu: vui, hỗn loạn. **Không cân bằng** (người dùng chốt: "vui là được").

## Luồng
- Lobby: host bật/tắt "Chế độ Nguyên tố" (mặc định bật). `MatchState.elementsEnabled`.
- `ROUND_INTRO` / `ROUND_COUNTDOWN`: mỗi người chọn 1 nguyên tố trong danh sách được phép của minigame. Server gán sẵn ngẫu nhiên; NPC giữ lựa chọn ngẫu nhiên.
- `ROUND_PLAYING`: dùng chiêu, hồi chiêu riêng từng nguyên tố. Không giới hạn số lần.
- Điều khiển (chuột là chính):
  - Bấm nút nguyên tố trên HUD. Chiêu cần chỗ ngắm thì bấm tiếp xuống đất để ngắm; chiêu tự dùng thì bắn ngay.
  - Phím **F** dùng chiêu tại vị trí con trỏ.
  - Chuột phải huỷ ngắm.

## 9 nguyên tố
| id | Tên | Ngắm | Hồi | Hiệu ứng (game di chuyển) |
|---|---|---|---|---|
| EARTH | Đất | điểm ≤12m | 5s | Cột đá r=0.9, cao 3m, 4s: chặn mọi người |
| WATER | Nước | điểm ≤12m | 6s | Vũng lầy r=2.2, 4s: người khác đi chậm còn 35% |
| THUNDER | Lôi | điểm ≤14m | 6s | Người gần điểm nhất (≤3.5m) bị choáng 1s |
| WIND | Gió | bản thân | 6s | Thổi văng người trong bán kính 4.5m |
| FIRE | Lửa | bản thân | 7s | Chạy x2 trong 2.5s |
| SWAP | Hoán đổi | điểm (mọi tầm) | 9s | Đổi vị trí với người gần điểm nhất (mọi khoảng cách) |
| CLONE | Phân thân | bản thân | 8s | 2 bản sao giống hệt chạy lung tung 5s |
| BLINK | Không gian | điểm ≤5m | 5s | Dịch chuyển tức thời |
| DARK | Bóng tối | điểm ≤14m | 7s | Người khác trong bán kính 5m bị tối màn hình 2.5s |

Game không di chuyển (chiêu tự chọn mục tiêu, không ngắm):
- Cầu Kính: Lôi, Hoán đổi, Bóng tối.
  - Lôi: một đối thủ ngẫu nhiên bị khoá thao tác 1.5s.
  - Hoán đổi: đổi tiến độ với người dẫn đầu.
  - Bóng tối: mọi đối thủ bị tối màn hình 2s.
- Kéo Co, Phản Xạ Nhanh: Lôi, Bóng tối. Đối thủ là đội kia, hoặc tất cả người khác.

## Kiến trúc
- `shared/src/elements/`
  - Bảng nguyên tố + danh sách cho phép theo game.
  - `effectStep(base, field, status, selfId)`: bọc `StepFn`, dùng chung cho server và client prediction.
    - Choáng: input = 0.
    - Vũng lầy: input × 0.35, trừ chủ vũng.
    - Lửa: bước 2 lần.
    - Cột: đẩy ra sau mỗi bước.
  - Validate message `PICK_ELEMENT` và `CAST`.
- Schema:
  - `PlayerState`: `element`, `elementReadyAt`, `stunUntil`, `hasteUntil`, `blindUntil`.
  - `MatchState`: `elementsEnabled`, `effects: ElementEffect[]` (cột, vũng, bản sao, hiệu ứng tức thời để client vẽ).
- Server:
  - `ElementSystem` xử lý chọn, kiểm tra (phase, còn chơi, hồi chiêu, choáng, tầm), áp hiệu ứng, cập nhật bản sao và xoá hiệu ứng hết hạn.
  - `MatchController` chặn ACTION khi đang choáng.
  - Game không di chuyển có hook `swapPlayers?`.
  - NPC dùng chiêu theo luật đơn giản (`ElementBrain`): nhắm người dẫn đầu, hoặc người ở gần.
- Client:
  - Chọn nguyên tố trong thẻ luật; nút chiêu kèm hồi chiêu trên HUD.
  - `ElementEffectsView` vẽ cột, vũng, sét, gió, dịch chuyển, bản sao, choáng và lửa.
  - Lớp phủ bóng tối (DOM).
  - Âm thanh khi dùng chiêu.

## Kiểm thử
- Unit:
  - `effectStep`: choáng, chậm, nhanh, cột chặn.
  - `ElementSystem`: hồi chiêu, tầm, từng nguyên tố, bị tắt, chiêu không hợp game.
  - Controller chặn action khi bị choáng.
  - Validate message.
- Sim 500 trận vẫn kết thúc đúng (bật nguyên tố).
- E2E: chơi trận có nguyên tố trên Chrome thật.
