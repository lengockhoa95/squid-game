# Số đo hiệu năng

## Số liệu không phụ thuộc phần cứng (đo bằng Chrome headless, 1280×720)

| Preset | Draw calls | Triangles | Geometries | Textures |
|---|---|---|---|---|
| LOW (không bóng) | 30–42 | ~5.3k–5.6k | 16 | 0 |
| HIGH (bóng 2048) | 64–76 | ~8.1k–8.6k | 16 | 2 (shadow map) |

- Số geometry giữ nguyên 16 sau 4 lần vào/ra sân thử → không rò rỉ tài nguyên khi đổi màn.
- Heap JS ~7–10 MB.
- Draw calls ở HIGH tăng do shadow pass (mỗi mesh đổ bóng được vẽ thêm một lần).

## FPS trên máy thật — CẦN ĐO

FPS trong Chrome headless dùng SwiftShader (render bằng CPU) nên **không có giá trị tham khảo**.
Mở game → Vào sân thử → nhấn F3, đi lại 30 giây, ghi FPS thấp nhất / trung bình:

| Máy (CPU / GPU) | Trình duyệt | LOW | MEDIUM | HIGH |
|---|---|---|---|---|
| | | | | |

## Minigame (Chrome headless, 1100×680, preset LOW)

| Màn | Draw calls | Triangles |
|---|---|---|
| Đèn Xanh – Đèn Đỏ | 33–50 | ~1.5k–1.9k |
| Kéo Co | ~24 | ~0.6k |

Geometries giảm khi đổi minigame (15 → 10) và không tăng qua các vòng → view cũ được giải phóng.
