# FTUCharm • Duyên dáng Ngoại thương

Website editorial màu hồng, responsive và reduced-motion; React/Vite/TypeScript + Hono Workers + Supabase. Thiết kế và mã nguồn đã có. **Chưa triển khai production, chưa áp migration lên Supabase từ xa.**

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
2. Đổi Supabase secret đã xuất hiện trong chat. Không có secret thật trong repository. URL/JWKS đã được kiểm tra read-only; API schema `contest_editions` trả 404 ngày 13/10/2026.
3. Áp 3 migration trong `supabase/migrations/` **vào database local/test đã xác định**, rồi chạy kiểm tra RLS/fixtures và review trước khi áp staging. Không seed fixture preview lên production.
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
- Form registration 3 bước, client/server validation, private image sanitize, idempotency + transaction + consent + email outbox; hồ sơ chưa duyệt không công khai. Profile chỉ sửa khi được yêu cầu bổ sung.
- Supabase Auth/PKCE, xác minh email, quên/reset mật khẩu, MFA; RBAC server và dữ liệu riêng tư.
- Quản trị season, cutoff/round, timeline, news, sponsors, xét duyệt, công bố round, check-in và cấp vé thủ công sau khi BTC xác nhận quyền tham dự.
- Bình chọn: đúng mùa/vòng/thí sinh đủ điều kiện, vé thuộc user đã check-in; server clock; unique(round_id,ticket_id); retry cùng lựa chọn idempotent. Vé không đủ điều kiện không được ghi phiếu.
- Email Resend outbox có claim/lease, retry backoff, idempotency provider và HTML escape. Các giá trị cấu hình thiếu sẽ fail closed.

Vé điện tử trong bản này được BTC cấp thủ công; chưa tích hợp payment provider, giữ ghế thanh toán/webhook tự động. Không thể mở bán/thanh toán thật trước khi bổ sung provider và kiểm thử. Gallery hiện minh họa bố cục; cần workflow công bố ảnh chính thức, storage public derivative và quyền tác giả. Không gắn sponsor giả hoặc ảnh người không phải thí sinh.

## Cấu trúc

`apps/web` giao diện, `apps/api` Worker, `packages/ui` components dùng chung, `packages/shared` types/Zod, `supabase/migrations` SQL, `tests` QA, `docs` contracts/operations. Không có module cũ hay code người khác bị ghi đè.

Xem [API](docs/api.md), [security](docs/security.md), [triển khai](docs/deployment.md), [skills](docs/skills-applied.md) và [thiết kế](docs/design-system.md). GitHub Actions chỉ kiểm tra, không deploy. Fanpage được giữ đúng link người dùng cung cấp; nội dung chính thức chưa xác minh do Facebook chặn tự động.
