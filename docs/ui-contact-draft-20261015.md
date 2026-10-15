# Cập nhật giao diện và bản nháp đăng ký ngày 15/10/2026

## Phạm vi đã hoàn tất

- Làm sáng nhẹ nền đỏ burgundy, giữ nhận diện hiện tại.
- Dãy đối tác dùng lại ảnh gốc với khung cắt rõ ràng, khôi phục đủ chữ trắng UNI; bố cục riêng cho màn hình nhỏ.
- Footer FTUCHARM 2027 có Facebook chính thức, email `ftucharm.duyendangngoaithuong@gmail.com` và hotline `0932197168`.
- Giữ nội dung văn bản và bước của form đăng ký khi xem thể lệ, tải lại hoặc đi đăng nhập trong cùng tab. Đường dẫn xem thể lệ hiện cả trên điện thoại.
- Đăng nhập Google quay lại `/dang-ky`; xử lý callback không tiêu thụ đường dẫn quay lại hai lần trong React StrictMode.

## Quyết định của người dùng về bản nháp

Người dùng xác nhận muốn giữ nội dung trong phiên đang mở, sau đó cho phép: “Cho phép lưu tạm trong sessionStorage của tab, kể cả qua đăng nhập Google; xóa khi gửi xong, đăng xuất hoặc đóng tab”. Quyết định này thay giới hạn cũ cấm lưu bản nháp PII vào browser storage cho riêng form đăng ký.

Bản nháp chỉ lưu các trường văn bản được cho phép, có phiên bản và giới hạn kích thước. Không lưu mật khẩu, token, CAPTCHA, đồng ý điều khoản, file ảnh hoặc mã media. Xóa khi gửi thành công, đăng xuất hoặc đổi tài khoản; sessionStorage có vòng đời theo tab của trình duyệt. Ảnh cần chọn lại sau khi tải lại trang. Khi trình duyệt chặn sessionStorage, form dùng RAM và không bảo đảm giữ qua tải lại/Google. Thông tin về bản nháp được bổ sung trong giao diện và trang quyền riêng tư.

Không đổi kiểm tra lịch đăng ký, quyền truy cập hoặc luồng vé/vote. Không thay schema, secrets hay cấu hình dịch vụ ngoài.

## Kiểm chứng

Lệnh `npm run test:full` hoàn tất với **310 kiểm thử đạt, 4 bỏ qua**:

- Unit/database/browser journey: 227 đạt, 1 bỏ qua vì chưa có PostgreSQL test riêng để kiểm tra nhiều kết nối.
- E2E preview: 57 đạt, 3 bỏ qua theo điều kiện nền tảng.
- E2E official/Auth: 26 đạt, gồm lượt Google PKCE giả lập, quay lại bản nháp và xóa khi đăng xuất.
- Lint, typecheck và build đạt. Build chạy lại sau thay đổi theme-color và aria-hidden cũng đạt.

Báo cáo local: `output/full-qa/2026-10-15T13-04-31-293Z`. Kiểm tra responsive 320px, 390px, 1440px; footer không tràn ngang. Ảnh xác minh ở `output/ui-refresh/`.

Dữ liệu giả chỉ dùng trong test cô lập. Cleanup xác nhận database test đã đóng, không còn media test và không ghi dữ liệu từ xa. Chưa kiểm thử đăng nhập Google thật, CAPTCHA/email hay upload cloud trong lượt này.

Runtime local chính thức đã mở tại frontend `http://127.0.0.1:5173` và API `http://127.0.0.1:8787`. Đọc GET health/program xác nhận `mode=live`, mùa `ftucharm-2027`, đủ 11 mốc; browser tải được timeline Supabase. R2/Images của runtime này là local.

## Bàn giao và hoàn tác

Lựa chọn cuối cùng: người dùng yêu cầu quay về màu trên GitHub. Đã fetch `origin/main` (`09767b3`) và khôi phục nguyên block token màu cùng theme-color/lớp màu hero, halo và finale từ bản đó: nền `#180609`, section `#290B10`, surface `#3A1017`, accent `#4C1922`, màu nhấn `#A7090E`. Gỡ viền nút bổ sung trong lượt đổi màu. Giữ các thay đổi logo, typography, footer và bản nháp đã được yêu cầu. Chỉ đọc màu từ remote, không merge/pull các thay đổi khác. Build và 4 E2E desktop/mobile về WCAG AA tự động/WebGL fallback đạt. Ảnh ở `output/github-colors-restored/home.png`. Chưa push/deploy.

Điều chỉnh tiếp theo theo phản hồi màu quá chói: hạ nền xuống `#900D14`, section `#800B12`, surface `#740A10`, accent `#85121B`; giảm lớp sáng hero, giữ màu nhấn `#A7090E`. Theme-color theo nền mới. Build và 4 E2E desktop/mobile về WCAG AA tự động/WebGL fallback đạt. Ảnh mới ở `output/red-muted/home.png`. Chưa push/deploy.

Lựa chọn màu mới nhất của người dùng thay phương án 04: dùng đỏ `#A7090E` cho nền/chủ đạo toàn website. Token nền và theme-color đổi đúng mã này; section `#90080C`, surface `#7C070A`, accent `#8B070B` giữ cùng sắc đỏ và phân biệt lớp nội dung. Chữ phụ `#FFE3DC`, viền `#E6A79F`; nút chính có viền sáng để nhận diện trên nền đỏ. Hero/finale theo hệ màu mới. Ảnh local ở `output/red-a7090e/home.png`. Chưa push/deploy.

Người dùng chọn phương án màu 04: nền chính đỏ son trầm `#7A1824`. Đã áp dụng cho token toàn trang và theme-color, phối section `#68121E`, surface `#862331`, accent `#962B3B`; làm sáng chữ phụ và viền để giữ độ tương phản. Hero/finale cập nhật lớp màu tương ứng. Build đạt; 8 E2E desktop/mobile về WCAG AA tự động, profile/vote, WebGL fallback và dãy logo đạt. Ảnh giao diện local ở `output/red-option-4/home.png`. Chưa push/deploy.

Cập nhật theo phản hồi mới nhất ngày 15/10: dùng các khung SVG lấy từ ảnh PNG gốc 3000 × 298, giữ nguyên hình/logo và chữ FTUCHARM gốc, bỏ các ô nền. Bộ lọc unsharp nhẹ chỉ tác động hiển thị, không ghi đè nguồn hoặc tái tạo chữ/chi tiết. Desktop giữ một hàng theo thứ tự gốc. Mobile đổi sang ba hàng căn giữa: bốn đơn vị tổ chức; FTUCHARM; COSMO và UNI. Đã bỏ cuộn ngang theo yêu cầu mới. Kiểm thử responsive desktop/mobile đạt, không tràn ngang. Độ nét chữ nhỏ vẫn giới hạn bởi ảnh raster nguồn.

Các thay đổi mới ở working tree local, **chưa commit/push/deploy**. Website online chưa nhận bản này. Có thể hoàn tác riêng các file trong diff của lượt này sau khi lưu bản sao; không cần rollback database vì không thay dữ liệu/schema.
