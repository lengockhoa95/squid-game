# Va chạm người chơi + Thẻ kỹ năng — thiết kế

## Va chạm
- Hai người chơi ACTIVE trong game di chuyển không đi xuyên nhau.
  - Tiếp xúc ở khoảng cách 0.7m, chỉ khi chênh lệch độ cao dưới 1m, nên nhảy qua đầu được.
- Server tách hai người theo "khối lượng" và truyền vận tốc cho người bị húc.
  - Hệ quả: bị đẩy lúc đèn đỏ thì bị loại. Cố ý cho vui.
- Client prediction coi người khác là vật cản tĩnh, lấy vị trí theo snapshot mới nhất.
  - Server đẩy cả hai bên, client chỉ đẩy mình, nên lệch nhỏ. Reconciliation làm mượt phần lệch.

## Thẻ kỹ năng
- **Bật/tắt:** host chỉnh trong lobby, mặc định bật.
- **Đầu trận:** mỗi người nhận 1 thẻ ngẫu nhiên.
- **Sau mỗi vòng** (nếu còn vòng sau):
  - Màn kết quả kéo dài 10s. Người còn chơi được chọn 1 trong 3 thẻ; người xếp cuối vòng được 4 thẻ.
  - Không chọn thì random. NPC chọn ngay.
- **Nâng cấp:** chọn trùng loại thẻ thì lên cấp, tối đa cấp 3. Cấp 3 là **thức tỉnh**:
  - Cả phòng nhận thông báo.
  - Nhân vật có hào quang dưới chân theo màu thẻ.
- **Rút thẻ:** thẻ đã max không ra nữa. Thẻ đang có thì nặng gấp đôi khi rút.

| Thẻ | Cấp 1 / 2 | Thức tỉnh (cấp 3) |
|---|---|---|
| Chân Thỏ | Nhảy cao ×1.15 / ×1.3 | Nhảy đôi |
| Giày Gió | Chạy +8% / +15% | +25% và miễn nhiễm vũng lầy |
| Da Trâu | Khó bị đẩy/thổi (khối lượng 1.6 / 2.5; nhận 65% / 40% lực gió) | Gần như bất động (khối lượng 6; nhận 15% lực gió) |
| Cú Húc | Húc mạnh ×1.6 / ×2.2 | Húc khi đang chạy (>3m/s) làm đối phương bay lên (hồi 1.5s) |
| Mạng Phụ | 1 / 2 mạng mỗi vòng | 3 mạng; được cứu thì chạy nhanh x2 trong 2s |
| Nạp Nhanh | Hồi chiêu nguyên tố ×0.8 / ×0.65 | ×0.5; dùng được chiêu ngay từ đầu vòng |
| Phản Xạ | Bị choáng ngắn hơn (×0.6 / ×0.3) | Chiêu Lôi / Hoán đổi / Bóng tối nhắm vào mình dội ngược người dùng |
| Mắt Thần | Cầu Kính: biết ô vỡ ở 1 / 3 hàng đầu | Biết ô vỡ ở mọi hàng |

**Cách "mạng" hoạt động trong từng game:**
- Đèn Xanh – Đèn Đỏ: thoát bị bắt, miễn nhiễm hết lượt đèn đỏ đó.
- Cầu Kính: kính vẫn vỡ, nhưng mình về lại chỗ cũ.
- Vượt Chướng Ngại: rơi thì hồi sinh tại chỗ đứng cuối cùng, thay vì về checkpoint.

**Mắt Thần:** gợi ý gửi riêng cho người có thẻ. Không đưa vào state chung, để người khác không đọc được. NPC có Mắt Thần cũng dùng gợi ý.

**Kỹ thuật:**
- Chân Thỏ và Giày Gió nằm trong `effectStep` dùng chung.
  - Trạng thái nhảy đôi `airJumped` được đồng bộ để reconciliation khớp.
- Các thẻ còn lại chỉ chạy ở server.
- Lưu trữ:
  - Thẻ: chuỗi `"BUNNY:2,LIFE:1"` trong `PlayerState.cards`.
  - Thẻ đang được đề nghị: `cardOffer`.
  - Số mạng còn lại trong vòng: `lives`.
