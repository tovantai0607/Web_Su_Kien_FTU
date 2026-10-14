# FTUCharm (2027) — bàn giao 14/10/2026

## Phạm vi hoàn thành

- Đỏ #a7090e, trắng và đỏ nhạt trên giao diện public, đăng ký, tài khoản, vé, quản trị. Giữ React 19/Vite, không đổi provider hay nâng dependency.
- Logo người dùng ở header, favicon và hero; dãy logo gốc nằm dưới hero. FTUCHARM có (2027).
- Gỡ Tin tức khỏi trang chủ, menu, footer, router, quản trị và API. Database giữ dữ liệu lịch sử; migration thu hồi quyền đọc công khai và chặn CMS ghi tin mới.
- Hồ sơ `/thi-sinh/:slug` có Tên, Khóa, Lớp, Chiều cao, SBD. Hồ sơ cũ chưa đủ dữ liệu hiển thị “Chưa cập nhật”; không suy đoán giới tính hay chiều cao.
- Form đăng ký và bổ sung hồ sơ có khóa/lớp/chiều cao/hạng mục. Quản trị có mục Thông tin thí sinh để nhập/sửa và cấp SBD, yêu cầu CONTEST_REVIEWER/SUPER_ADMIN và MFA.
- Hai hạng mục Nam/Nữ được yêu thích nhất, link từ hồ sơ chọn đúng hạng mục. Mỗi vé đã check-in được một phiếu mỗi hạng mục mỗi vòng; gửi lại cùng lựa chọn trả lại cùng biên nhận. Vé, vòng, phiên, quyền sở hữu, thời gian và danh sách hợp lệ được kiểm tra phía database.
- Không thay chính sách của các hạng mục cũ chưa có `gender`; các phiếu LEGACY được giữ nguyên. Vòng đã có phiếu cũ cần đối soát trước khi chuyển đổi.

## Thiết kế và chuyển động

Giữ cấu trúc hero chữ bên trái, logo sân khấu bên phải; trên điện thoại xếp dọc. Palette theo yêu cầu người dùng; kết quả tìm kiếm design system không phù hợp nên dùng nguyên tắc accessibility/spacing của UI/UX Pro Max cùng brief, không áp dụng palette SaaS trả về.

Tích hợp mã shader [ThreeUI Ribbon Field](https://github.com/MengTo/threeui/tree/main/src/shaders/ribbon-field) theo MIT, giấy phép tại `docs/licenses/threeui.txt`. Shader đóng gói local, đổi màu đỏ/trắng; không thêm package hay tải runtime ngoài. Renderer giới hạn độ phân giải, ngừng khi ngoài màn hình/tab bị ẩn, giải phóng tài nguyên, có nền CSS dự phòng khi WebGL không có hoặc bị mất context.

Motion chung: chuyển trang, reveal nội dung bất đồng bộ, chữ xuất hiện, đổi thẻ hành trình, tương tác thẻ thí sinh và logo trôi nhẹ. Thay chuyển động cuộn phụ thuộc scroll-timeline bằng StageParallax với requestAnimationFrame. Bỏ transform lưu lại sau route animation để không ảnh hưởng bố cục con. Theo dõi `prefers-reduced-motion` bằng `useSyncExternalStore` và sự kiện matchMedia để phản ứng khi người dùng đổi thiết lập giữa phiên. Nút dừng/bật tác động cả CSS, Motion và WebGL.

Logo tách nền bằng built-in ImageGen; nguồn gốc là ảnh logo do người dùng đính kèm. Asset dùng trong project: `apps/web/public/images/ftucharm-logo-transparent.webp` và `apps/web/public/favicon.png`. Dãy logo gốc được nén WebP thành `apps/web/public/images/partner-logos.webp`. File gốc của người dùng không sửa.

Prompt ImageGen: “Remove ONLY the solid black background from this existing FTUCharm logo, including all black negative spaces between its parts. Preserve the original red and white glossy metallic logo exactly: two four-point diamond stars above two abstract people shapes, identical geometry, proportions, edges, colors and highlights. Do not redesign, draw, stylize, add shadows or add text. Output a faithful isolated logo cutout on a truly transparent alpha background with small clear padding. This is an official brand mark for website use.”

## Database: chờ duyệt production

Người dùng đã xác nhận Supabase là production và yêu cầu **chỉ chuẩn bị migration để duyệt**. Không chạy migration từ xa, không deploy, không gửi email thật.

Migration: `supabase/migrations/20261014100000_charm2027_profiles_categories.sql`.

1. Bổ sung trường hồ sơ nullable cho dữ liệu lịch sử, constraint và quyền đọc từng cột. Không đưa thông tin liên hệ hoặc ảnh thẻ sinh viên vào API công khai.
2. Bổ sung `vote_categories.gender` và unique theo vòng/giới tính. Trigger chống gán sai hạng mục hoặc đổi giới tính sau khi gán danh sách bình chọn.
3. Thêm RPC quản trị hồ sơ, chuẩn bị hai hạng mục, mở phiên 10 phút, bỏ phiếu theo hạng mục; RPC chỉ service_role, quyền quản trị/MFA kiểm tra bên trong function.
4. Chuẩn bị mùa/vòng chung kết 2027 ở dạng nháp nếu chưa có. Nếu đã có mùa 2027, dùng vòng chung kết hiện hữu; không tự đổi thời gian hay trạng thái công bố. Nếu vòng đã bắt đầu nhận phiếu, migration dừng để kiểm tra thủ công. Không tự gán giới tính cho dữ liệu cũ.
5. Thu hồi quyền công khai đối với Tin tức, giữ dữ liệu lịch sử.

Sau khi được duyệt: backup schema/data và ghi nhận phiên bản app đang chạy; áp dụng trên staging được xác định trước, kiểm tra migration history, RLS/permissions và luồng API thực. Triển khai migration trước rồi mới phát hành app/API tương ứng trong thời gian bảo trì ghi dữ liệu. Trước khi mở bình chọn, BTC hoàn thiện hồ sơ, duyệt và công bố thí sinh, công bố mùa/vòng, chuẩn bị hai hạng mục và bấm Mở bình chọn 10 phút. Thiếu người hợp lệ ở một trong hai hạng mục sẽ không mở được.

Rollback vận hành: `supabase/rollbacks/20261014100000_charm2027_profiles_categories.sql`. Chỉ dùng trước khi bình chọn giới tính bắt đầu và sau khi dừng ghi. Khôi phục RPC cũ, quyền News, bỏ cấu hình giới tính chưa sử dụng; giữ trường hồ sơ/dữ liệu mới và mùa nháp. Không reset migration history. Sau khi có phiếu hoặc phiên đã mở, rollback từ chối; dùng migration sửa tiếp có review. Sau rollback vận hành, không chạy lại nguyên migration có các ADD COLUMN; chuẩn bị migration phục hồi riêng.

## Kiểm chứng

Kết quả cuối: **112/112 unit/database**, **34/34 Playwright desktop/mobile**, TypeScript, ESLint, production build, `git diff --check` và secret scan đều qua. Ảnh QA local: `output/qa/desktop.png`, `output/qa/profile-2027.png`, `output/qa/voting-2027.png`.

- TypeScript, ESLint, production build.
- Unit/database bằng PostgreSQL PGlite local, bao gồm migration từ đầu, RLS, phiếu cũ, phiếu từng hạng mục, retry, quyền, thời gian đóng, rollback trước/sau bình chọn.
- Playwright desktop/mobile: hồ sơ, lọc nam/nữ, màu/logo/năm, menu bỏ Tin tức, đăng ký, reduced-motion, dừng/bật/cuộn, WCAG AA tự động, responsive 320px, luồng vé hiện có.
- E2E dùng preview tĩnh riêng ở port 4173 để không dùng nhầm dev server đang chạy/HMR.

PGlite là một phiên database; đây không phải kết quả đo tải 2.000–3.000 người hay kiểm chứng cạnh tranh nhiều kết nối PostgreSQL. Chưa kiểm thử ghi dữ liệu lên Supabase production theo chỉ dẫn người dùng.
