# Cấu hình callback Apps Script — 15/10/2026

Người dùng đã tự triển khai Web app, chọn thực thi bằng owner và chỉ owner truy cập; sau đó yêu cầu dùng computer để cấu hình trên hai tab đang mở. Đã thao tác trong cửa sổ Cốc Cốc đăng nhập sẵn bằng Windows UI, không dùng mật khẩu hoặc trích xuất cookie/token.

URL callback do người dùng cung cấp:

`https://script.google.com/macros/s/AKfycby0YT1V0FL4W2yqC-goNjZiVCpkd0g7AuyavXJIVTJ6ZTSEP4J3GAxXriSHfuzvnMW1/exec`

## Đã lưu và xác minh

- Apps Script FTU Đồng bộ vé: thêm thuộc tính `FTU_SCRIPT_CALLBACK_URL`; giữ ba thuộc tính URL API/Supabase/publishable key. Tải lại trang, mở chế độ sửa để đọc đúng trường, đối chiếu toàn bộ112 ký tự khớp URL trước khi kết thúc. Không đọc/lưu refresh token.
- Supabase project `ifgtyslifgegwcguysbb`: thêm đúng một URL redirect, không wildcard. Có thông báo Successfully added1URL; tải lại xác nhận tổng5 URL, gồm callback mới và4 URL website/local/reset-password cũ. Site URL giữ nguyên.
- Bằng chứng ảnh thao tác và helper nằm trong `output/computer-callback/` bị ignore, không đưa ảnh chứa thông tin tài khoản lên Git.
- Thao tác nhập URL qua phím từng ký tự ở Supabase ban đầu bị kiểm tra phát hiện sai trước khi lưu. Đã thay bằng paste nguyên chuỗi, sao chép/so khớp chính xác rồi mới Save; không lưu URL sai. Giá trị Apps Script đã được đối chiếu sau reload.

## Chưa thực hiện

Chưa đăng nhập OAuth phiên tích hợp, chưa chạy `installFtuSync`, chưa tạo trigger hoặc xác nhận Sheet tự cập nhật. Backend online mới/ba migration pending và Edge xử lý ảnh còn chờ kích hoạt được duyệt; không deploy/push/migration, thay key, gửi email hoặc tạo đơn/vote mới trong lượt cấu hình callback.

Google provider được đọc xác minh đã bật ở lượt kiểm tra trước. Callback thiếu xác thực chuyển đến đăng nhập Google, phù hợp Web app private; không dùng đáp ứng302 này để khẳng định đã đăng nhập ứng dụng hoặc đồng bộ thành công.
