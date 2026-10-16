# Hiển thị ảnh minh chứng ngay trong Sheet

Yêu cầu tiếp theo: ảnh thu nhỏ hiển thị trong bảng, mở lớn trong Sheet và vẫn có liên kết website. Ảnh được sao chép dưới dạng CellImage vào workbook Hạn chế; người có quyền xem workbook xem được bản ảnh này mà không cần phiên đăng nhập website. Không công khai bucket, lưu bearer vào ô hoặc dùng URL có token để chạy IMAGE().

## Phạm vi

- Bản xem kho mã: cột M của Vé bán kết/Vé chung kết/Vé DEMO hiển thị ảnh thay UUID thuần. UUID ở database và các mã/UUID vé không thay đổi.
- Database hiện hành: cột I hiển thị bản ảnh.
- Khách mua vé: giữ cột I làm UUID/link để không đổi chữ ký, thao tác sửa minh chứng và đồng bộ hai chiều. Cột T thêm ảnh xem; không đổi vị trí 19 cột đang dùng.
- Chỉ ảnh có UUID được API xác thực mới được nhúng. Đơn chưa có ảnh/ảnh lỗi giữ mã và liên kết để thử lại.

## Các thành phần

API `/api/purchase-evidence/:id?view=sheet` giữ kiểm tra Auth/ownership/DEMO hiện có, yêu cầu thêm quyền quản lý vé, trả JPEG giới hạn 1200×1600 và tối đa 2MB, private/no-store. Ảnh WebP gốc giữ nguyên. Thiếu Images binding hoặc chuyển đổi lỗi trả 503, không public ảnh thay thế.

`tools/google-sheets/Code.gs` tái dùng CellImage đã nhúng theo UUID trong alt text, tối đa ba ảnh mới cho mỗi bản xem mỗi lượt để backfill dần. Luồng refresh không ghi đè các ô khách đang sửa; ảnh cột T chỉ phản ánh minh chứng đã đồng bộ. Hai trigger mỗi phút hiện có được giữ; không thêm trigger ghi database.

`tools/google-sheets/ProofViewer.gs` đặt trong project gắn với bảng Data, tách khỏi project đồng bộ độc lập. Chỉ dùng quyền bảng hiện tại và UI, không chứa credentials, đọc Drive khác hoặc gọi API database. Menu Minh chứng → Xem ảnh đang chọn là đường mở lớn trong bảng. Handler chọn ô hỗ trợ tự mở khi môi trường Google cho phép; không coi việc lưu source là đã kiểm chứng thao tác này.

## Kích hoạt và khôi phục

Sau khi API đã deploy đúng commit, lưu Code.gs vào project đồng bộ, giữ Script Properties và trigger. Chạy `enableFtuProofImages()` một lần: hàm kiểm tra API ảnh trước khi bật `FTU_EMBED_PROOFS=true`. Lưu ProofViewer.gs vào project bound của Data; owner cho phép hai scope current-document/UI. Tải lại bảng để xuất hiện menu và handler chọn ô.

Nếu cần khôi phục: xóa riêng thuộc tính FTU_EMBED_PROOFS hoặc đặt false. Refresh kế tiếp trả bản xem nguồn/kho mã về UUID; dữ liệu database không đổi. Cột T là phần ảnh bổ sung; không xóa ảnh gốc, đơn, mã vé hoặc phiếu. Bản sao source cũ giữ trong output local, không đưa Script Properties vào Git.

## Kiểm tra local

293 Vitest đạt, 1 native skip; lint/typecheck/build đạt. Có ca kiểm tra JPEG thật, quyền owner/staff, cache ảnh, giới hạn số lần tải, giữ UUID đầu vào, không đổi background refresh, giới hạn workbook/cột và escape HTML của viewer. Ảnh PNG DEMO đã được nhúng thành công và mở lớn trong hộp thoại Sheet bằng menu; các bước rollout/API thật và thao tác chọn ảnh phải xác minh riêng.
