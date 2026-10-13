# Local, staging và production

Supabase thử nghiệm đã áp 5 migration ngày 13/10/2026, được người dùng xác nhận chưa có dữ liệu thật. Backend Workers chưa triển khai. `wrangler deploy --dry-run` chỉ kiểm tra bundle/config. GitHub Actions chỉ checks.

## Cấu hình

`wrangler.jsonc` dùng Static Assets + Hono cùng origin. Tên Worker, domain ALLOWED_ORIGIN và account/environment cần chỉnh chính xác. `RATE_LIMITER` có config sẵn; R2 `MEDIA` và Images `IMAGES` chỉ thêm khi BTC cho phép provisioning đúng account:

```json
{
  "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "your-private-staging-bucket" }],
  "images": { "binding": "IMAGES" }
}
```

Không làm R2 private bucket public. Cấu hình staging tách Supabase/R2/key và access control; không dùng dữ liệu production. Biến secret SUPABASE_SECRET_KEY, TURNSTILE_SECRET_KEY, RESEND_API_KEY quản lý bằng secret store; publishable key có thể ở frontend. Các biến TURNSTILE_HOSTNAME, EMAIL_FROM, ALLOWED_ORIGIN phải được điền.

Chạy build/typecheck/test/browser/Worker dry-run; review migration và thông báo privacy; sau approval mới deploy staging, thử registration/auth/MFA/upload/email/vote bằng dữ liệu giả. Production cần approval riêng và xác nhận backup, rollback, alert.

## Migration

5 migration theo thứ tự, có transaction. Version local đã đồng bộ lịch sử remote: 20261013132515, 20261013132526, 20261013132538, 20261013132724, 20261013141222. Dùng migration history tool để không chạy lại CREATE TABLE đã thực thi. Không xóa/reset database để xử lý lỗi. Bản test PGlite chỉ bỏ dòng CREATE EXTENSION pgcrypto (gen_random_uuid builtin); các bảng, constraints, grants, RLS và functions chạy thật trong engine PostgreSQL nhúng.

Seed staging tạo 1 edition nháp, 11 mốc timeline, 3 vòng nháp và 3 danh mục. Không có ngày chính thức; đăng ký và vote đóng. Cutoff 50 là trần tạm thời cho mỗi vòng, phải chỉnh theo chỉ tiêu BTC trước publish. Không tạo tài khoản/thí sinh/vé/phiếu giả. Seed đã kiểm tra chạy hai lần không trùng dữ liệu.

Bootstrap quyền (chỉ database đã xác định): insert user_roles cho UUID của tài khoản quản trị đã xác minh, role SUPER_ADMIN; không đưa UUID thật vào repo. Sau bootstrap cấp/revoke qua endpoint MFA. Người dùng không tự ghi role qua Data API.

Migration ảnh thẻ bổ sung cột và ràng buộc; hồ sơ cũ giữ nguyên, hồ sơ mới phải có ảnh thẻ. Giữ đăng ký đóng cho đến khi frontend và backend hỗ trợ `purpose=student_card` được triển khai cùng nhau.

Mã nguồn còn có migration thứ sáu `20261013143000_ftucharm_sales_voting.sql` được hợp nhất từ main, chưa áp remote. Schema này cho luồng vé/vote theo hạng mục chưa tích hợp API/UI; xem `database-sales-voting.md` trước khi triển khai.

## Rollback

Giữ artifact/Worker version đã pass. Nếu rollback về client trước tính năng thẻ sinh viên, đóng đăng ký trước: RPC mới từ chối hồ sơ thiếu thẻ. Chuẩn bị compensating migration có review nếu thực sự cần hoàn tác quy tắc; không xóa ảnh/hồ sơ. Rollback code không rollback database/R2. Migration ưu tiên additive/backward-compatible; không DROP bảng để rollback; review compensating migration và restore backup vào môi trường riêng trước khi chuyển lại. Tắt registration/vote window đúng quy trình nếu có incident; tránh deploy thay đổi lớn ngay trước chung kết. Monitor outbox retry/failed, auth403, vote409, slow queries/locks, CPU/errors và storage quota.

## Outbox

Cron 1 phút claim 20 jobs/lease, SKIP LOCKED, retry tối đa 6. Resend idempotency key là outbox UUID. Chưa có key/domain thì không gửi. Thời hạn idempotency của provider phải được đối chiếu docs hiện hành; nếu cần guarantee vượt thời hạn đó, thêm delivery record và reconciliation webhook. Chưa tích hợp webhook trạng thái email.

## Nguồn chính thức đã dùng

[Supabase JWT](https://supabase.com/docs/guides/auth/jwts), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Cloudflare Images binding](https://developers.cloudflare.com/images/optimization/binding/), [Rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/), [Static Assets](https://developers.cloudflare.com/workers/static-assets/binding/). Supabase changelog tháng 10/2026 đã được đọc: dùng supabase-js trực tiếp, không dùng framework Hono adapter đã deprecated.
