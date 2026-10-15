# Google Sheet đã kết nối online ngày 15/10/2026

Người dùng yêu cầu “kết nối hoàn thành liên kết ngay”, cho phép thực hiện phần kết nối Sheet còn lại sau bàn giao. Phạm vi lần này là migration phục vụ Sheet, OAuth owner và trigger; chưa triển khai bộ xử lý ảnh hoặc tạo đơn/vé/phiếu mới.

## Kết nối và dữ liệu

- Website/API: https://ftucharm-test.bancotaima1235.workers.dev
- Bảng Data: https://docs.google.com/spreadsheets/d/1n6nbwjErwOCsh-auVyOUmVP5jTIRsud45ADYdRhXViU/edit
- Callback owner: https://script.google.com/macros/s/AKfycby0YT1V0FL4W2yqC-goNjZiVCpkd0g7AuyavXJIVTJ6ZTSEP4J3GAxXriSHfuzvnMW1/exec
- Supabase project: `ifgtyslifgegwcguysbb`. API hiện ở chế độ `demo-test`, dữ liệu khách và sửa ngược qua Sheet được giới hạn vào offer DEMO; chưa nghiệm thu bán LIVE.

OAuth đã hoàn thành bằng luồng Google/Supabase PKCE của Apps Script. Callback xác minh email owner và quyền API trước khi lưu phiên vào Script Properties private. Không sao chép token trình duyệt, không đưa secret/service-role vào Script hoặc ô tính. Đã đối chiếu source trong editor với `tools/google-sheets/Code.gs`: giống nhau sau chuẩn hóa xuống dòng.

`installFtuSync` chạy thành công từ 17:10:13 đến 17:11:05 giờ Việt Nam, tạo đúng ba trigger, không trùng:

| Hàm | Lịch |
| --- | --- |
| `syncFtuPurchases` | Mỗi phút |
| `syncFtuTicketCodes` | Mỗi phút |
| `onFtuPurchaseEdit` | Khi chỉnh sửa bảng Data |

Đã thấy Executions của các trigger theo thời gian và chỉnh sửa, không chỉ lượt chạy installer. Có khóa chống chạy chồng; một lượt có thể nhường cho lượt đang chạy. Đây là đồng bộ định kỳ, không cam kết mọi thay đổi xuất hiện chính xác sau 60 giây.

Ví dụ đã hoàn thành: purchases 17:11:29 (43,594 giây), 17:12:29 (13,52 giây), 17:14:29 (11,792 giây); ticket-codes 17:13:50 (28,247 giây); onEdit 17:12:31 (37,171 giây), 17:13:21 (21,74 giây). Cột cập nhật Sheet được đọc lại tới 17:15:37, sau thời điểm installer kết thúc.

## Bằng chứng kiểm tra

- Tám dòng khách, tương ứng sáu đơn COMPLETED/15 vé, đã chuyển từ nhãn bản chụp sang `Đã đồng bộ`; cột cập nhật tiếp tục đổi sau các lượt trigger. `Database hiện hành` đọc được revision hiện tại từ backend.
- Đã sửa trực tiếp ô `Khách mua vé!H2` của đơn DEMO `ffe700e0-1361-443f-8efe-042101a056e5` từ `DEMO` sang dấu thử, rồi khôi phục `DEMO`. Cả hai thay đổi tự lưu vào Supabase qua API có quyền; revision 0 → 1 → 2, có hai operation/audit. Giá trị cuối đã được đối chiếu ở database và tab nguồn. Không đổi số lượng, tài khoản sở hữu hoặc minh chứng.
- Đã đọc lại kho mã: `Vé bán kết` đủ 700 mã BK, `Vé chung kết` đủ 700 mã CK, `Vé DEMO` đủ 50 mã DM, mỗi mã đúng một lần. DEMO gộp thành 44 dòng hiển thị, giữ 15 mã đã cấp/35 chưa cấp. Combo giữ đủ mã thành viên.
- Đã đối chiếu 11 bảng trước/sau: dữ liệu nghiệp vụ giữ nguyên sau khi khôi phục ô thử; riêng revision của đơn thử tăng hai lần đúng thiết kế. Không tạo thêm đơn/vé/phiếu. Có 10 yêu cầu mua tổng cộng khi bắt đầu lượt này, gồm sáu COMPLETED và bốn HELD; không dùng số tám yêu cầu của báo cáo lịch sử làm số hiện hành.
- Folder FTU_DATA và bảng Data vẫn chỉ có owner và người được thêm, không có quyền anyone/domain. Minh chứng vẫn private; Sheet giữ UUID, xem ảnh qua web có quyền.

Ảnh chụp/log kiểm tra được giữ trong `output/computer-callback/` trên máy, không đưa dữ liệu khách hoặc phiên đăng nhập vào Git.

## Migration đã áp và bảo toàn dữ liệu

Đã tạo bản sao lưu phạm vi bảng nghiệp vụ và định nghĩa/quyền hàm, mã hóa Windows DPAPI tại `output/online-activation-20261015/sheet-before.dpapi`; đã kiểm tra giải mã đối chiếu. Đây không phải backup toàn bộ Auth/Storage và chỉ tài khoản Windows tương ứng đọc được.

Hai migration đã áp thành công:

1. `20261014160311_google_sheets_purchase_edits`
2. `20261015032157_sheet_quota_staging_safety`

Lần áp quota đầu tiên bị chặn bởi kiểm tra nguồn do CRLF Windows trong literal đối chiếu; transaction rollback, không tạo history. Đã chuẩn hóa SQL sang LF rồi áp lại, giữ nguyên điều kiện kiểm tra nguồn. MCP sinh version theo giờ chạy; sau khi xác minh thành công đã đối chiếu/đưa đúng hai record history về version của file đã áp. Remote hiện có 16 migration.

Đã kiểm tra guard purchase/ticket và quota còn hoạt động, hàm sửa chỉ cho service_role gọi sau kiểm tra quyền ở backend, authenticated không có EXECUTE, tất cả bảng public vẫn bật RLS. Advisor không có ERROR; cảnh báo Auth password protection và INFO bảng server-only không có policy vẫn là cấu hình hiện hữu, không mở quyền để xử lý cảnh báo.

Còn hai migration về vote chưa áp trong lượt chỉ kết nối Sheet:

- `20261015024905_vote_deadline_closure`
- `20261015081633_demo_vote_leaderboard`

## Cách dùng và giới hạn nghiệm thu

Khách phải **Hoàn tất lưu thành công** ở server thì đơn mới xuất hiện trong lượt đồng bộ kế tiếp. Chọn vé, giữ quota hoặc chỉ chọn ảnh không phải đơn COMPLETED. Đơn HELD không được đưa vào tab khách đã mua.

Sửa thông tin tại `Khách mua vé`; tab `Database hiện hành` và ba tab kho mã là bản xem nguồn. Chờ trạng thái `Đã đồng bộ`; khi có lỗi/revision conflict phải đối chiếu, không xóa hoặc ghi đè lịch sử. Thay ảnh qua Sheet cần upload xử lý an toàn giống website.

**Chưa xác nhận mua mới → upload → Hoàn tất trên online:** Function `ftu-proof-transform` chưa triển khai. Kết nối Sheet đã được kiểm tra với dữ liệu COMPLETED hiện có và chỉnh sửa DEMO; ảnh cũ đọc được không chứng minh upload mới hoạt động. Admin vẫn cần làm phần codec/Storage và kiểm thử đúng một đơn DEMO mới theo `NEXT-STEPS-SHEET-IMAGES.md`. Không báo toàn bộ luồng mua/ảnh/vote online đã nghiệm thu từ kết quả Sheet này.
