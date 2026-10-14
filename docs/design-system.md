# FTUCharm • Design system

Update 14/10/2026 (3D): hero có dải lụa mesh, cánh hoa cong, ngọc trai, hoa Kenney CC0 và khói nhiều lớp; logo giữ ảnh gốc với năm lớp chuyển động độc lập. Route/reveal dùng perspective nhẹ, thẻ dùng pointer tilt; form và quản trị giữ tương tác ổn định. Motion luôn tuân theo dừng/reduced motion/visibility. Xem [sân khấu 3D](stage-3d.md) cho nguồn asset, giới hạn kỹ thuật, ảnh và số liệu đo local.

Update 14/10/2026 (đỏ trầm): thiết kế hiện hành dùng đỏ thương hiệu `#a7090e`, nền `#180609`, section `#290b10`, surface `#3a1017`, chữ `#f5e9e6`, chữ phụ `#cbb4b4`, champagne `#c5a783`. Token màu tập trung tại `apps/web/src/charm2027.css`; các lớp CSS cũ dùng token chung. Playfair Display và Manrope tự host vẫn được giữ. Bảng màu áp dụng cả trang công khai, đăng ký, tài khoản và quản trị. Xem [bàn giao đỏ trầm](crimson-stage.md) cho motion, ảnh kiểm chứng và số liệu hiệu năng. Các bảng màu bên dưới là lịch sử.

Update 14/10/2026: thiết kế hiện hành là FTUCharm (2027), đỏ `#a7090e`, trắng `#ffffff`, nền `#fffafa`, blush `#fbe7e8`, chữ `#321a1b`, chữ phụ `#71585a`. Playfair Display cho thương hiệu, Manrope cho nội dung, font Vietnamese tự host. Các lớp CSS cũ đã được đổi màu trực tiếp; `charm2027.css` định nghĩa token thương hiệu và bố cục mới. Xem [bàn giao 2027](charm2027-handoff.md) cho migration, motion và kiểm thử. Các đoạn bên dưới là lịch sử thiết kế.

Update 13/10/2026: giao diện hiện hành dùng hệ pastel #E88EAD / #FFF9FC, Playfair Display + Manrope, hero FTUCHARM đúng ảnh tham chiếu, Motion và Embla. Token, nguồn component, trạng thái dữ liệu và kiểm thử tại [bản nâng cấp frontend](frontend-upgrade.md). [Báo cáo auth](ui-auth-refresh.md) ghi lần sửa bảo mật trước đó. Phần dưới là lịch sử thiết kế, không phải token hiện hành.

Direction: sân khấu ánh ngọc trai, lavender–hồng–xanh theo banner Lê Phương Nghi người dùng cung cấp. Hero chia hai cột với wordmark serif lớn và vương miện SVG; orbit, ánh sáng và sao tạo chiều sâu. Không thêm thư viện animation. Áp dụng chung cho trang công khai, đăng ký, tài khoản và quản trị.

Colors: canvas #FAF8FF, ink #332644, accent #724081, lavender #DAD9FB, pink #EDBFDF. Nền gradient mềm, chữ tối và CTA tím đậm. Không dùng chữ trắng nhỏ trên nền pastel. Token/overrides ở `apps/web/src/luminous.css`.

Playfair Display / Be Vietnam Pro, self-hosted variable fonts có Vietnamese; display 60–100px desktop / 44px mobile, body >=16px. Spacing 8/16/24/40/64/96. Cấu trúc hero + timeline + spotlight + lời mời, tránh các card đồng nhất ở mọi section.

Motion: chữ xuất hiện theo từ, route fade/translate, section reveal bằng IntersectionObserver, progress theo cuộn khi trình duyệt hỗ trợ, hover/focus và feedback form/menu/modal. Vương miện và sao chuyển động nhẹ; footer có nút dừng chuyển động. `prefers-reduced-motion` hoặc lựa chọn dừng tắt animation, reveal ẩn và cuộn mượt. Screen reader đọc nguyên câu; focus vào nội dung sẽ làm phần đó hiện ngay.

Trang chủ có đủ 11 mốc, tri ân Hoa khôi Duyên dáng Ngoại thương 2025 Lê Phương Nghi bằng banner gốc được nén WebP, và bốn vị trí nhà tài trợ chờ công bố. Không bịa logo hoặc tiểu sử. Thêm logo theo [hướng dẫn](sponsors.md).

Tham khảo bố cục hero, hồ sơ, bình chọn và điều hướng từ [Hoa khôi Sinh viên Việt Nam 2026](https://hoakhoisinhvienvietnam2026.1vote.vn/), [Miss Grand Vietnam](https://missgrandvietnam.1vote.vn/) và [Hoa khôi Sinh viên](https://hoakhoisinhvien.vn/). Thiết kế và code FTUCharm riêng; không lấy dữ liệu thí sinh từ các website tham khảo.

UI UX search có match serif Playfair và pastel; gợi ý Soft UI/SaaS không hoàn toàn phù hợp pageant nên chỉ dùng guidance accessibility, typography, feedback; bản brief quyết định palette và bố cục. Không dùng testimonials khi chưa có chứng thực thật.
