# Kiểm tra online mua vé, ảnh và đồng bộ Sheet — 16/10/2026

## Môi trường và phạm vi

- Website: https://ftucharm-test.bancotaima1235.workers.dev/.
- Supabase: project `ifgtyslifgegwcguysbb`; chỉ tạo một đơn DEMO và thử sửa thông tin DEMO.
- Bảng Data: https://docs.google.com/spreadsheets/d/1n6nbwjErwOCsh-auVyOUmVP5jTIRsud45ADYdRhXViU/edit.
- Git: `5d0e2b0bc4cd61cc04d3e246af9c0ba393dd2cd7`; fetch đối chiếu local với `origin/main`, không lệch commit. Dùng lại thư mục dự án hiện tại.
- Không chuyển tiền, gửi email, chạy tải, sửa schema hoặc dữ liệu LIVE. Lượt này không thay đổi code ứng dụng.

## Mua một vé mới trên website

Thao tác qua giao diện website bằng tài khoản admin: chọn một vé The Bridge, xác nhận thông tin người mua DEMO, xem QR DEMO cùng đồng hồ 30 phút, chọn ảnh minh chứng và Hoàn tất.

| Kiểm tra | Kết quả đã quan sát |
| --- | --- |
| Hoàn tất đơn trên website | Thành công lúc 16:51:12 ngày 16/10/2026, giờ Việt Nam |
| Mã vé mới | `DM00017`, một vé; đơn `2f58a155-7515-45c8-a67d-d9e009d6d3dc` |
| Database | `purchase_requests.status = COMPLETED`, số lượng 1 |
| Minh chứng | `c3b2a3f8-958d-40ef-8f83-8d235aa6e4fb`, WebP, 29.124 byte |
| Lưu ảnh online | Có object trong bucket private `ftu-demo-proof-private`; bucket không public |
| Thông tin tự lên Sheet | Có tại dòng 11 của `Khách mua vé`, trạng thái Đã đồng bộ; dòng 12 của `Vé DEMO` |
| Ảnh tự lên Sheet | Ảnh thu nhỏ ở `Khách mua vé!T11` và `Vé DEMO!M12` |
| Xem ảnh trong Sheet | Đã mở ảnh lớn ngay trong bảng tại dòng DM00017 |
| Cần bấm chạy đồng bộ thủ công | Không |

Đã đối chiếu lại database sau lượt đồng bộ: đơn vẫn COMPLETED, một vé và cùng UUID minh chứng. Ảnh được chọn trong lần thử được giữ lại để người dùng xem; không suy ra ảnh đã gửi chứng minh tiền thực nhận.

## Thử xóa thông tin DM00012

Người dùng chốt chỉ xóa thông tin ở dòng DM00012, giữ mã vé. Đã xóa giá trị bảy ô `Vé DEMO!F9:L9` (họ tên, trường, khóa/lớp, MSSV, email liên hệ, điện thoại, Facebook), không xóa dòng hay mã vé.

| Kiểm tra | Kết quả |
| --- | --- |
| Bảy ô thông tin ngay sau thao tác | Trống |
| Mã DM00012 | Còn nguyên |
| Supabase nhận thao tác xóa | **Không** |
| Sau lượt đồng bộ nền | Thông tin được tự điền lại từ database |
| Đối chiếu thông tin database trước/sau | Cùng dấu vân tay dữ liệu `34c6c5fdad8f057bdd4e613daa2f57c4` |
| Đơn và số vé | Đơn `bf0900e2-0bcd-4dda-aee6-76d2a194e63f` vẫn COMPLETED, bốn vé |

Giải thích từ source: các tab kho mã `Vé DEMO`/`Vé bán kết`/`Vé chung kết` là bản xem do database cập nhật. Hàm `onFtuPurchaseEdit` chỉ xử lý tab `Khách mua vé`. Sửa/xóa trên tab kho mã không phải lệnh xóa database.

Thông tin người mua thuộc cấp đơn; DM00012 chung đơn với DM00013–DM00015. Không tự chuyển sang xóa thông tin của cả đơn khi người dùng chỉ yêu cầu thử một dòng. Ngoài ra, schema API hiện yêu cầu đủ bảy trường hợp lệ; xóa trống thông tin người mua chưa có luồng nghiệp vụ riêng. Đây là giới hạn hiện hành, không đánh dấu chức năng xóa là đạt.

## Kiểm tra sửa hợp lệ từ Sheet về Supabase

Đã đổi tạm `Khách mua vé!H11` của chính đơn DEMO mới DM00017 từ `DEMO` thành `DEMO-SHEET-SYNC-20261016`. Supabase nhận đúng giá trị, revision tăng từ 0 lên 1, Sheet báo Đã đồng bộ. Số lượng vẫn 1, trạng thái COMPLETED, UUID ảnh và dấu vân tay tài khoản sở hữu không đổi.

Ô được sửa qua Sheets API; không chạy Apps Script thủ công. Đây kiểm tra cả cơ chế nền phát hiện ô thay đổi, không chỉ sự kiện onEdit khi người dùng gõ trực tiếp. Job có hàng đợi và khóa; việc đặt trigger mỗi phút không đồng nghĩa mọi thay đổi hoàn tất trong đúng 60 giây.

Đã khôi phục thành công giá trị gốc `DEMO` ở cả Sheet và Supabase; revision tăng lên 2, Sheet báo Đã đồng bộ. Tab `Vé DEMO` cũng trở về Facebook `DEMO`. Không còn giá trị liên hệ thử. Lịch sử hai lần sửa và revision được giữ để audit.

## Kết luận

- Mua vé DEMO trên website → lưu ảnh riêng tư và thông tin lên Supabase → tự hiển thị dữ liệu/ảnh trong Sheet: **đạt trên một đơn thử**.
- Sửa thông tin hợp lệ tại `Khách mua vé` → Supabase → bản xem kho mã, rồi khôi phục: **đạt**; revision 0 → 1 → 2.
- Xóa thông tin ở dòng DM00012 trong tab `Vé DEMO` → xóa thông tin Supabase: **chưa hỗ trợ**. Database không đổi và bản xem tự khôi phục. Không coi ca này là đã triển khai xóa dữ liệu hai chiều.
- Nếu cần xóa/ẩn danh thông tin người mua thật, phải chốt phạm vi cấp đơn/vé và cách giữ lịch sử. Lượt kiểm tra này không thêm API xóa hoặc thay quy tắc bắt buộc thông tin.

## Bằng chứng và giới hạn

- Báo cáo máy đọc được: `output/online-purchase-sheet-retest-20261016/verification.json` (local, không đưa thông tin riêng tư/credentials lên Git).
- Ảnh màn hình local trong `output/computer-callback/`: `upload-preview-final.png`, `new-order-sheet-native.png`, `customer-new-proof-native.png`.
- Ảnh trong workbook chỉ dành cho người có quyền xem bảng. Không đổi quyền chia sẻ hoặc public bucket để nhúng ảnh.
- Ca mua chỉ dùng một đơn DEMO, không phải đo tải hoặc nghiệm thu toàn bộ tính năng LIVE/vote.
- Ảnh và đơn DEMO được giữ để đối chiếu; không có thao tác xóa vé, phiếu vote hoặc ảnh gốc.
