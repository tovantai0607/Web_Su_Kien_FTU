# Bàn giao admin: kích hoạt mua vé, Google Sheet và vote DEMO

**Cập nhật sau bàn giao15/10/2026:** người dùng yêu cầu hoàn thành kết nối Sheet; đã áp hai migration Sheets/quota (remote16), hoàn thành OAuth owner, cài ba trigger và kiểm tra đồng bộ hai chiều trên đơn DEMO. Xem [sheet-activation-20261015.md](sheet-activation-20261015.md). Hai migration vote và bộ xử lý ảnh vẫn chưa kích hoạt; bảng hiện trạng14 migration/chưa OAuth bên dưới là thời điểm bàn giao trước đó.

**Yêu cầu mới nhất15/10/2026:** người dùng đã yêu cầu gộp nhánh bàn giao vào main và ghi rõ việc còn lại cho ảnh/Sheet. Hướng dẫn tiếp quản sau gộp nằm ở [NEXT-STEPS-SHEET-IMAGES.md](NEXT-STEPS-SHEET-IMAGES.md). Quyết định chỉ push nhánh/không merge trong mục lịch sử ngay dưới đã được thay; các bước migration/Function/OAuth/trigger vẫn do admin sở hữu dịch vụ thực hiện.

## Điểm tiếp quản

Ngày15/10/2026, người dùng yêu cầu dừng kích hoạt vì tài khoản dịch vụ đang mở không thuộc họ; chỉ đẩy code lên Git, phần online do admin khác thực hiện. Yêu cầu này thay việc tự triển khai ở lượt trước. **Không gộp main trong lượt bàn giao**: main nối Cloudflare Builds và sẽ tự deploy.

- Repository: https://github.com/tovantai0607/Web_Su_Kien_FTU
- Nhánh bàn giao: `codex/ticket-code-sheets-sync-20261015`, đã gồm main `5c39e54` và các phần Storage/kho mã/Sheet trước đó. Admin fetch và kiểm tra HEAD thực tế trước khi tiếp quản.
- Worker test: https://ftucharm-test.bancotaima1235.workers.dev
- Supabase: project `ifgtyslifgegwcguysbb`, **có dữ liệu thật**. Chỉ tạo/sửa dữ liệu thử trong offer `test-giao-dich-demo`, không mở bán hoặc đổi lịch LIVE.
- Google Sheet Data: https://docs.google.com/spreadsheets/d/1n6nbwjErwOCsh-auVyOUmVP5jTIRsud45ADYdRhXViU/edit
- Callback Apps Script: https://script.google.com/macros/s/AKfycby0YT1V0FL4W2yqC-goNjZiVCpkd0g7AuyavXJIVTJ6ZTSEP4J3GAxXriSHfuzvnMW1/exec

## Trạng thái thật khi bàn giao

| Phần             | Đã có                                                                                                                                  | Chưa có                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Code và kiểm tra | Luồng mua, private Storage, kho mã và Sheet; nút mua/vote DEMO trong admin; BXH tạm từng hạng mục, refresh15giây/sau vote/nút cập nhật | Chưa là bản deploy online mới                                                       |
| Website online   | Health200, mode `live`; trang giới thiệu mùa2027                                                                                       | Catalog DEMO trả0 offer; vote vòng DEMO404; chưa thử trọn luồng online              |
| Supabase         | 14 migration;6 đơn DEMO COMPLETED/15 vé;700BK+700CK+50DM,15DM đã cấp                                                                   | 4 migration pending;0 thí sinh trong vòng DEMO/0 hạng mục/0 phiên/0 phiếu           |
| Minh chứng       | Bucket private `ftu-demo-proof-private`, các ảnh DEMO đã chuyển từ local; adapter/codec trong source                                   | Chưa có Edge Function hosted; Docker CLI chưa cài trên máy bàn giao                 |
| Google           | Callback đã deploy private; đã lưu `FTU_SCRIPT_CALLBACK_URL` và thêm redirect Supabase, giữ4 URL cũ                                    | Chưa có OAuth tích hợp được xác minh, installer/trigger hoặc nghiệm thu tự cập nhật |
| Dữ liệu          | 8 purchase_requests tổng cộng, trong đó6 COMPLETED;15 tickets,0 votes                                                                  | Không tạo thêm đơn/vé/thí sinh/phiếu trong lượt bàn giao                            |

Đã đối chiếu snapshot trước/sau: requests, evidence, tickets, votes, offers, products, rounds, sessions, slots, batches không đổi. Không chạy DDL/migration remote, deploy Worker/Function, bật trigger, gửi email, thay secret, chuyển tiền hoặc đo tải online.

Bản sao lưu phạm vi nghiệp vụ và định nghĩa hàm đã mã hóa Windows DPAPI, xác minh round-trip tại `output/online-activation-20261015/pre-migration.dpapi` trên máy này. Đây **không phải backup toàn bộ project/Auth/Storage**, không đưa lên Git và chỉ tài khoản Windows tương ứng giải mã được. Admin tiếp quản phải tạo backup riêng trên môi trường của mình trước migration. Không đưa keys, password, token, ảnh khách hoặc dữ liệu cá nhân vào repo.

## 1. Đúng tài khoản, đúng môi trường

Admin phải đăng nhập tài khoản của mình có quyền trên Worker, Supabase và Google Sheet. Không dùng phiên trình duyệt hoặc mật khẩu của tài khoản khác. Các luồng CLI login thử trên máy bàn giao đã hủy/hết hạn; chưa đăng nhập CLI thành công, không có token CLI để bàn giao.

Kiểm tra `git status`, remote, nhánh và commit; giữ thay đổi chưa commit nếu có. Chạy `npm ci` theo lockfile, đọc AGENTS.md, `.agents/skills/ftu-ticket-sales/` và các runbook liên quan. Không reset/clean, không deploy nhầm Worker top-level `ftucharm`.

Kiểm tra `wrangler whoami`, Supabase project và quyền owner Google. Worker cấu hình ở `apps/api/wrangler.jsonc`, môi trường **`online-test`**, tên `ftucharm-test`.

## 2. Backup, review và áp4 migration

Theo thứ tự phụ thuộc:

| File trong supabase/migrations                    | Mục đích                                                                                       |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `20261014160311_google_sheets_purchase_edits.sql` | Revision/idempotency/audit, sửa đơn qua Sheet, phiên bản minh chứng và aggregate participation |
| `20261015024905_vote_deadline_closure.sql`        | Đóng cả OPEN/SCHEDULED khi hết hạn                                                             |
| `20261015032157_sheet_quota_staging_safety.sql`   | Quota tổng/rollover/hold và thứ tự khóa khi sửa Sheet                                          |
| `20261015081633_demo_vote_leaderboard.sql`        | Hàm đọc BXH chỉ DEMO, không lộ vé/tài khoản, giữ cách công bố LIVE                             |

Kho mã `20261015041125_ticket_code_register` đã có trên remote, **không chạy lại**. Đã kiểm tra bằng PGlite local rằng thứ tự thực tế (kho mã trước, rồi4 migration này) có cùng định nghĩa hàm/quyền với thứ tự chuẩn. Đây chưa phải bằng chứng PostgreSQL remote hoặc nhiều kết nối thật.

Admin dùng quy trình migration có lịch sử/version khớp source, review dry-run và backup. Không chạy `db push` mù hoặc sửa function nguồn để vượt guard `EXPECTED_SHEET_QUOTA_SOURCE_NOT_FOUND`. Sau áp dự kiến18 migration; kiểm tra quyền/RLS/advisors và đối chiếu đơn/vé/phiếu/slot cũ không đổi, `revision=0`, `current_version=true` cho dữ liệu lịch sử. Các rollback tương ứng nằm ở `supabase/rollbacks/`; không rollback nếu đã có lịch sử sửa Sheet/phiên bản ảnh mới mà guard từ chối.

## 3. Triển khai bộ xử lý ảnh an toàn trước Worker

Đọc `supabase/functions/ftu-proof-transform/README.md`. Dùng Docker bundler và CLI tương thích static_files, không dùng API-only/MCP text deployment làm mất file WASM.

```powershell
node scripts/prepare-proof-function.mjs
npx supabase functions deploy ftu-proof-transform --project-ref ifgtyslifgegwcguysbb
```

Đăng nhập CLI bằng tài khoản admin trước lệnh deploy, không truyền token trong lệnh hoặc chat. Binary được sinh từ dependency khóa phiên bản, bị Git ignore; `supabase/config.toml` đã liệt kê static_files. Máy bàn giao không có Docker/WSL runtime hoạt động; chưa cài hoặc thay đổi runtime hệ thống.

Function tự kiểm tra JWT/Auth, HMAC, ownership/RBAC, DEMO scope và timestamp. `verify_jwt=false` trong config phục vụ custom verification, **không có nghĩa tắt xác thực**. Giữ decode JPEG/PNG thật≤5MB/12MP, strip metadata và xuất WebP. Không thay bằng lưu raw hoặc public bucket. Function dùng default server keys của project; không đưa server key vào frontend/Sheet.

Smoke hosted phải chứng minh thiếu/sai chữ ký, sai owner, ảnh lỗi/quá giới hạn bị chặn; ảnh hợp lệ được xử lý và CPU/RAM không vượt runtime. Nếu codec chưa đạt, giữ upload chưa kích hoạt và xử lý lỗi trước bước tiếp theo.

## 4. Build và deploy Worker online-test

Build frontend với `VITE_PREVIEW_MODE=false`, Supabase URL/publishable key đúng project, Turnstile site key đúng domain. Các giá trị frontend là cấu hình public; server-secret tuyệt đối không dùng prefix VITE.

Worker cần secrets hiện hữu `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `TURNSTILE_SECRET_KEY`, lưu bằng secret store của tài khoản quản trị. Không chép từ chat, Git, Apps Script hoặc tài khoản khác. Kiểm tra chúng đã tồn tại; không thay khóa nếu không cần và chưa được duyệt.

Các vars cần giữ đã có trong env online-test: `DEMO_MODE=false`, `PUBLIC_EDITION_SLUG=ftucharm-2027`, `DEMO_TEST_OFFER_SLUG=test-giao-dich-demo`, `PURCHASE_PROOF_BUCKET=ftu-demo-proof-private`, `PURCHASE_PROOF_FUNCTION=ftu-proof-transform`, `EMAIL_DELIVERY_ENABLED=false`, origin/Turnstile hostname đúng Worker. Cron env này đang rỗng để không chạy outbox chung.

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npx wrangler deploy --config apps/api/wrangler.jsonc --env online-test --dry-run
# Chỉ admin có quyền triển khai mới thực hiện:
npx wrangler deploy --config apps/api/wrangler.jsonc --env online-test
```

Nếu dùng pipeline Git, review/merge nhánh vào main sẽ kích hoạt Cloudflare Builds; xác nhận pipeline dùng đúng env/build config rồi theo dõi deploy đến khi hoàn tất. Chỉ push nhánh hiện tại không làm mới website. Kiểm tra rollback Worker trước deploy; rollback code không khôi phục database/ảnh.

Sau deploy, health phải là `demo-test`, catalog slug DEMO có đúng offer và6 sản phẩm, public homepage vẫn mùa2027. GET anonymous dữ liệu khách/ảnh riêng phải bị chặn. Không coi HTML200 là API hoạt động.

## 5. Kết nối OAuth và bật đồng bộ Google

Owner Google hiện hữu phải tiếp quản project Apps Script private và Sheet, hoặc tạo project private của chính mình và cấu hình callback chính xác. Tài khoản Auth website dùng Google của owner phải xác minh email/có quyền admin. Không tạo tài khoản hoặc gán role chỉ vì email đang mở trong trình duyệt.

1. Đối chiếu mã deployed với **toàn bộ** `tools/google-sheets/Code.gs` và `appsscript.json`; không dùng bản cũ trước nhóm combo/24 headers. Nếu cần cập nhật, tạo version deployment mới từ source đã review.
2. Kiểm tra4 Script Properties: `FTU_API_BASE_URL`, `FTU_SUPABASE_URL`, `FTU_SUPABASE_PUBLISHABLE_KEY`, `FTU_SCRIPT_CALLBACK_URL`. Không nhập Supabase secret/service-role vào Script.
3. Mở callback, chọn Đăng nhập Google để kết nối đồng bộ vé. Giữ project private; refresh token chỉ ở Script Properties, không sao chép từ browser hoặc đưa vào báo cáo.
4. Sau backend smoke thành công, chạy `installFtuSync()` bằng owner. Hàm kiểm tra quyền chia sẻ, API, headers và sync trước khi tạo jobs.
5. Xác minh2 trigger mỗi phút (`syncFtuPurchases`, `syncFtuTicketCodes`) và1 trigger onEdit (`onFtuPurchaseEdit`); xem execution log thành công. Không cài trùng bằng tay hoặc báo realtime từ snapshot.

Giữ ba tab kho riêng: `Vé bán kết`700BK, `Vé chung kết`700CK, `Vé DEMO`50DM ban đầu. Combo gộp cùng đơn/loại thành một dòng, giữ mã/UUID thành viên; mã trống không phải quyền vote. Chỉnh thông tin đơn ở `Khách mua vé`; `Database hiện hành` và kho mã là nguồn/bản xem có bảo vệ. Đổi email chỉ là email liên hệ, không chuyển chủ đơn. Xung đột revision phải được đối chiếu, không ghi đè tự động. Xem thêm `tools/google-sheets/README.md`.

## 6. Tạo và nghiệm thu vote DEMO

Offer đã được duyệt: `test-giao-dich-demo`; vòng `cef5c008-a7c1-4f6b-b5e1-e8c361edf0e2`; mùa `f05ac84c-5c71-4ebd-8daa-de7a6fa8dbec`. Chỉ tạo thí sinh giả/round_entries trong mùa/vòng này, không gắn hồ sơ khách thật hoặc mượn vé khách để test. Các tài khoản test/credentials local bị ignore, không nằm trong Git; admin dùng tài khoản test do mình quản lý.

Tạo cả nam/nữ, published và eligible, dùng chức năng chuẩn bị hạng mục rồi đặt phiên DEMO qua quản trị bằng SUPER_ADMIN. Không mở lại phiên đã đóng; nếu đã hết hạn thì xử lý theo quy tắc mới được BTC chốt, không sửa SQL để xóa lịch sử. Không đổi lịch LIVE2027 cho dễ test.

Sau cấu hình, dùng menu trong trang sau đăng nhập (Auth giữ token trong memory; reload có thể cần đăng nhập lại):

- Mua: https://ftucharm-test.bancotaima1235.workers.dev/ve/test-giao-dich-demo
- Khách đã mua: https://ftucharm-test.bancotaima1235.workers.dev/admin/ve
- Vote/BXH: https://ftucharm-test.bancotaima1235.workers.dev/binh-chon?vong=cef5c008-a7c1-4f6b-b5e1-e8c361edf0e2

Các link trên **chưa được xác nhận hoạt động trọn luồng khi bàn giao**. Trong admin có nút vào mua/vote DEMO sau deploy source mới. SUPER_ADMIN vẫn phải có vé thuộc tài khoản mình để vote; quyền admin chỉ cho xem/quản lý dữ liệu khách, không tự có lượt vote.

Kịch bản nghiệm thu:

1. Mua1 Combo3 +1 đơn bằng thông tin/ảnh giả, không chuyển tiền. Giữ30 phút, đổi ảnh trước Hoàn tất, gửi/retry không cấp trùng. Hoàn tất phải lưu database/ảnh private và cấp4 UUID/mã vé riêng.
2. Đợi job Google thành công: đơn mới xuất hiện đúng nguồn/chỉnh sửa, kho DEMO có1 dòng cb3_3 và1 dòng vé đơn, đủ7 thông tin và số lượng combo. Xác minh từ job chứ không import tay.
3. Bốn vé có4 lượt mỗi hạng mục đúng vòng, không chờ đối soát/email/check-in. Không thấy vé của người khác; cùng vé/hạng mục chỉ1 phiếu, retry không tăng phiếu. BXH chỉ DEMO khớp aggregate DB, đồng hạng đúng, refresh15giây và ngay sau vote.
4. Hết giờ server chặn phiếu mới, giữ phiếu cũ. **Cron test đang tắt**: không suy ra trạng thái SQL tự chuyển CLOSED. Admin phải xác minh cơ chế đóng state trong đúng scope DEMO trước chốt/công bố; không bật cron/outbox chung hoặc gọi job toàn project khi có thể sửa LIVE ngoài phạm vi.
5. Chỉnh Sheet→DB bằng DEMO: email liên hệ không đổi owner; số lượng/quota/revision/audit và chặn giảm dưới số vé đã vote; thay ảnh giữ lịch sử. Xuất.xlsx là snapshot, không tự ghi ngược.

Ghi riêng bằng chứng từng bước hosted và phần chưa đạt; không đánh X production từ tests local. Chưa được duyệt gửi email, thanh toán thật, tải500–1.000 online hoặc sửa LIVE.

## Bằng chứng local đã có

Full suite268 đạt/1 native PostgreSQL skip; E2E mục admin/BXH4 đạt desktop/mobile, không tràn ngang/Axe; UI unit cuối3 đạt sau bổ sung trạng thái chưa có phiên. Typecheck/lint/build và Worker dry-run đạt; Three.js còn cảnh báo chunk lớn. Kiểm tra thứ tự migration6giây/PGlite cho cùng định nghĩa hàm và privileges. Secret scan không phát hiện key server/private credential trong file publishable. Chưa nghiệm thu codec hosted, trigger thật, tải hoặc race PostgreSQL native.

Các báo cáo liên quan: `docs/demo-vote-online-status-20261015.md`, `docs/apps-script-callback-20261015.md`, `docs/predeploy-storage-sheet-fixes-20261015.md`, `docs/ticket-code-register-20261015.md`. Lịch sử tài liệu cũ có thể ghi3 migration pending/11 vé; bảng hiện trạng trong bàn giao này mới hơn.
