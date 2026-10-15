# Trước deploy server test online — 15/10/2026

## Cập nhật sau sửa và xác nhận người dùng

Phần kiểm tra ban đầu bên dưới giữ làm lịch sử. Git đã được fetch và fast-forward từ `bb0ed0c` lên `3bbb82c` trước sửa; không clone thêm thư mục, reset/clean hoặc ghi đè thay đổi. Main hiện đã có Worker HTTPS và tự deploy khi push/merge. Trong lượt sửa này **chưa push/main, deploy Worker/Edge Function, chạy migration remote, gửi email hoặc tạo đơn mới**.

Người dùng chọn project hiện tại, chỉ thử dữ liệu DEMO, và chọn Supabase Storage với xử lý ảnh an toàn. Không dùng R2/Images trả phí. Các giới hạn cũ về chưa có URL/không có môi trường online trong phần lịch sử đã được thay bằng `docs/online-test-20261015.md`.

### Đã sửa trong source và kiểm tra local

- Migration `20261015032157_sheet_quota_staging_safety.sql` bổ sung kiểm tra tổng quota, vé sớm, quota từng loại và rollover cùng tên sau khi thay đơn Sheet. Tính cả các đơn đang giữ còn hạn; lock offer → request → tất cả products theo thứ tự → tickets, đồng bộ thứ tự với reserve/complete/config. Không thay ownership, quyền vote, revision/idempotency hoặc audit. Guard từ chối patch nếu function nguồn khác bản đã review. Rollback giữ dữ liệu và từ chối hạ kiểm tra nếu đã có lệnh chỉnh sửa Sheet.
- Regression đã chặn trường hợp700→790; cho phép dùng đúng phần rollover; chặn lấn quota đang giữ và lấy dư vé sớm của loại khác. Suite quota + rollback18/18 đã đạt. Đây là PGlite, chưa phải kiểm tra lock contention nhiều kết nối PostgreSQL native.
- Adapter minh chứng giữ R2 local hiện hữu và thêm Supabase private Storage. Không public URL, không upsert ảnh cũ; đọc qua API sau ownership/RBAC. Hỏng mạng hoặc codec/storage không sẵn sàng thì báo lỗi, không giả thành công.
- Bộ xử lý ảnh DEMO dùng Supabase Edge Function, Magick WASM khóa phiên bản0.0.44: JPEG/PNG≤5MB, decode thật, kiểm tra≤12MP trước pixel cache, một frame, giới hạn tài nguyên, auto-orient, thu nhỏ1600px chiều rộng, strip metadata, WebP. Worker kiểm tra lại WebP. Test ảnh thật gồm đúng12MP và trên12MP. Function phải có chữ ký Worker ràng buộc timestamp/body/JWT/purchase/intent và kiểm tra lại Auth/ownership/role/MFA/scope. Không đưa server key cho Sheet/browser; dùng default secrets có sẵn, không đổi khóa.
- Cấu hình `online-test` thêm `DEMO_TEST_OFFER_SLUG` và fence cho mọi API ghi. Chỉ cho offer/request/round/session DEMO đã chốt đi tiếp qua Auth/RBAC nguyên bản; chặn ghi LIVE và module khác. Catalog/vote đọc đúng scope DEMO; trang giới thiệu vẫn giữ mùa2027. Health phân biệt `demo-test`. Cron vẫn rỗng; `EMAIL_DELIVERY_ENABLED=false` ngăn gửi cả khi vô tình có provider key.
- `deno check` và lint của function đã đạt; Worker `--dry-run --env online-test` đã bundle thành công. Chưa có Docker trên máy để chạy/bundle Supabase Edge Runtime thật; không coi typecheck/WASM Node test là nghiệm thu Edge hosted CPU/RAM.

### Sheet và ảnh DEMO đã xử lý thật

- Nguyên nhân Sheet trống: trước đó mới có layout/mẫu và source Apps Script, chưa deploy/bật trigger/OAuth đồng bộ; đơn trong Supabase không tự xuất hiện trong Google Sheet.
- Truy vấn chỉ đọc xác minh5 đơn COMPLETED DEMO,11 vé,6 dòng loại/combo:4 vé đơn,2 đơn vị Combo2=4 vé và1 Combo3=3 vé. Bảy trường thông tin, evidence/owner/vòng/count khớp, không thiếu dữ liệu theo invariants kiểm tra. Không đưa PII vào báo cáo/Git.
- Đã nhập đủ6 dòng vào hai tab `Khách mua vé` và `Database hiện hành` của bảng Data,19 cột gồm Số lượng combo. Đọc lại toàn bộ19 ô×6 dòng trên mỗi tab khớp dữ liệu nguồn; trạng thái **Đã nhập DEMO — chưa bật tự đồng bộ**. Có kiểm tra bản xuất .xlsx và bố cục; metadata ẩn và cột suy ra vẫn được bảo vệ. Không xóa đơn hay giả trạng thái thanh toán.
- Quyền Drive đã xác minh: owner và một writer cụ thể, không có anyone/domain/link. Không đổi quyền teammate.
- Đã tạo bucket `ftu-demo-proof-private`: private, giới hạn5MB, chỉ image/webp. Script `copy-demo-proofs-to-supabase.mjs` chỉ chọn minh chứng hiện hành của đơn COMPLETED thuộc offer DEMO; đã kiểm tra/chép5 tệp đã xử lý từ R2 local, tải lại so SHA-256, chặn đọc public/anonymous. Metadata bucket/Storage xác minh5 objects. Không sửa purchase/ticket/vote, không xóa hoặc ghi đè ảnh local. Chi tiết hash chỉ nằm trong `output/private-proof-copy/report.json` bị Git ignore.

### Còn phải kích hoạt và nghiệm thu trước dùng online

1. Review/backup rồi áp ba migration chưa có trên remote: Sheets `20261014160311`, deadline `20261015024905`, quota safety `20261015032157`. Chúng sửa function/schema dùng chung, nên chưa tự áp vào project chứa dữ liệu thật trong lượt chuẩn bị trước deploy. Không dùng `db push` thiếu kiểm tra lịch sử/guard/rollback. Sau apply cần kiểm tra quyền/RLS/advisors và đơn/vé không đổi.
2. Chuẩn bị binary bằng `node scripts/prepare-proof-function.mjs`; triển khai/test riêng `ftu-proof-transform` có static WASM bằng CLI Docker bundler. Xem README trong function. MCP/API-only không hỗ trợ static_files; không bỏ kiểm tra ảnh để lách giới hạn. Cần smoke Auth/sai chủ/quá hạn/đổi ảnh/retry/Hoàn tất trên DEMO và đo giới hạn runtime, sau đó mới deploy Worker mới. Bucket và5 ảnh đã có, nhưng website online cũ vẫn chưa được nối adapter này.
3. Owner triển khai standalone Apps Script `tools/google-sheets/Code.gs`, OAuth callback và trigger mỗi phút. Công cụ Drive hiện tại không triển khai Apps Script/tạo trigger được. URL API đã biết; cần owner web-app callback URL thật để thêm vào Supabase redirect allowlist. Chưa có URL này nên không tự thêm wildcard. Nghiệm thu thêm đơn, sửa hai chiều/revision/quota/vé đã vote/thay ảnh/export.xlsx bằng DEMO. Snapshot hiện tại không phải trigger realtime.
4. Tạo/cấu hình phiên vote/thí sinh DEMO để smoke toàn luồng sau kích hoạt; hiện database0 phiên/0 phiếu, không dùng11 vé DEMO cho vòng LIVE. Không thay lịch2027 để test.
5. Native PostgreSQL race và tải online500–1.000 chưa có bằng chứng mới. Không chạy tải lên Supabase/Cloudflare thật; giữ kịch bản local đã duyệt. Chỉ đo online sau khi có giới hạn/ngân sách.

Kết quả kiểm tra cuối cùng của lượt sửa được ghi tại `docs/predeploy-storage-sheet-fixes-20261015.md`. Không báo đã hết lỗi hoặc sẵn sàng vận hành thật khi các mục kích hoạt trên chưa đạt.

## Lịch sử kiểm tra ban đầu (trước sửa, không phải trạng thái hiện tại)

Đối chiếu mã tại `bb0ed0c`, cấu hình Worker và Supabase bằng truy vấn chỉ đọc. Chưa deploy, chạy migration, gửi email hoặc tạo dữ liệu trên database thật. Git trước kiểm tra sạch.

## Lỗi phải sửa trước bật sửa lượng vé qua Sheet

`edit_sheet_purchase` chỉ so `sold_quantity - old_count + new_count + held` với `product.quota`, chưa dùng quota tổng/rollover theo bản chính thức2027. Probe database PGlite độc lập trong `output/staging-quota-probe.test.ts` đã tái hiện:

1. Đợt quota tổng700, vé sớm100/vé thường600.
2. Hoàn tất10 vé sớm; sau khi đợt sớm đóng,90 vé dư chuyển sang vé thường.
3. Hoàn tất690 vé thường: tổng700, đã đầy.
4. Admin sửa đơn sớm từ10 lên100 qua RPC Sheet. RPC vẫn chấp nhận vì loại sớm chưa vượt100, nhưng tổng sold thành **790**, vượt700.

Probe chỉ chạy trong database local tạo mới từ migrations/fixtures; một case đạt theo assertion tái hiện lỗi,13 case không chọn được skip. Đây là bằng chứng lỗi, không phải nghiệm thu quota đạt. Chưa sửa code trong lượt kiểm tra này. Cần thống nhất kiểm tra quota tổng/rollover và khóa transaction với luồng bán vé; thêm regression về tăng/đổi loại/combo và cạnh tranh trước khi bật ghi từ Sheet. Khi chưa sửa, không bật tính năng sửa số lượng/loại/combo trên server test.

## Cấu hình chặn luồng test online

- Chưa có environment staging trong Wrangler. Cấu hình top-level vẫn dùng domain `configure-your-domain.example` và project Supabase chứa dữ liệu thật. Cần chọn runtime/nguồn dữ liệu test, cấu hình origin/domain và tránh ghi nhầm LIVE.
- Top-level chưa có binding MEDIA/IMAGES remote; chỉ hai environment local có R2/Images local. Cần private R2/Images online. Ảnh cũ local phải được bảo toàn/chuyển và kiểm tra trước khi dùng metadata cũ ở server.
- Cần Supabase Auth/frontend config và JWT/JWKS khớp project test, redirect URL HTTPS, Turnstile site/secret/hostname/action đúng; cấu hình khóa server qua secret store. Không đưa khóa server vào VITE/cell/source.
- Supabase hiện13 migration; migration Sheets `20261014160311` và deadline `20261015024905` chưa áp. RPC Sheet và deadline chưa tồn tại trên project thật. Cần review/backup và quyền apply đúng môi trường; không sửa trực tiếp database thật để thử.
- Top-level có cron mỗi phút và gọi outbox chung. Khi test phải tách dữ liệu và giữ mail thật tắt (không cấu hình Resend/email sender thật cho staging); tác vụ hết hạn giữ vé/vote cần kiểm tra riêng. Không thêm chức năng email vé tự động.

## Có thể hoàn tất sau khi có URL HTTPS

- Thiết lập Auth redirect/Turnstile theo hostname chính xác; kiểm tra đăng nhập/role bằng tài khoản test.
- Chạy luồng mua→minh chứng→Hoàn tất→vote bằng dữ liệu giả trên môi trường đã cho phép. Supabase thật hiện0 phiên vote,0 phiếu; hai đợt LIVE đã published nhưng thông số/giờ/thí sinh còn phải cấu hình. Không dùng11 vé DEMO để vote vòng chính thức hoặc thay đổi lịch2027 chỉ để test.
- Deploy Apps Script owner-only, cấu hình URL API, kết nối admin và bật trigger một phút; nghiệm thu cập nhật hai chiều/thay ảnh/xung đột/.xlsx. Script hiện khóa project Supabase cụ thể; nếu chọn project staging khác phải cập nhật kiểm tra project tương ứng có review.
- Chưa có bằng chứng contention PostgreSQL native hoặc tải online500–1.000. Chạy smoke trước; chỉ đo tải online khi có môi trường và ngân sách được duyệt.

215 test trước đó và24 E2E vẫn là kiểm tra local của bản đã bàn giao; không bao phủ tình huống quota Sheet sau rollover vừa phát hiện. Bundle Three.js lớn là việc tối ưu sau smoke, không thay thế các điểm chặn chức năng ở trên.

Tham chiếu provider: [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/) — lưu secret phía server, tách với vars và frontend.
