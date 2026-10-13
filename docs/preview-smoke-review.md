# Kiểm tra bản preview local

Ngày kiểm tra: 13/10/2026. Người dùng yêu cầu kiểm tra bug và mở bản thử sau giai đoạn 02. Lượt này kiểm tra ứng dụng hiện có; không triển khai hoặc đánh X giai đoạn 03.

## Kết quả

- `npm run build:preview`: đạt; dữ liệu fixture được bật qua script hiện có, không sửa cấu hình/secrets.
- Preview chạy tại `http://127.0.0.1:5173`; HTTP 200, có root ứng dụng. Server Node chạy nền ở local, PID lúc khởi chạy `2888`.
- `npm run test:e2e`: **14/14 tests đạt**, hai projects desktop Chrome và mobile iPhone 13 mô phỏng bằng Chromium, thời lượng 28 giây. Dùng browser theo phiên bản Playwright đang cài; không đổi dependencies/lockfile.
- Các ca đã kiểm tra: trang chủ và 11 mốc timeline; tìm/lọc và xem thí sinh demo; validation đăng ký; reduced-motion; vote chưa cấu hình đóng; admin chưa đăng nhập bị chặn; gallery dialog đóng bằng Escape; automated WCAG AA trên năm trang chính; 12 routes public không tràn ngang ở 320px.

Chưa phát hiện lỗi chức năng trong các ca automated trên. Kiểm tra ảnh desktop trang chủ và mobile trang vé không thấy tràn hoặc chồng chữ. Kết quả automated accessibility không thay thế kiểm tra thủ công đầy đủ.

Một điểm cần đồng bộ khi tích hợp giai đoạn 08: trang `/ve` hiện vẫn ghi vé phải được check-in để bình chọn. Đây là nội dung theo luồng legacy, chưa phản ánh contract mới “không cần check-in, một phiếu mỗi vé mỗi hạng mục”. Chưa sửa riêng nội dung này vì API/UI vote vẫn chạy quy tắc legacy; cần đồng bộ lời hướng dẫn cùng hành vi mới. Không coi các test hiện tại là nghiệm thu contract vote mới trên ứng dụng.

## Phạm vi bản thử

Đây là preview giao diện hiện có với dữ liệu minh họa. Giai đoạn 02 mới bàn giao schema bán vé/vote; trang `/ve` chưa có chọn/giữ ghế và checkout, vote chưa dùng contract hạng mục mới trên HTTP/UI. Chưa thử thanh toán SePay, Supabase/Auth/MFA thật, email, check-in camera, tải hoặc contention nhiều connections. Không gửi đăng ký/phiếu/thanh toán thật.

Kết quả Playwright và ảnh kiểm tra lưu ngoài repository trong thư mục `preview-qa` của workspace visualizations. Không thay Word; tiến độ giữ 2/12. Giữ server chạy để người dùng xem; có thể dừng đúng PID nêu trên nếu vẫn là tiến trình Node phục vụ preview.

Lệnh mở trình duyệt mặc định bị công cụ xét duyệt tự động chặn với lý do `blocked by policy`; preview vẫn truy cập được bằng cách bấm URL. Không cố vượt chặn.

## Sửa liên kết trang vé theo phản hồi

Người dùng báo không tìm thấy nút vào trang vé trên menu. Đã thêm `NavLink` “Vé” trỏ `/ve` vào điều hướng chính dùng chung desktop/mobile trong `apps/web/src/App.tsx`, bổ sung title “Thông tin vé”. Footer vẫn có liên kết cũ. Không thêm checkout hoặc triển khai giai đoạn 03.

Build preview mới và ESLint cho file đã sửa đạt. Playwright kiểm tra click từ trang bình chọn sang trang vé ở 1440, 1140, 901, 390 và 320px: route/title đúng, link desktop active, menu mobile tự đóng sau điều hướng, không tràn ngang. Đã xem ảnh desktop 1140px và menu mobile 390px. Các 14 E2E phía trên là kết quả trước sửa liên kết; không ghi chúng thành lần chạy lại sau sửa. Bản preview trên port 5173 đã cập nhật, người dùng tải lại trang để nhận assets mới.
