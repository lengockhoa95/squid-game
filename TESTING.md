# Hướng dẫn kiểm thử

## 1. Kiểm thử tự động

```bash
./scripts/check.sh        # typecheck + 76 unit/integration test + build
```

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
| 6 | Host bấm **Bắt đầu** | Cả 4 cửa sổ đếm ngược 3‑2‑1 rồi vào sân |
| 7 | Mỗi người di chuyển (click chuột / WASD / nhảy) | Nhân vật của mình mượt; người khác thấy đúng vị trí, trễ ≈ 0.1s |
| 8 | Tải lại (F5) một cửa sổ đang chơi | Tự vào lại đúng phòng, đúng nhân vật; người khác thấy "Mất kết nối" rồi trở lại |
| 9 | Host bấm **Về phòng chờ** | Mọi người về lobby, trạng thái Sẵn sàng bị xoá |
| 10 | Host bấm **Rời phòng** | Người vào sau đó trở thành HOST |
| 11 | Đóng hẳn một cửa sổ | Sau tối đa 20s người đó biến khỏi danh sách |

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
