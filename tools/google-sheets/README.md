# Đồng bộ bảng Data với Supabase

Code hiện dùng Auth/RBAC chung của website; không có service-role key trong Sheet hoặc Apps Script. Schema bổ sung và API cần được kiểm tra/apply đúng môi trường trước khi bật đồng bộ. Google Sheet đích: https://docs.google.com/spreadsheets/d/1n6nbwjErwOCsh-auVyOUmVP5jTIRsud45ADYdRhXViU/edit .

## Cấu hình owner

Tạo **standalone Apps Script** do tài khoản SUPER_ADMIN sở hữu, chỉ owner được mở project script; không tạo bound script chia sẻ cùng mọi editor của Sheet. Sao chép `Code.gs` và manifest. Thêm vào Script Properties ba cấu hình không phải server-secret: `FTU_API_BASE_URL` (domain HTTPS của website/API), `FTU_SUPABASE_URL`, `FTU_SUPABASE_PUBLISHABLE_KEY`. Deploy callback web app chỉ cho **owner truy cập**, lưu URL `/exec` ở `FTU_SCRIPT_CALLBACK_URL` và thêm đúng URL đó vào redirect allowlist Supabase sau review. Mở callback và đăng nhập Google bằng tài khoản admin để tạo phiên riêng qua PKCE/Auth chung.

Refresh token của phiên riêng chỉ nằm trong Script Properties của project owner. Không đưa token vào ô, source Git, báo cáo hoặc chat; không sao chép refresh token của phiên trình duyệt thường. Backend xác minh JWT/quyền trên mỗi request. Helper PKCE đã có source, còn cần cấu hình URL và kiểm thử OAuth thật trước activation; chưa tự deploy callback hay đổi allowlist Auth chung.

Trước OAuth có thể chạy riêng `restrictFtuSharing()` để hạn chế chia sẻ thư mục và bảng mà không cần token. Người dùng đã đổi quyền, metadata xác minh không còn chia sẻ bằng link. `installFtuSync()` kiểm tra lại quyền/API/config rồi tạo trigger đọc mỗi phút và xử lý sửa ô. Chạy nền mỗi phút cả khi tab đóng; không cam kết lịch chạy chính xác từng giây vì quota và scheduler Google.

Máy local `127.0.0.1:5173/8787` không được Apps Script Google truy cập. Chưa deploy Worker hoặc bật trigger trong lượt build; cần runtime HTTPS được duyệt và các bindings thật cho ảnh trước nghiệm thu online. Native Sheets connector hiện chưa có thao tác triển khai Apps Script/tạo trigger hoặc thu hồi permission link; chỉ có thể dựng layout mẫu và đọc lại quyền.

## Cách chỉnh bảng

Mỗi dòng là một lựa chọn loại/combo của đơn. Cùng mã đơn có thể có nhiều dòng, UUID ẩn liên kết đúng đơn. Sửa các thông tin chung ở một dòng sẽ được truyền sang các dòng cùng đơn; không đổi UUID, chủ đơn hoặc vòng bằng sửa email. Số lượng cột K là số **vé**: Combo2 phải chia hết2, Combo3 chia hết3. Đổi loại vé theo nhãn hạng/tier đang có trong cấu hình cùng đợt. Không tự tạo/xóa đơn bằng chèn/xóa dòng.

Minh chứng mới: nhập link file ảnh Drive dạng `/file/d/<id>/...` hoặc file ID. Owner script phải đọc được ảnh; chỉ JPG/PNG≤5MB. API kiểm tra ảnh, xử lý WebP và lưu phiên bản mới; ảnh cũ vẫn xem được theo quyền. Cột trạng thái chỉ báo đã đồng bộ khi transaction database thành công. Lỗi quota, số vé đã vote hoặc revision sẽ giữ nguyên database và báo ở dòng.

Tab `Database hiện hành` là nguồn chỉ đọc được cập nhật đầy đủ. `Khách mua vé` là bản chỉnh sửa: job không ghi đè A:L của dòng đã có, không xóa/sắp xếp dòng. Khi database đổi ngoài Sheet, giữ ô hiện có và đánh dấu cần đối chiếu. Owner mở callback web app, nhập UUID đơn, bấm **Xem hai bản**, rồi xác nhận gửi bản chỉnh sửa đã xem. Nếu ô/revision đổi sau preview thì từ chối, cần xem lại. Có thể sửa draft theo tab nguồn trước khi xem/xác nhận; không tự tải lại đè lên người đang gõ. Luồng này có source và unit, chưa nghiệm thu Google thật.

Snapshot lệnh nằm trong tab nội bộ bảo vệ; retry giữ operation ID/payload dù ô đổi sau đó. Chỉ xoay operation sau xác nhận đối chiếu rõ ràng, không gửi mù khi timeout. Revision và khóa ở database bảo vệ trường hợp lệnh cũ vẫn chạy. Giá cũ giữ nếu loại/combo không đổi; loại/combo mới lấy giá cấu hình. Không chuyển đơn thành PAID từ sửa Sheet.

Tải Excel từ Sheets bằng **Tệp → Tải xuống → Microsoft Excel (.xlsx)**. File tải xuống là snapshot, không tiếp tục ghi ngược Supabase. Bản copy Sheet hoặc `.xlsx` cũng không tự nhận quyền tích hợp.

## Trạng thái build và phần chưa nghiệm thu

- Migration/RPC sửa đơn, endpoint đọc phân trang/sửa/stage ảnh đã được thêm để kiểm thử local. Chưa áp migration này lên Supabase thật.
- Layout Sheet được dựng bằng dữ liệu mẫu; folder/bảng hiện chỉ có owner sau khi người dùng hạn chế chia sẻ. Chưa sao chép khách thật.
- Apps Script là source chuẩn bị, chưa deploy/chạy trigger. Khâu OAuth phiên riêng, xung đột chỉnh sửa nhanh trong lúc refresh và giới hạn Google phải được nghiệm thu trước sử dụng thật.
- Không tự bật online, tạo phiên vote, thay CAPTCHA, đổi secret hoặc mở bán LIVE trong lượt này.
