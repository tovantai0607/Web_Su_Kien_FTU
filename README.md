# FTUCharm • Duyên dáng Ngoại thương

Luồng vé hiện hành đã triển khai theo bổ sung: loại/combo → bảy thông tin → QR → ảnh → Hoàn tất, có quyền vote ngay theo số vé/hạng mục đúng vòng. Mùa2027; giữ quota30 phút; không cap10/đơn hoặc hạn tổng/tài khoản; không chọn ghế/check-in/provider/mail vé tự động. BTC cấu hình giá/quota/QR, bên khác đối chiếu và gửi mail thủ công.

Đọc [nghiệm thu local và API](docs/supplement-acceptance.md), [runbook](docs/supplement-runbook.md), `.agents/skills/ftu-ticket-sales/SKILL.md` và `tiến độn.docx`. Đã đồng bộ đủ chín migration lên Supabase theo yêu cầu ngày14/10/2026; [báo cáo đồng bộ](docs/supabase-sync-20261014.md) ghi tài khoản/cấu hình còn thiếu. DEMO/private storage/Auth test adapter phải được phân biệt với tích hợp thật. Các API/code chọn ghế/payment cũ giữ để bảo toàn lịch sử.

Giao diện mới: nội dung gọn hơn, font Manrope, vương miện ngọc trai và hiệu ứng theo cuộn trên desktop/mobile. Tài khoản có xác minh email, CAPTCHA, MFA, khôi phục/đổi mật khẩu và đăng xuất mọi thiết bị. Xem [báo cáo và cấu hình Auth còn thiếu](docs/ui-auth-refresh.md); bản local hiện vẫn là preview.

Website sân khấu ngọc trai lavender–hồng–xanh, responsive và reduced-motion; React/Vite/TypeScript + Hono Workers + Supabase. **Đã áp đủ 9 migration trên project Supabase chỉ định ngày14/10/2026; chưa triển khai backend production.**

## Chạy bản xem trước

Node 24 (>=22.20), npm.

```bash
npm ci
npm run build:preview
npm run preview
```

Mở http://127.0.0.1:5173. Bản preview dùng fixture được đánh dấu; không gửi/lưu hồ sơ, tài khoản hoặc phiếu thật. `npm run dev` chạy Vite với HMR để chỉnh sửa. Nếu dev server Windows gặp lỗi file font/HMR, dùng bản build preview phía trên.

## Chạy với dịch vụ thật ở local/staging

1. Copy `.env.example` thành `.env.local`. Điền publishable key, Turnstile site key và đặt `VITE_PREVIEW_MODE=false`. Secret chỉ đặt trong `apps/api/.dev.vars` hoặc Workers secret, tuyệt đối không dùng tiền tố VITE_.
2. Đổi Supabase secret đã xuất hiện trong chat. Không có secret thật trong repository. URL/JWKS và API schema `contest_editions` đã kiểm tra HTTP 200 sau migration.
3. Project chỉ định hiện có 44 bảng public với RLS và 9 migration. Tên file đã đồng bộ version trong migration history; không chạy lại CREATE TABLE. Với database mới, áp migration theo thứ tự và kiểm thử trước. `supabase/seeds/staging.sql` là seed cũ cho staging, không import vào project có dữ liệu thật hoặc dùng làm cấu hình mùa2027.
4. Copy `apps/api/.dev.vars.example` thành `.dev.vars` trong thư mục đó. Điền key server mới, origin chính xác, Turnstile hostname/action, Resend domain đã xác minh. Không gửi key trong chat.
5. Thêm R2 private bucket binding `MEDIA` và Images binding `IMAGES` vào Wrangler khi đã tạo tài nguyên đúng account/environment. Upload sẽ từ chối khi thiếu binding, không lưu ảnh chưa sanitize.
6. Tạo tài khoản xác minh email; bật Supabase captcha, email confirmation, password policy và signing key ES256/RS256 (JWKS). Bootstrap SUPER_ADMIN trong môi trường thử bằng SQL quản trị sau khi xác định UUID tài khoản. Sau đó quản trị qua tài khoản MFA aal2.
7. Chạy `npm run build`, `npm run dev:api` và `npm run dev` ở hai terminal. API port 8787; frontend proxy `/api`. Đổi ALLOWED_ORIGIN cho URL dùng thật. Chỉ publish season/round/content và mở registration sau khi thể lệ/privacy được BTC phê duyệt.

Production build mặc định tắt preview kể cả `.env.local` đang dùng preview; `build:preview` tạo riêng `dist-preview`. Dữ liệu preview không được bundle làm dữ liệu chính thức khi mode live.

## Kiểm tra

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx --no-install playwright install chromium
npm run test:e2e
npm run db:test
npm run test:load
```

`test:load` chỉ 400 GET đồng thời vào localhost, không chứng minh tải vote production. PGlite chạy SQL PostgreSQL/migration/invariants bằng một session; không mô phỏng contention từ nhiều connection thật. Xem [báo cáo kiểm tra](docs/verification.md) và [kế hoạch tải](docs/load-test-plan.md).

## Chức năng

- Trang chủ, giới thiệu, 11 chặng timeline, danh sách/tìm/lọc thí sinh, profile công khai, news, gallery/lightbox, sponsor, thông tin vé và privacy/rules.
- Form registration 3 bước dành riêng sinh viên FTU, 3 ảnh hồ sơ và ảnh thẻ sinh viên bắt buộc, client/server validation, private image sanitize, idempotency + transaction + consent + email outbox; hồ sơ chưa duyệt không công khai. Profile chỉ sửa khi được yêu cầu bổ sung.
- Supabase Auth/PKCE, xác minh email, quên/reset mật khẩu, MFA; RBAC server và dữ liệu riêng tư.
- Quản trị season, cutoff/round, timeline, news, sponsors, xét duyệt, công bố round, check-in và cấp vé thủ công sau khi BTC xác nhận quyền tham dự.
- Bình chọn theo bổ sung: đúng mùa/vòng/hạng mục/thí sinh đủ điều kiện, vé từ Hoàn tất thuộc user, không cần check-in; server clock; unique vé/hạng mục; retry cùng lựa chọn idempotent. Vé không đủ điều kiện không được ghi phiếu.
- Email Resend outbox có claim/lease, retry backoff, idempotency provider và HTML escape. Các giá trị cấu hình thiếu sẽ fail closed.

Luồng vé hiện hành mua loại/combo, giữ quota30 phút, hiển thị QR và nhận minh chứng; Hoàn tất lưu thành công cấp vé/quyền vote ngay, email vé do bên khác gửi thủ công. BTC cần cấu hình giá/quota/lịch/QR thật và kiểm thử tích hợp trước mở bán; không cần thêm provider/webhook vào phạm vi bổ sung. Gallery hiện minh họa bố cục; cần workflow công bố ảnh chính thức, storage public derivative và quyền tác giả. Không gắn sponsor giả hoặc ảnh người không phải thí sinh.

Giao diện mới có hiệu ứng chữ, chuyển trang, cuộn, điều khiển dừng chuyển động, tri ân Lê Phương Nghi (2025) và khu logo tài trợ. Xem [cách thêm logo](docs/sponsors.md).

Migration thứ sáu chưa áp remote; cần PostgreSQL 15+. Giai đoạn 02 của người thứ hai đã bổ sung schema bán vé, ghế, giao dịch và vote theo hạng mục cùng kiểm thử database local. Contract mới dùng vé đúng vòng, không cần check-in, một phiếu mỗi vé mỗi hạng mục; phiếu legacy chưa phân loại được bảo toàn và chặn vote mới của vé đó. HTTP/UI mới chưa tích hợp. Khi có cấu hình phiên/hạng mục mới, RPC vote cũ từ chối để tránh áp quy tắc cũ; xem [báo cáo database](docs/database-sales-voting.md) và [kế hoạch người thứ hai](docs/implementation-plan-person-2.md).

## Cấu trúc

Giai đoạn 03 đã có catalog/detail `/ve`, sơ đồ và giữ/giải phóng ghế có TTL qua API/transaction. Xem [bằng chứng và giới hạn](docs/ticket-inventory-stage-03.md). Migration operations thứ bảy cùng migration schema bán vé thứ sáu chưa áp remote trong lượt này. Preview có giá/ghế/lịch minh họa và cho chọn thử; giữ ghế thật cần môi trường live/test đã cấu hình. Checkout/thanh toán chưa triển khai.

`apps/web` giao diện, `apps/api` Worker, `packages/ui` components dùng chung, `packages/shared` types/Zod, `supabase/migrations` SQL, `tests` QA, `docs` contracts/operations. Không có module cũ hay code người khác bị ghi đè.

Xem [API](docs/api.md), [security](docs/security.md), [triển khai](docs/deployment.md), [skills](docs/skills-applied.md) và [thiết kế](docs/design-system.md). GitHub Actions chỉ kiểm tra, không deploy. Fanpage được giữ đúng link người dùng cung cấp; nội dung chính thức chưa xác minh do Facebook chặn tự động.
