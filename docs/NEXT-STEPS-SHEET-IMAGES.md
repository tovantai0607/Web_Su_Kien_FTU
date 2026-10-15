# Việc cần làm tiếp: ảnh online và Google Sheet tự cập nhật

**Cập nhật sau kích hoạt Sheet15/10/2026:** OAuth owner và ba trigger đã hoạt động, sáu đơn/15 vé đã tự đồng bộ; sửa/khôi phục một ô DEMO đã ghi ngược Supabase. Hai migration Sheets/quota đã áp, remote16; còn deadline/BXH vote pending. Xem [bằng chứng kích hoạt](sheet-activation-20261015.md). Các trạng thái trước gộp và bước D bên dưới được giữ làm lịch sử/runbook; không chạy lại installer/migration đã áp. Bộ xử lý upload mới vẫn chưa triển khai và chưa có nghiệm thu mua mới online.

Cập nhật15/10/2026 theo yêu cầu gộp nhánh `codex/ticket-code-sheets-sync-20261015` vào `main`. Push main kích hoạt Cloudflare Builds, nhưng không tự chạy migration, deploy Supabase Function, kết nối Google hoặc tạo trigger. Các bước dưới đây do admin sở hữu dịch vụ thực hiện; không dùng tài khoản của người khác.

## Hiện trạng đã kiểm tra trước gộp

- Commit code bàn giao `8e6d5f2` đã có CI GitHub thành công. Main mới nhất `5c39e54` đã nằm trong nhánh bàn giao, không có code main mới cần giải quyết xung đột.
- Supabase project `ifgtyslifgegwcguysbb` có14 migration, còn4 migration bên dưới; chưa có Edge Function nào. Website lúc kiểm tra vẫn trả health `live`, catalog DEMO chưa có offer.
- Bucket private `ftu-demo-proof-private` và ảnh DEMO cũ đã có; bộ xử lý upload online mới chưa triển khai.
- Callback Apps Script đã cấu hình, nhưng chưa nghiệm thu phiên OAuth, installer hoặc trigger. Các dòng đang có trên Sheet là snapshot, không chứng minh tự đồng bộ.
- Các số trên là trạng thái khi kiểm tra, admin phải đọc lại trước thao tác. Dữ liệu LIVE, secrets và quyền tài khoản không thay đổi trong lượt gộp Git này.

## Ảnh và Sheet sẽ cập nhật như thế nào

1. Khách gửi ảnh ở website; backend xác minh đăng nhập, chủ đơn, hạn giữ vé và scope DEMO.
2. Function `ftu-proof-transform` decode ảnh thật, kiểm tra giới hạn, bỏ metadata và chuyển WebP; backend lưu vào Supabase Storage private rồi ghi metadata minh chứng vào database.
3. Khách bấm Hoàn tất thành công mới có vé/quyền vote. Apps Script đọc dữ liệu server và cập nhật Sheet trong lần chạy trigger kế tiếp.
4. Sheet giữ mã minh chứng/UUID. Xem ảnh qua trang admin website đã đăng nhập; không đặt bucket public, URL ảnh có token hoặc công thức IMAGE công khai để hiện ảnh trực tiếp trong ô.
5. Nếu admin thay minh chứng từ Sheet, nhập file ID/link ảnh Drive theo README; script đọc bằng quyền owner, backend xử lý ảnh và lưu phiên bản mới. Chỉ báo thành công khi transaction database đã lưu; giữ lịch sử ảnh cũ. Không ghi đè mù khi revision xung đột.

Nguồn/chỉnh sửa có2 tab `Database hiện hành` và `Khách mua vé`. Kho mã tách3 tab `Vé bán kết`, `Vé chung kết`, `Vé DEMO`; cùng combo/đơn/loại gộp một dòng nhưng giữ toàn bộ mã/UUID vé riêng. Trigger mỗi phút là lịch chạy nền, không cam kết cập nhật đúng từng60 giây khi Google/API chậm.

## A. Migration trên Supabase — làm trước khi bật Sheet

Admin backup riêng, đọc diff/rollback và chỉ áp các migration chưa có theo thứ tự:

1. `supabase/migrations/20261014160311_google_sheets_purchase_edits.sql`
2. `supabase/migrations/20261015024905_vote_deadline_closure.sql`
3. `supabase/migrations/20261015032157_sheet_quota_staging_safety.sql`
4. `supabase/migrations/20261015081633_demo_vote_leaderboard.sql`

Migration kho mã `20261015041125_ticket_code_register` đã áp, không chạy lại. Sau apply đối chiếu history/version, quyền/RLS/advisors, dữ liệu cũ và quota; dự kiến18 migration nếu không có cập nhật khác. Không sửa function để bỏ qua guard nguồn, không db push mù vào project có dữ liệu thật. Rollback nằm trong `supabase/rollbacks/`; một số rollback từ chối khi đã có lịch sử sửa/ảnh mới.

## B. Xử lý và lưu ảnh online

Đọc `supabase/functions/ftu-proof-transform/README.md`. Admin dùng đúng tài khoản Supabase, có Docker bundler hoạt động và quyền deploy function:

```powershell
node scripts/prepare-proof-function.mjs
npx supabase functions deploy ftu-proof-transform --project-ref ifgtyslifgegwcguysbb
```

WASM được sinh từ dependency đã khóa phiên bản, không nằm trong Git; config đã khai báo static_files. Không deploy API-only làm mất WASM, không bỏ codec hoặc lưu raw để lách lỗi runtime. Giữ JPEG/PNG≤5MB/12MP, Auth/JWT/HMAC/ownership/DEMO scope và bucket private. Function tự xác minh JWT nên config verify_jwt=false không có nghĩa bỏ xác thực.

Kiểm thử hosted: ảnh hợp lệ→WebP, ảnh lỗi/quá giới hạn và sai chủ/chữ ký bị chặn, tài nguyên runtime phù hợp. Chỉ bật luồng upload sau khi các kiểm tra này đạt. Ảnh cũ đọc được không chứng minh upload ảnh mới đã chạy.

## C. Xác minh Worker sau Cloudflare Builds

Theo dõi deployment của commit main mới trên Worker `ftucharm-test`, môi trường `online-test`, config `apps/api/wrangler.jsonc`.

Build dùng `VITE_PREVIEW_MODE=false`, URL/publishable key đúng project, Turnstile site key đúng hostname. Server secrets `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `TURNSTILE_SECRET_KEY` do admin kiểm tra trong secret store; không đưa khóa vào source, chat hoặc Apps Script.

Các vars đã có trong env online-test cần giữ:

```text
DEMO_MODE=false
PUBLIC_EDITION_SLUG=ftucharm-2027
DEMO_TEST_OFFER_SLUG=test-giao-dich-demo
PURCHASE_PROOF_BUCKET=ftu-demo-proof-private
PURCHASE_PROOF_FUNCTION=ftu-proof-transform
EMAIL_DELIVERY_ENABLED=false
ALLOWED_ORIGIN=https://ftucharm-test.bancotaima1235.workers.dev
TURNSTILE_HOSTNAME=ftucharm-test.bancotaima1235.workers.dev
```

Health sau bản mới phải là `demo-test`; homepage vẫn mùa2027, catalog DEMO đúng đợt thử. Nếu build/deploy lỗi, xem log của đúng commit và giữ/rollback về version đã xác minh; không suy ra deploy thành công từ push Git. Không bật cron/outbox chung để sửa lỗi đồng bộ Sheet.

## D. Kết nối Google và tạo trigger

- Sheet Data: https://docs.google.com/spreadsheets/d/1n6nbwjErwOCsh-auVyOUmVP5jTIRsud45ADYdRhXViU/edit
- Callback: https://script.google.com/macros/s/AKfycby0YT1V0FL4W2yqC-goNjZiVCpkd0g7AuyavXJIVTJ6ZTSEP4J3GAxXriSHfuzvnMW1/exec
- Website/API: https://ftucharm-test.bancotaima1235.workers.dev
- Supabase URL: https://ifgtyslifgegwcguysbb.supabase.co

Owner của project Google phải có tài khoản website đã xác minh email và quyền quản lý vé. Dùng toàn bộ `tools/google-sheets/Code.gs` và `appsscript.json` mới nhất, kiểm tra đúng19 headers tab khách và24 headers kho mã; cập nhật version deployed nếu source còn cũ.

Script Properties cần4 tên: `FTU_API_BASE_URL`, `FTU_SUPABASE_URL`, `FTU_SUPABASE_PUBLISHABLE_KEY`, `FTU_SCRIPT_CALLBACK_URL`. Callback đã có trong Supabase allowlist; đối chiếu URL chính xác, không xóa4 URL cũ/đổi Site URL. Script chỉ dùng publishable key, không dùng Supabase secret/service-role.

Mở callback, chọn đăng nhập Google để kết nối. Sau khi backend/ảnh smoke đạt, chạy `installFtuSync()` bằng owner. Hàm kiểm tra chia sẻ private/API/headers, sync trước rồi tạo:

| Trigger              | Kiểu          |
| -------------------- | ------------- |
| `syncFtuPurchases`   | Mỗi1 phút     |
| `syncFtuTicketCodes` | Mỗi1 phút     |
| `onFtuPurchaseEdit`  | Khi sửa Sheet |

Kiểm tra Executions thành công và không có trigger trùng. Giữ Script/Sheet/thư mục private. Không đưa token vào ô hoặc sao chép phiên browser. Nếu đổi owner/project Script thì phải triển khai callback riêng và cấu hình allowlist tương ứng.

## E. Bằng chứng để xác nhận đã hoạt động

Admin tạo đúng1 đơn DEMO bằng thông tin và ảnh giả, không chuyển tiền. Ghi mã đơn/giờ test và kiểm tra:

- Hoàn tất lưu thành công trong Supabase; mã/UUID vé duy nhất, retry không nhân vé.
- Ảnh WebP thật ở private Storage; khách đúng chủ và admin có quyền xem, tài khoản khác/anonymous bị chặn. Đổi ảnh trước Hoàn tất lưu đúng ảnh cuối.
- Không import tay: job Script tự thêm đơn/mã vé/số lượng combo vào đúng tab, có log chạy thành công.
- Thử sửa1 trường DEMO và thay minh chứng Drive từ Sheet: database cập nhật sau xác minh/revision, owner không đổi và lịch sử ảnh còn nguyên. Không thử sửa đơn LIVE.
- Đăng nhập admin từ máy khác vẫn xem được đơn/ảnh từ server; không dựa vào file ảnh R2 local của máy cũ.

Chỉ sau khi có các bằng chứng này mới báo ảnh online và Sheet tự cập nhật đã hoạt động. Tạo thí sinh/hạng mục/phiên vote DEMO và thử BXH là bước nghiệm thu tiếp theo trong [bàn giao đầy đủ](HANDOFF-ONLINE-TEST-ADMIN-20261015.md); không đổi lịch LIVE hoặc mở lại phiên đã đóng.
