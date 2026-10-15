# Bàn giao sửa trước deploy — 15/10/2026

## Phạm vi và kết quả

Theo hai xác nhận mới: dùng project Supabase hiện tại, chỉ dữ liệu DEMO; lưu minh chứng bằng Supabase Storage và giữ xử lý ảnh an toàn. Không mở bán LIVE, gửi email, test thanh toán thật hoặc load online. Đã đồng bộ Git read/fast-forward lên `3bbb82c`, chưa push/deploy trong lượt này vì main đã nối Cloudflare Builds.

Đã sửa quota Sheet theo tổng700/sớm100/rollover cùng loại và các hold còn hạn, chuẩn hóa lock order; adapter private Storage và function xử lý ảnh an toàn; fence giới hạn API ghi vào DEMO; khóa email môi trường test. Danh sách chi tiết, bằng chứng và phần chưa bật nằm ở `predeploy-test-readiness-20261015.md`.

Sheet trước đó chỉ là bảng mẫu, Apps Script chưa có deployment/trigger/OAuth nên đơn không tự xuất hiện. Đã chụp5 đơn COMPLETED DEMO,11 vé thành6 dòng trên cả hai tab, đủ19 cột; đọc lại toàn bộ giá trị khớp nguồn. Đã chuyển5 ảnh hiện hành lên bucket private, tải lại so hash và xác minh public/anonymous bị chặn. Không cập nhật/xóa dòng đơn, ticket, vote hoặc ảnh local.

## Kiểm tra

- Quota và rollback18/18; tái hiện700→790 đã bị chặn nguyên tử.
- Toàn suite local: **238 tests đạt,1 native bỏ qua;28 files đạt/1 bỏ qua**. Test native cần PostgreSQL loopback55433 chưa chạy; không suy ra đã kiểm chứng race mới bằng nhiều kết nối thật.
- Bổ sung sau full suite: HTTP→SQL4/4, gồm catalog/round/vote DEMO khi homepage giữ mùa chính thức và chặn ghi ngoài scope trước mutation. Test adapter bổ sung bảng publication để chạy truy vấn ảnh thật, không bỏ kiểm tra route.
- `typecheck`, `lint`, Vite build và Worker online-test dry-run đạt. Build còn cảnh báo chunk Three.js>500kB; không hứa hiệu năng/tải chưa đo.
- Function `deno check` và `deno lint` đạt; bộ codec kiểm tra PNG/JPEG thật, metadata, biên12MP, ảnh lỗi; Auth/ownership/DEMO/HMAC/tamper/TTL/size và Storage retry/failure có test.
- Auth/admin/official E2E24/24, desktop/mobile. Public/checkout E2E50/50, desktop/mobile. Đây là local/fixture, chưa phải hosted function/Apps Script.
- Supabase chỉ đọc xác minh bucket private5objects; script copy verify SHA-256 và denied reads; báo cáo chi tiết dưới output bị ignore. Quyền Google Sheet không anyone/domain.

## Các file chính

- `apps/api/src/proof-storage.ts`, `proof-signature.ts`, `demo-scope.ts`, `purchases.ts`, `index.ts`, `security.ts`, `outbox.ts`, `apps/api/wrangler.jsonc`.
- `supabase/functions/ftu-proof-transform/` và `supabase/config.toml`; binary generated bị ignore, dependencies/lockfile khóa phiên bản.
- Migration/rollback `20261015032157_sheet_quota_staging_safety.sql`.
- Scripts prepare/copy proof; regression quota/rollback/codec/handler/storage/DEMO/email/health.

## Thứ tự kích hoạt còn lại

Review/backup/apply ba migration → deploy và smoke Edge Function với WASM → deploy Worker từ bản đã kiểm tra → owner deploy Apps Script/OAuth/trigger → test thêm/sửa DEMO hai chiều và vote DEMO. Không thêm seed/đổi lịch LIVE. Giữ Sheets mutation chưa bật nếu migration/smoke không đạt. Cloudflare rollback chỉ quay Worker, không tự rollback database/ảnh.

Bucket và dữ liệu snapshot đã có thật; tính năng upload online và đồng bộ mỗi phút còn chờ activation. Không đánh thêm X trong Word hoặc ghi production đã nghiệm thu.
