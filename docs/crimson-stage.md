# FTUCharm: giao diện đỏ trầm và sân khấu chuyển động

Ngày bàn giao: 14/10/2026. Phạm vi là frontend và tài liệu; giữ React/Vite, phiên bản thư viện, nội dung, API, database và nghiệp vụ hiện có. Không deploy, không gửi email hay thanh toán thật. Các thay đổi chưa commit có từ trước được giữ lại.

## Design system hiện hành

Token màu có nguồn chung tại `apps/web/src/charm2027.css`. Các lớp `styles.css`, `luminous.css`, `refined.css` dùng token thay cho màu sáng viết trực tiếp; `tickets.css` đồng bộ bề mặt và giữ màu phân loại/trạng thái ghế.

| Vai trò                | Màu                   |
| ---------------------- | --------------------- |
| Thương hiệu, nút chính | `#a7090e`             |
| Nền toàn trang         | `#180609`             |
| Section                | `#290b10`             |
| Card, input, modal     | `#3a1017`             |
| Bề mặt tương tác       | `#4c1922`             |
| Chữ chính / phụ        | `#f5e9e6` / `#cbb4b4` |
| Link nhấn / champagne  | `#f0b8b7` / `#c5a783` |
| Viền input / focus     | `#986d72` / `#e5c69f` |

`--primary` dành cho nền nút; `--rose` là màu sáng hơn dành cho link trên nền tối. `color-scheme: dark` và theme-color đồng bộ với nền. Font Playfair Display / Manrope tự host, có tiếng Việt, giữ nguyên. Thông báo lỗi/thành công dùng cặp nền/chữ riêng; không đổi trạng thái nghiệp vụ. Ảnh tư liệu 2025 được giữ nguyên.

## Logo và chuyển động

- `PartnerStrip` dùng ba cụm ảnh gốc, desktop ba cột và dưới 900px ba hàng. Nền dải đỏ đen đặc, không blur hoặc blend filter. Riêng logo đối tác có nền champagne xám trầm để chữ COSMO nguyên màu vẫn rõ.
- `scripts/prepare-partner-logos.mjs` nhận ảnh 2 nguyên kích thước 1897 × 245. Xóa bằng flood-fill chỉ pixel gần trắng nối với biên từng crop; giữ pixel màu ở foreground và vùng trắng kín bên trong. WebP lossless. Đã kiểm tra cả ba file: **0 pixel màu foreground bị thay đổi**. Ảnh AI thử nghiệm không được đưa vào website vì có thay đổi nét chữ. Nguồn là ảnh chụp nên độ chi tiết vẫn giới hạn bởi ảnh gốc; thay bằng logo vector chính thức khi có.
- `StageParallax` dùng listener passive và requestAnimationFrame để xoay logo theo tiến độ cuộn hero: rotateY tối đa 12°, rotateZ tối đa 8°, nâng tối đa 50px. Cuộn ngược phục hồi góc; không cập nhật React state mỗi frame.
- `RibbonField` dùng shader đỏ/champagne, vùng chữ được giảm sáng. CSS nền tối là fallback nếu GPU bị chặn, shader lỗi hoặc mất context. Không bổ sung thư viện.
- `StageAtmosphere` có 12 cánh hoa, 3 viên ngọc, 2 lớp khói; dưới 900px chỉ hiển thị 5 cánh, 2 viên ngọc, 1 lớp khói. Section giới thiệu và chung kết dùng biến thể nhẹ. Form, tài khoản, quản trị không có lớp trang trí liên tục.
- Lớp trang trí `aria-hidden`, `pointer-events: none`. Animation chạy bằng transform/opacity; blur khói là cố định, không animate filter. Chữ hero xuất hiện bằng opacity/translate, không làm mờ.
- IntersectionObserver và visibilitychange dừng chuyển động ngoài màn hình hoặc khi tab ẩn. Nút footer dừng/bật áp dụng chung. Reduced motion bỏ cánh hoa, canvas và vòng lặp; giữ ngọc/khói tĩnh và toàn bộ nội dung.

## Kiểm chứng

- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run build:preview`: đạt.
- `npm test`: 112 tests / 11 files đạt.
- `npm run test:e2e`: 40 tests đạt, desktop và mobile. Bao gồm luồng cũ, axe WCAG AA tự động ở các trang công khai, form, tài khoản, quản trị bị chặn, chi tiết vé; sáu lượt mới kiểm tra xoay/cuộn ngược, dừng/bật, reduced motion, offscreen, fallback WebGL, logo responsive và click không bị lớp trang trí chặn.
- Kiểm tra ảnh ở 390 / 768 / 1440px: hero, dải logo, toàn trang chủ, form đăng ký có lỗi, đăng nhập. Không tràn ngang; bộ E2E cũ kiểm tra thêm 320px. Bộ kiểm thử không truy cập dashboard quản trị đã đăng nhập thật.
- Ảnh local: `output/qa/crimson-stage-motion.png`, `crimson-hero-{390,768,1440}.png`, `crimson-partners-{390,768,1440}.png`, `crimson-registration-{390,768,1440}.png`, `crimson-account-{390,768,1440}.png`. Tái tạo bằng `node scripts/capture-crimson-preview.mjs` khi preview chạy ở `127.0.0.1:5173`.

## Đo hiệu năng local

Đo bằng script hiện có, Chromium headless, cache tắt, CPU chậm 4 lần, mạng localhost không throttle; motion bật. Trước chỉnh lưu tại `output/qa/crimson-before.json`, sau chỉnh tại `output/qa/crimson-after-performance.json`. Mỗi bảng là một lượt đo, không đại diện field CWV hay khả năng chịu tải.

| Chỉ số           | Desktop trước → sau     | Mobile trước → sau      |
| ---------------- | ----------------------- | ----------------------- |
| LCP              | 924 → 916 ms            | 764 → 808 ms            |
| CLS              | 0.001811 → 0.000130     | 0.001154 → 0.000207     |
| Tác vụ dài nhất  | 196 → 266 ms            | 227 → 230 ms            |
| Dữ liệu resource | 829,589 → 801,702 bytes | 829,589 → 801,702 bytes |
| Lỗi JavaScript   | 0 → 0                   | 0 → 0                   |

Dữ liệu tải giảm 27,887 bytes và layout ổn định hơn trong lượt đo. LCP mobile tăng 44ms; tác vụ khởi tạo desktop tăng 70ms, cần theo dõi khi thử trên thiết bị thật. Không kết luận rằng animation miễn phí hoặc website đã đạt mục tiêu 2.000–3.000 người dùng đồng thời. Tái đo: `node scripts/measure-frontend.mjs crimson-after` khi local preview chạy ở cổng 5173.
