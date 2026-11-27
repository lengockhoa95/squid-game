# Hướng dẫn kiểm thử

## 1. Kiểm thử tự động

```bash
./scripts/check.sh        # typecheck + unit/integration test + build
npm run sim -- 500        # 500 trận toàn NPC: luôn kết thúc với 1 người thắng, in tỉ lệ thắng
./scripts/dev.sh &        # rồi:
npm run e2e               # Chrome thật: 2 người + 2 NPC (reload, host rời), 1 người + 3 NPC cả trận, chế độ Nguyên tố
node e2e/elements.mjs     # riêng chế độ Nguyên tố; PICKS="Đất,Nước" chọn nguyên tố; server SP_GAMES=RLGL để ép minigame
NO_ELIM=1 node e2e/elements.mjs   # bật chế độ Không bị loại (đủ 5 vòng, bảng điểm)
```

E2E cần Google Chrome (`CHROME_PATH` để đổi đường dẫn, `BASE_URL` để chạy với bản build/Docker,
ví dụ `BASE_URL=http://localhost:8080/ npm run e2e`). Ảnh chụp lưu ở `e2e-shots/`.

Bao gồm: kinematics dùng chung, prediction/reconciliation, nội suy, rate limiter, chống speed-hack,
và integration test `MatchRoom` chạy trên server Colyseus thật (tạo/vào phòng, giới hạn 4 người,
ready/start, khoá phòng, di chuyển, chuyển host, reconnect).

## 2. Test 4 người trên một máy

```bash
./scripts/dev.sh          # server :2567 + client :5173
```

1. Mở **4 cửa sổ riêng** (không phải 4 tab trong cùng cửa sổ — tab nền bị trình duyệt giảm tốc).
   Dùng thêm cửa sổ ẩn danh (Ctrl+Shift+N) hoặc Chrome + Edge để mỗi cửa sổ là một người chơi riêng.
2. Cửa sổ 1: nhập tên → **Tạo phòng** → ghi lại mã phòng 5 ký tự.
3. Cửa sổ 2–4: nhập tên → gõ mã → **Vào phòng**.
4. Kiểm tra:

| # | Bước | Kết quả mong đợi |
|---|---|---|
| 1 | Xem lobby ở cả 4 cửa sổ | Cùng 4 người, cùng thứ tự, có nhãn HOST ở người tạo, chấm xanh "Đang kết nối" |
| 2 | Cửa sổ thứ 5 thử vào cùng mã | Báo "Phòng đã đủ người hoặc trận đấu đã bắt đầu" |
| 3 | Nhập mã sai (VD `ZZZZZ`) | Báo "Không tìm thấy phòng" |
| 4 | Host xem nút Bắt đầu khi chưa ai sẵn sàng | Nút bị khoá "Chờ mọi người sẵn sàng" |
| 5 | Mọi người bấm **Sẵn sàng!** | Nhãn "Sẵn sàng" hiện ở mọi cửa sổ |
| 6 | Host bấm **Bắt đầu** | Cả 4 cửa sổ hiện thẻ luật cùng một minigame, rồi đếm ngược 3‑2‑1 |
| 7 | Chơi (click / WASD / Space) | Nhân vật của mình mượt; người khác thấy đúng vị trí, trễ ≈ 0.1s; cùng đèn/kính/dây |
| 8 | Hết vòng | Cả 4 cửa sổ hiện cùng bảng kết quả; người bị loại thấy banner "đang xem" và click để đổi người xem |
| 9 | Tải lại (F5) một cửa sổ giữa trận | Vào lại đúng trận, đúng nhân vật |
| 10 | Host bấm **Rời phòng** giữa trận | Người đó bị xử thua; người tiếp theo có nút host |
| 11 | Trận kết thúc | Màn người thắng ở mọi cửa sổ, 10s sau về phòng chờ (bot được xoá) |
| 12 | Lặp lại 2–3 trận, bật F3 | Geometries không tăng dần giữa các trận |

### Test 1 người + 3 NPC

Tạo phòng, để NPC = 3 (mặc định), chọn độ khó khác nhau, Sẵn sàng → Bắt đầu. Chơi đến hết trận:
NPC phải tham gia mọi minigame, có thể bị loại và có thể thắng.

## 3. Test qua mạng LAN

Máy chạy server phải cho phép cổng **5173** (dev) hoặc **8080** (Docker) và **2567**.
Người chơi khác mở `http://<IP-máy-chủ>:5173` — client tự kết nối tới `<IP-máy-chủ>:2567`.

> WSL2: Windows không tự mở cổng của WSL ra mạng LAN. Cách đơn giản: chạy bằng Docker Desktop,
> hoặc bật "mirrored networking" cho WSL (`networkingMode=mirrored` trong `.wslconfig`).

## 4. Mô phỏng mạng chậm

Đặt biến môi trường `COLYSEUS_LATENCY=150` (ms, khứ hồi) khi chạy server để thử prediction:

```bash
COLYSEUS_LATENCY=150 npm run dev:server
```
