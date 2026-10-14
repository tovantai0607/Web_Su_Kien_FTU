# Điều chỉnh luồng mua vé ngày 14 tháng 10 năm 2026

Theo yêu cầu mới, màn chọn vé/combo và form người mua được tách riêng. Trình tự hiện tại:

1. Chọn loại vé, số lượng và combo; bấm **Xác nhận vé & combo**.
2. Hiện bảy trường thông tin; bấm **Xác nhận thông tin**.
3. Hiện QR/số tiền/nội dung; bấm **Tiếp tục gửi minh chứng**.
4. Chọn ảnh, xem trước và dùng **Đổi ảnh minh chứng** nếu chọn nhầm; bấm **Hoàn tất**.
5. Chỉ hiển thị thành công/quyền vote khi server trả đơn COMPLETED.

Có nút Đổi vé & combo trước tạo đơn; quay lại giữ lựa chọn. Quota30 phút bắt đầu khi server tạo đơn sau xác nhận thông tin. Focus chuyển đến tiêu đề bước mới; mobile không tràn ngang. QR và upload không hiển thị cùng bước.

Đổi ảnh là đổi file trên máy **trước lần gửi Hoàn tất đầu tiên**. Nếu ảnh đã nhận ở server nhưng lưu Hoàn tất thất bại, retry dùng minh chứng đã nhận; không thay ảnh server hoặc đơn đã Hoàn tất. Không thay schema/API/Supabase trong lượt UI này.

DEMO cho chọn/xem trước/đổi ảnh trên máy, không upload hoặc ghi đơn. Preview đã build lại và đang phục vụ tại http://127.0.0.1:5173/ve/chung-ket-demo.

## Bằng chứng kiểm tra

QR và minh chứng có đồng hồ MM:SS nổi bật, cửa sổ30 phút gồm chuyển khoản/gửi ảnh/Hoàn tất. Đơn thật dùng expires_at và server_time hiện hữu; chuyển bước/retry không đặt lại hạn. DEMO có đồng hồ minh họa; hết giờ ẩn QR/form và yêu cầu Đặt vé lại. Đã kiểm tra riêng bốn bài desktop/mobile: đồng hồ giảm, đi lại qua thông tin/QR/minh chứng không gia hạn, hết30 phút và đặt lại. Không cần sửa database.

- Build preview, TypeScript, lint, format và git diff check đạt.
- Bộ46 E2E: lượt đầu43 đạt, ba timeout ở quét accessibility/3D; chạy lại ba bài đó tuần tự đạt. Các bài luồng vé trên desktop/mobile đạt ngay ở lượt đầu.
- Native PostgreSQL local: luồng năm bước, đổi ảnh, lỗi Hoàn tất/retry, mua rồi vote, concurrency và admin đạt. Đã kiểm tra pixel ảnh WebP lưu trong private storage là ảnh xanh chọn sau cùng, thay ảnh trắng ban đầu. Auth/Images/R2 là test adapter; SQL/HTTP thật local.
- Kiểm tra trực tiếp preview1280px/390px: đúng thứ tự, đổi ảnh đạt, không POST API, không JS error/tràn ngang. Đã xem ảnh chụp giao diện.
- PostgreSQL test đã dừng sau kiểm tra. Preview5173 được giữ để người dùng xem; không gọi database thật hoặc tạo tài khoản.
