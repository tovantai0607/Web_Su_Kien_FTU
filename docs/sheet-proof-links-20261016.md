# Mở ảnh minh chứng từ Google Sheets

Ô Minh chứng trước đây chứa UUID thuần nên không mở ảnh khi bấm. Bản sửa thêm liên kết tới `/minh-chung/:id` trên website, giữ nguyên UUID và dữ liệu đơn. Không lưu URL có token, không công khai ảnh hoặc nhúng ảnh private vào Sheet.

Trang ảnh dùng API minh chứng hiện có với bearer của người đang đăng nhập. Người mua hoặc nhân sự có quyền mới xem được; người chưa đăng nhập được dẫn qua đăng nhập rồi trở về đúng ảnh. Đích trở về chỉ nhận UUID, có hạn 30 phút và không nhận URL tùy ý. Không thay quyền API, schema, vé hoặc vote.

Apps Script gắn rich link khi ghi các bản xem kho mã (cột M), Database hiện hành (cột I) và khi thêm dòng Khách mua vé mới (cột I). Không viết đè các ô khách đang chỉnh trong lượt refresh nền. Với dữ liệu cũ, chỉ thêm thuộc tính hyperlink vào định dạng ô, không đổi giá trị, revision hoặc chữ ký đồng bộ. Giữ trigger và OAuth hiện hành.

## Kiểm tra trước triển khai

- Lint, TypeScript và build đạt.
- Vitest: 289 đạt, 1 native test bỏ qua theo môi trường; không có test lỗi.
- Auth/admin E2E: 38 đạt trên desktop/mobile, gồm mở ảnh sau Google login, chặn quyền, quay lại form đăng ký và các chức năng admin hiện có.
- Apps Script hiện hành đã được copy từ editor và đối chiếu khớp source Git trước sửa; source lưu lại được đọc lại khớp bản sửa. Không đọc/sửa Script Properties hoặc cài lại trigger.

## Cách kiểm tra vận hành

Mở bảng Data, tab Vé DEMO, chọn ô Minh chứng của DM00016 rồi bấm liên kết. Đăng nhập tài khoản có quyền nếu trình duyệt yêu cầu. Ảnh phải hiện trên trang Minh chứng chuyển khoản. Liên kết không cấp quyền truy cập cho người nhận; API vẫn kiểm tra quyền.

Sau khi triển khai, đối chiếu Cloudflare build với commit và kiểm tra liên kết còn tồn tại qua ít nhất một lượt tự đồng bộ. Bản ghi DEMO dùng kiểm tra ảnh trước đó là DM00016, không tạo thanh toán thật hoặc đổi dữ liệu LIVE.

## Khôi phục

Khôi phục source Apps Script đã sao lưu trong output local và revert commit ứng dụng nếu cần. Có thể xóa riêng thuộc tính hyperlink của ô; UUID và đơn không bị thay đổi. Không xóa ảnh, vé hoặc đơn để khôi phục giao diện.
