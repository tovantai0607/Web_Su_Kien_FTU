# FTUCharm 2027 — bản chính thức local

**Cập nhật15/10/2026:** người dùng yêu cầu gộp hai đợt trong cùng hạng vé và cho admin tự chỉnh giá, số vé sớm và lịch. Mốc100/600 cùng ngày bán dưới đây là mặc định ban đầu; tổng700 vé vẫn giữ. Source và migration mới được chuẩn bị/kiểm thử local theo [contract mới](unified-ticket-sale-phases-20261015.md), chưa áp migration/deploy online cho thay đổi này. Kết nối Sheet đã kích hoạt riêng theo [báo cáo](sheet-activation-20261015.md).

Triển khai ngày 14/10/2026 theo kế hoạch được người dùng phê duyệt. Chạy local với Auth/database Supabase thật, Images/R2 local; chưa đưa website lên Internet. Nghiệm thu lịch sử 11/11 local/DEMO và các dữ liệu thử cũ được giữ nguyên.

## Khởi động

```powershell
npm ci
npm run build
npm run dev:official
```

Ở terminal thứ hai chạy `npm run dev -- --strictPort`. Frontend: http://127.0.0.1:5173; API: http://127.0.0.1:8787. `.env.local` phải có `VITE_PREVIEW_MODE=false`; API dùng môi trường `official-local`, `DEMO_MODE=false`, `PUBLIC_EDITION_SLUG=ftucharm-2027` và origin loopback. Secrets chỉ nằm trong file ignored `apps/api/.dev.vars`.

Ảnh chính thức local nằm trong `.wrangler/state/official-local`; không xóa thư mục này. Ảnh thử cũ vẫn nằm trong `.wrangler/state/demo-test`, không di chuyển hoặc xóa. Không dùng `dev:demo-db` để chạy trang chính thức. Cron gửi email không được bật trong môi trường official-local.

## Lịch và quota

Mọi mốc dùng UTC+7; ngày đóng được lưu bằng 00:00 ngày kế tiếp. Đăng ký từ 07/03/2027 đến trước 22/03/2027. Bán kết sớm từ 29/03 đến trước 31/03; vé thường đến trước 25/04. Chung kết sớm 26/04 từ 09:00 đến 11:00; vé thường đến trước 23/05. Bán kết 25/04, chung kết 23/05; giờ tổ chức chưa được suy từ ngày.

Mỗi vòng tổng 700 vé, tối đa 100 sớm, ban đầu 600 thường. BTC phân bổ quota cho từng loại; tổng EARLY/NORMAL bật bán phải bằng 100/600 và có loại thường tương ứng với mỗi loại sớm. Thiếu phân bổ, giá hoặc QR thì chưa nhận đơn dù thông tin đêm thi đã công bố.

Đợt thường bắt đầu khi đủ 100 vé sớm đã Hoàn tất hoặc hết cửa sổ sớm. Hết vé đang giữ là hết khả dụng tạm thời. Vé sớm chưa bán chuyển sang thường cùng loại; giữ còn hạn vẫn chiếm quota và giữ giá cũ. Hết giữ giải phóng quota cho thường. Combo trừ số vé thực tế; tổng bán + giữ còn hạn không vượt 700. Hoàn tất có quyền vote đúng vòng/hạng mục, chưa xác nhận tiền thực nhận. Đơn giữ 30 phút được hoàn tất trong TTL dù cửa sổ nhận đơn mới vừa đóng.

## BTC cấu hình

Theo yêu cầu khôi phục giao diện ngày14/10/2026, link Dự thi và form ba bước luôn hiển thị. Khách có thể xem và chuẩn bị thông tin trước khi đăng nhập/đến ngày nhận hồ sơ; thông tin chỉ giữ trong bộ nhớ trang. Tải ảnh và gửi hồ sơ vẫn yêu cầu Auth và lịch nhận đơn. Ngoài lịch không còn ẩn toàn bộ form. Trang đăng nhập đã tách padding/chiều rộng riêng; kiểm tra ở320,390,758,1280,1920px.

- `/admin?muc=purchase-data` hoặc mục Đợt bán vé ở `/admin/cau-hinh`: chọn đợt LIVE, thêm ba loại với EARLY/NORMAL, điền giá đơn/combo, quota và bật hạng cần bán. Giá khởi tạo trống; không dùng số DEMO cho đợt LIVE. Lịch toàn vòng cố định theo yêu cầu, lịch sản phẩm được chuẩn hóa trên server.
- Đặt QR PNG/JPG/WebP tại `apps/web/public/images/`, điền đường dẫn `/images/...` và hướng dẫn chuyển khoản; build lại để API kiểm tra asset. Không dùng ảnh QR minh họa để nhận tiền.
- `/admin?muc=rounds`: đặt số thí sinh qua vòng (khác số vé), công bố danh sách hợp lệ, chuẩn bị hai hạng mục vote nam/nữ bằng thao tác hiện có. Bán kết để cutoff chưa cấu hình; chung kết giữ cutoff 50 đã có, BTC rà soát trước sử dụng.
- `/admin/cau-hinh`: chọn bán kết, đặt cửa sổ đúng 10 phút trong ngày 25/04. Chỉ SUPER_ADMIN đóng sớm, phải có lý do; không mở lại phiên đã đóng. Giờ vote chung kết chờ BTC; không tự mở vào 23/05.
- `/admin?muc=publications`: chọn thí sinh đã công bố và thuộc vòng, tải ảnh, lưu nháp, xem trước rồi bấm Công bố. Ảnh bán kết dự kiến 10–11/04. Nhà vô địch: nhập hạng mục, chọn thí sinh/ảnh và bấm công bố khoảng 23:00 ngày 23/05; không tự lấy người thắng từ số vote.

SUPER_ADMIN dùng quyền hiện có; CONTENT_EDITOR cần MFA theo chính sách hiện hành và có link vào mục ảnh/vinh danh. Hồ sơ/minh chứng giữ riêng tư; ảnh nháp mới chỉ staff có quyền được đọc. Ảnh công bố trả nội dung đã sanitize, chỉ khi thí sinh/vòng vẫn công khai và hợp lệ.

## Đồng bộ và rollback

Migration `20261014150806_official_program_2027` đã áp lên project `ifgtyslifgegwcguysbb`; local/remote có 13 migration khớp tên và version. Script `tools/configure-official-program-2027.sql` công bố lịch, tạo bán kết, dùng lại chung kết và không tạo giá, đơn, vé, thí sinh hoặc ảnh giả. Script đã thử chạy hai lần trên database test. Migration bổ sung `20261014152549_preserve_closed_rollover` giữ quota rollover sau giờ đóng và sửa record variable khi lưu cấu hình có sản phẩm; không đổi dữ liệu đơn.

Snapshot cấu hình trước thay đổi lưu trong `output/official-before-20261014.json` (ignored). Rollback schema: `supabase/rollbacks/20261014150806_official_program_2027.sql`, đã kiểm thử local; dừng runtime trước khi chạy và lưu snapshot đầy đủ trước mọi rollback thực tế. Script phục hồi hàm cũ, giữ đơn/vé, chuyển dữ liệu công bố sang schema private và giữ các cột bổ sung để phục hồi. Không chạy lại migration sau rollback mà chưa đối chiếu các cột/table được giữ lại.

Nếu cần dừng vận hành, tắt nhận đơn/công bố qua quản trị thay vì xóa dữ liệu. Khôi phục metadata từ snapshot sau khi đối chiếu thay đổi BTC; không chạy rollback trên Supabase tự động.

## Kiểm chứng và giới hạn

Kết quả cuối lượt: 195 unit/database test đạt, một native PostgreSQL test skip; 50 E2E giao diện hiện có và 20 E2E chính thức/Auth/quản trị đạt (18 case trong suite và hai case công bố ảnh chạy riêng). Typecheck, lint, production build và kiểm tra whitespace Git đạt. Các file thay đổi đạt Prettier; `format:check` toàn repository còn 77 file cũ chưa chuẩn định dạng, không sửa ngoài phạm vi. HTTP/browser thật kiểm tra tám trang với Supabase: không preview, không lỗi JavaScript, không tràn ngang; catalog chỉ hai LIVE, DEMO theo slug trả rỗng. Bằng chứng và ảnh ở `output/official-live-qa/`, không chứa thông tin khách hàng. Đọc lại SQL sau hai migration xác nhận RLS/private grants, cấu hình 13 migration, quota và không có đơn chính thức.

Kiểm tra lịch biên, quota/combo/rollover, TTL/retry/giá, quyền đọc/ghi và rollback bằng database local. Browser test dùng API/Auth mock cho thao tác ghi, desktop/mobile và viewport 320px. Kiểm tra Supabase thật qua HTTP/SQL chỉ đọc sau cấu hình; không tạo giao dịch thử trên mùa chính thức hoặc đo tải online.

Giá, QR, địa điểm/giờ, quota từng loại, danh sách/ảnh thật và giờ vote chưa được BTC cung cấp. Runtime hiện thiếu Turnstile secret/site key và Resend key/email sender trong cấu hình local; chưa nghiệm thu gửi hồ sơ/email thực tế. Không bật bypass. Supabase Advisor còn cảnh báo leaked-password protection chưa bật; giữ Auth settings hiện có, tham khảo https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection. Bảng publications bật RLS và không cấp quyền client, chỉ truy cập qua server; INFO không có policy là chủ ý của kiến trúc này.

Build còn cảnh báo chunk Three.js hơn 500 KB. Test PGlite không chứng minh contention nhiều connection hoặc tải production; native PostgreSQL test được skip khi thiếu database test riêng.
