# Kiểm tra bàn giao • 13/10/2026

## Đã chạy và qua

- ESLint: source frontend/backend/contracts và tests, không lỗi.
- TypeScript 6.0.3 strict: không lỗi. Chọn phiên bản tương thích typescript-eslint, không bỏ qua peer dependencies.
- 69 Vitest tests sau hợp nhất main: contracts, HTTP origin/auth/private routes, upload signature/metadata, email escape/outbox retry, PostgreSQL migrations/RLS, idempotent registration/outbox, thẻ sinh viên thiếu/sai owner/sai purpose/bị dùng lại, MFA/role, window, check-in và vote invariants.
- 16 Playwright tests desktop + mobile (sau redesign): tri ân, ô tài trợ, nút dừng chuyển động, thẻ sinh viên bắt buộc, 11 bước timeline, search/profile, registration validation, chưa có fake success, vote đóng khi chưa cấu hình, admin guard, lightbox/keyboard, reduced motion, WCAG AA automated scan trên trang chủ/đăng ký/thí sinh/vote/admin và 12 routes ở 320px không tràn ngang.
- Vite production build và preview build riêng: thành công. Route bundles lazy. Còn warning initial JS khoảng 698KB uncompressed (~205KB gzip với Supabase SDK); cần profile mobile thật trước vận hành.
- Cloudflare Wrangler bundle `--dry-run`: thành công; không deploy/provision.
- npm audit dependency runtime: 0 vulnerability được registry báo tại thời điểm kiểm tra. Không đồng nghĩa không có lỗ hổng.
- Secret scan: không có server secret/private credential trong các file chuẩn bị commit. `.env.local` được gitignore; secret được cung cấp trong chat không ghi vào repo.
- PostgreSQL nhúng chạy cả 6 migration (chỉ bỏ CREATE EXTENSION pgcrypto trong engine test). 400 user/vé checked-in tạo đúng 400 phiếu; 20 retry một vé cùng lựa chọn có cùng id và chỉ một row; phiếu quá giờ bị chặn. Public và private grants/RLS đã kiểm tra, gồm default EXECUTE grants của Supabase.
- Local HTTP 400 GET burst: 0 lỗi, p95 313ms / p99 318ms trong lần đo. Đây là test localhost public HTTP, không phải benchmark cast-vote production.
- Xem ảnh desktop/mobile thực tế sau render; tối ưu hero PNG 1.929.973 bytes thành WebP 101.132 bytes. Giữ source PNG để tái tạo asset.

## Giới hạn và cấu hình còn phải hoàn tất

Supabase thử nghiệm `ifgtyslifgegwcguysbb`: đã áp 5 migration qua connector, xác minh 23/23 bảng bật RLS, 8 vai trò, 1 edition nháp, 11 timeline, 3 vòng nháp và 3 danh mục. Không có thí sinh/vé/phiếu giả. Migration thứ năm thêm purpose, student_card_media_id và logo_url; đã đối chiếu cột và lịch sử migration trên remote. JWKS và `contest_editions` qua publishable API đều HTTP 200 lúc 20:28 ngày 13/10/2026. Các hàm nghiệp vụ chỉ service_role được gọi. Security advisor không còn WARN/ERROR; 9 INFO về bảng không có policy là chủ đích chặn client, được kiểm tra bằng quyền thực tế. Migration thứ sáu về bán vé/vote theo hạng mục được hợp nhất từ main và kiểm thử local, chưa áp remote (xem database-sales-voting.md). Giao diện preview vẫn dùng fixture; backend live cần cấu hình dịch vụ để nhận hồ sơ và phiếu.

Chưa gửi email Resend thật, chưa thử R2/Images/Turnstile ngoài mocks/local logic, chưa test JWT/MFA end-to-end với account thật hay staging nhiều connection. Chưa có payment provider hoặc checkout/hold-seat/webhook tự động; ticket chỉ cấp/check-in thủ công có quyền. Gallery hình chính thức và metadata seasonal cần BTC cung cấp; các nội dung/privacy/rules dự thảo cần rà soát trước mở đơn.

PGlite là một session PostgreSQL nhúng, không chứng minh contention trên nhiều connection. 400 casts queued không phải 400 người thật cùng đồng thời qua Auth/Turnstile/PostgREST/Workers. Cần [kế hoạch staging load test](load-test-plan.md) trước khi cam kết 300–400 votes burst hay 2.000–3.000 visitors.

Facebook chặn truy cập tự động tới link cung cấp, không dùng nguồn cuộc thi khác để bịa thông tin season này. Không đưa dữ liệu giả thành chính thức.

Chỉ đẩy source code lên GitHub theo yêu cầu; không phát hành website production. Xem [deployment](deployment.md), [security](security.md), [API](api.md) và README cho các bước tiếp theo.
