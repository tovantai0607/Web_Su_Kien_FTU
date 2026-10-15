# Hướng dẫn phát triển website sự kiện FTU

## Yêu cầu gộp main và bàn giao ảnh/Sheet ngày15/10/2026

Người dùng đã yêu cầu gộp nhánh bàn giao vào main, thay giới hạn chỉ push nhánh ở phần lịch sử bên dưới. Được phép push main và kích hoạt Cloudflare Builds trong lượt này. Đọc `docs/NEXT-STEPS-SHEET-IMAGES.md` để tiếp quản phần còn lại:4 migration pending, codec WASM/Storage, xác minh Worker và OAuth/trigger Google; các bước remote này vẫn do admin sở hữu dịch vụ thực hiện. Không suy ra merge/deploy Worker là Sheet tự đồng bộ hoặc upload ảnh đã đạt. Ảnh private, Sheet lưu UUID/mã minh chứng và xem qua web có quyền, không public ảnh để nhúng vào ô.

## Bàn giao admin khác ngày15/10/2026

Người dùng rút việc tự kích hoạt vì tài khoản dịch vụ đang mở không thuộc họ: chỉ push code lên nhánh, phần online do admin khác tiếp quản. Đọc `docs/HANDOFF-ONLINE-TEST-ADMIN-20261015.md`. Chưa migration/deploy/fixture/vote/trigger trong lượt này; Supabase14 migration,4 pending. CLI login đã hủy/hết hạn. Đã lưu backup phạm vi nghiệp vụ/hàm mã hóa DPAPI local và đối chiếu10 bảng không đổi; không đưa backup/credentials vào Git. Kiểm tra local thứ tự áp4 pending sau registry cho cùng hàm/quyền với canonical. Không merge main vì nối auto-deploy; xác nhận kích hoạt trước đó không còn là chỉ dẫn tiếp tục tự deploy của lượt này.

## Kiểm tra mua vé và BXH DEMO ngày15/10/2026

Online vẫn health mode=live, catalog slug DEMO0 offer, vote DEMO404. Supabase6 đơn COMPLETED/15 vé DEMO nhưng0 thí sinh vòng/hạng mục/phiên/phiếu; chưa có Edge Function. Local đã bổ sung nút mua/vote DEMO trong admin và BXH tạm chỉ DEMO, giữ công bố LIVE. Migration mới `20261015081633_demo_vote_leaderboard` chỉ đọc, chưa áp remote; tổng4 migration pending. Đọc `docs/demo-vote-online-status-20261015.md`. Chưa push/deploy/migration, fixture/vote remote hoặc bật trigger Google trong lượt kiểm tra này.

## Callback Google ngày15/10/2026

Owner đã triển khai Apps Script private và yêu cầu dùng computer trên2 tab. Đã lưu FTU_SCRIPT_CALLBACK_URL và thêm đúng callback /exec vào Supabase Redirect URLs; reload xác minh toàn bộ URL,5 redirect gồm4 cũ, Site URL không đổi. Đọc `docs/apps-script-callback-20261015.md`. Chưa đăng nhập OAuth tích hợp/cài trigger; backend/migration/Edge vẫn chưa kích hoạt. Không dùng lịch sử “chưa có deployment Apps Script” bên dưới làm trạng thái hiện hành.

## Đồng bộ Git ngày15/10/2026

Đã gộp main mới `5c39e54` (mobile scroll/QA) với phần Storage/kho mã/Sheet trên nhánh `codex/ticket-code-sheets-sync-20261015`, giữ cả hai phía test adapter. QA sau gộp:264 unit/database/browser đạt,1 native skip;53 E2E preview đạt/3 skip và24 E2E Auth/admin đạt; lint/typecheck/build/dry-run đạt. Lượt này chỉ push nhánh mới theo yêu cầu, không merge main/deploy/migration hoặc bật Google. DEMO hiện15 vé đã cấp sau đơn4 vé thử; xem `docs/git-sync-ticket-sheets-20261015.md` và báo cáo kho mã cho bằng chứng/giới hạn.

## Kho mã vé đã xác nhận ngày15/10/2026

Đính chính mới nhất: bán kết và chung kết là hai tab riêng. Hiển thị Sheet gộp các vé cùng loại/combo của một đơn thành một dòng: hai Combo2 là4 vé, nhãn cb2_4_<dải mã>; giữ từng UUID/mã vé trong database và cột thành viên. Không gộp khác đơn/loại/vòng. Mã nhóm là nhãn hiển thị, không thay khóa vote. Bảng Data dùng `Vé bán kết` (700BK), `Vé chung kết` (700CK), `Vé DEMO` (50DM ban đầu). Đã tách tab chính thức gộp cũ, đối chiếu đủ1400 dòng×24 cột không đổi và giữ11 vé DEMO đã cấp. Apps Script định tuyến theo tiền tố BK/CK/DM; không tạo lại tab gộp.

Người dùng chốt700 mã BK và700 mã CK cho2 vòng LIVE2027,50 DM ban đầu cho DEMO,5 chữ số sau tiền tố. Mỗi vé1 mã; Combo3 giữ3 vé cùng nhóm để BTC bố trí gần, không chọn ghế. Đã áp migration độc lập `20261015041125_ticket_code_register`, tạo1450 slot trên Supabase;11 vé DEMO cũ được liên kếtDM, không sửa mã lịch sử/UUID/order/vote. Trigger database gắn mã khi Hoàn tất trong transaction, không cấp quyền cho slot trống, không dùng lại mã đã cấp. Ba tab `Vé bán kết`/`Vé chung kết`/`Vé DEMO` đã có snapshot; hai tab cũ đổi nhãn A1 thànhMã đơn. Đọc `docs/ticket-code-register-20261015.md`. Tự đồng bộ Google vẫn cần owner triển khai Apps Script/trigger; công cụ Drive kết nối chưa có thao tác triển khai Script và tìm chưa thấy project. Không dùng URL Worker làm URL callback Apps Script, không coi snapshot là realtime. Remote14 migration;3 migration pending từ lượt trước chưa được áp.

## Chuẩn bị trước deploy ngày15/10/2026

Người dùng đã chọn project Supabase hiện tại, chỉ thử dữ liệu DEMO, và Supabase Storage cho minh chứng với xử lý ảnh an toàn. Đã tạo bucket private `ftu-demo-proof-private` và sao chép/so hash5 minh chứng DEMO từ R2 local; giữ nguyên ảnh local và các dòng đơn/vé/phiếu. Bảng Data đã có bản chụp5 đơn COMPLETED/11 vé/6 dòng, đủ19 cột gồm số lượng combo; chưa deploy Apps Script/trigger mỗi phút. Source adapter, Edge codec, quota Sheet và fence DEMO được chuẩn bị local; đọc `docs/predeploy-storage-sheet-fixes-20261015.md` cùng báo cáo readiness để biết kiểm tra/giới hạn/activation còn thiếu. Không suy ra website online cũ đã đọc được ảnh mới hoặc đồng bộ hai chiều đã chạy.

Git main đã nối Cloudflare Builds: push/merge main sẽ deploy `online-test`. Lượt sửa trước deploy chưa cho phép tự push/deploy; chuẩn bị review/test xong trước bước kích hoạt. Ba migration Sheets/deadline/quota chưa áp remote trong lượt này; không dùng database thật để lặp SQL. Function ảnh chỉ DEMO, phải bundle WASM và giữ xác thực/kiểm tra ảnh, không thay bằng lưu raw khi thiếu runtime.

## Khôi phục form đăng ký và cân đối đăng nhập

Yêu cầu tiếp theo14/10/2026: mục Dự thi và form đăng ký ba bước phải luôn truy cập được, kể cả khách chưa đăng nhập hoặc ngoài lịch nhận hồ sơ. Cho xem/chuẩn bị thông tin trên trang, không lưu nháp PII vào browser storage. Chỉ tải ảnh/gửi hồ sơ khi đăng nhập và trong07–21/03/2027; giữ kiểm tra lịch server/database. Không ẩn cả form hoặc đổi link Dự thi sang timeline khi chưa mở đơn. Mobile có mục Đăng ký thí sinh trong menu. Khung auth dùng padding cố định theo px, không dùng padding phần trăm của page-shell khiến form hẹp trên màn hình lớn.

## Bản chính thức 2027 được phê duyệt ngày 14/10/2026

Kế hoạch chuyển bản chính thức đã được người dùng yêu cầu triển khai toàn bộ: local frontend5173/API8787, Supabase project hiện có, Images/R2 local riêng. Dùng `dev:official`, `DEMO_MODE=false`, `PUBLIC_EDITION_SLUG=ftucharm-2027`; không dùng entry DEMO cho website chính thức. Lịch 11 mốc, đăng ký 7/3–hết21/3, vé bán kết sớm29–30/3/thường hết24/4, bán kết25/4; vé chung kết sớm26/4 09–11h/thường hết22/5, chung kết23/5. Tổng700 vé/vòng gồm100 sớm/600 thường, BTC chia theo loại; dư vé sớm chuyển thường cùng loại, giữ30phút giữ nguyên giá. Ảnh bán kết10–11/4, nhà vô địch dự kiến23h23/5 do BTC bấm công bố. Vote bán kết10phút trong25/4 do BTC đặt giờ; chung kết chưa đặt lịch. Giá/QR/ảnh/quota từng loại chờ BTC, không điền số giả. Migration13 đã đồng bộ; không gửi email, tạo fixture/đơn thử trên LIVE, deploy hoặc xóa dữ liệu. Đọc `docs/official-program-2027.md` cho runbook/rollback và giới hạn; các xác nhận DEMO dưới đây là lịch sử. Word11/11 local/DEMO giữ nguyên.

## Xác nhận triển khai ngày 14/10/2026

Xác nhận mới nhất sau gộp Git `8115e0f`: SUPER_ADMIN không bắt buộc MFA; chỉ SUPER_ADMIN đóng sớm vote với lý do, phiên đã đóng không mở lại. Dùng quy tắc Git mới theo trả lời người dùng, thay quy tắc cũ trái các điểm này. Trang khách `/admin/ve` chạy ở frontend5173 nối backend8787, dữ liệu Supabase và ảnh R2 local. Đã đối chiếu 11 migration local/remote; không chạy migration trong lượt gộp. Đọc `docs/git-sync-admin-customers-20261014.md` cho bằng chứng và giới hạn mới nhất.

Xác nhận tiếp theo cùng ngày: người dùng chọn **Test DEMO, ghi vào Supabase** và giá vé tạm **100.000đ**, thay giới hạn fixture online cho riêng đợt `test-giao-dich-demo`. Đã tạo mùa/vòng DEMO riêng, sáu cấu hình EARLY/NORMAL, quota thử100/hạng, Combo2/3 bằng2/3 vé (200k/300k, chưa giảm giá), mở cửa sổ thử7 ngày. LIVE chung kết2027 giữ chưa công bố. Backend loopback8787 dùng entry `demo-test.ts`, Auth/ownership thật, Images/R2 local; chỉ ghi đơn/cấu hình trong scope DEMO, admin vẫn kiểm tra quyền/MFA. Chưa là deploy, thanh toán thật, lưu ảnh online hay tải online. Xem `docs/ticket-sales-demo-20261014.md` cho trạng thái và cách chạy. Không tự xóa dữ liệu/ảnh thử đã được tạo.

Mùa/lịch2027; quota30 phút; mỗi đơn/tài khoản không cap ngoài quota. Hoàn tất lưu minh chứng/thông tin thành công có vé/vote ngay, không hủy/thu hồi. BTC cấu hình; local DEMO được duyệt; Supabase chứa dữ liệu thật nên không migration/fixture/load online. Người dùng yêu cầu hoàn tất tất cả11 bước trong lượt triển khai hiện tại, thay quy tắc dừng sau từng bước cho yêu cầu này. Đọc `docs/supplement-acceptance.md`, runbook và Word cho trạng thái mới. Giữ Auth/CMS/registration/shared history, không tự deploy/push/thay secret/gửi email.

## Skill nghiệp vụ bắt buộc cho phần bán vé

Đọc `.agents/skills/ftu-ticket-sales/SKILL.md` và `references/requirements.md` của skill trước khi lập kế hoạch hoặc sửa luồng vé/QR/minh chứng/database/vote. Đây là skill từ bosung.docx và các xác nhận mới nhất; mã R01–R14 dùng để kiểm tra từng mục. Không dùng mô tả payment/check-in/email/hủy đơn cũ để mở rộng phạm vi. File bổ sung và ảnh được giữ làm nguồn; không sửa nguồn để hợp thức hóa phương án.

## Ngữ cảnh và phạm vi

Website cuộc thi hoa khôi sinh viên: giới thiệu/đăng ký/CMS; bán vé theo loại/cụm và combo, QR chuyển khoản/minh chứng; vote theo vòng/hạng mục. Theo yêu cầu 14/10/2026, Hoàn tất lưu thành công ở server ghi nhận số vé để vote ngay, không chờ BTC duyệt/email. Email vé do bên khác gửi thủ công. Không dùng chọn số ghế hoặc payOS/SePay/webhook trong luồng mới. Đọc skill/NGHIEP_VU_HIEN_HANH.md cùng skill/Nhiemvu.md và skill/bosung.docx. Ưu tiên mobile, bảo mật và chi phí thấp; mục tiêu 500–1.000 đồng thời phải đo.

Thư mục dự án trống tại thời điểm thiết lập 13/10/2026. Trước khi đề xuất công nghệ hoặc sửa cấu trúc, kiểm tra code, manifest, lockfile, cấu hình, migration và hướng dẫn trong thư mục con. Không mặc định React, Next.js, Supabase hay Prisma. Giữ phiên bản và kiến trúc hiện hữu trừ khi nhiệm vụ yêu cầu thay đổi.

## Chọn skill theo nhiệm vụ

Đọc `SKILL.md` của skill phù hợp và chỉ tải references cần thiết. Skill dùng chung trên máy này ở `C:/Users/dell/.agents/skills/`; không sao chép chúng vào source code. Kiểm tra danh sách skill của phiên đang chạy trước khi gọi; nếu thiếu, báo rõ và dùng tài liệu chính thức.

- UI: ưu tiên `ui-ux-pro-max` và `frontend-design`. Với giao diện lớn, xây design system gồm token màu, typography, spacing, component và trạng thái trước khi triển khai. Dùng `building-components` cho composition, typing và accessibility; `web-design-guidelines` để review.
- Frontend React/Next.js khi đã xác định stack: dùng `vercel-react-best-practices` (thư mục `react-best-practices`). Component tái sử dụng, tránh code trùng, kiểm tra TypeScript bằng script dự án, tối ưu theo số liệu và kiểm tra API theo phiên bản đang cài.
- PostgreSQL: dùng `supabase-postgres-best-practices` cho schema, SQL, migration, RLS, indexes, pooling, transaction và locking. Dùng `supabase` khi dự án thực sự dùng Supabase. Dùng `prisma-cli` chỉ cho Prisma ORM 7; không áp dụng công thức đó cho Prisma 6/8.
- Kiểm thử: dùng `webapp-testing`; kiểm tra thành công/thất bại của luồng nghiệp vụ chính, keyboard, responsive, lỗi mạng, retry và quyền truy cập. Ưu tiên test hành vi và invariants có giá trị; không thêm test chỉ mô phỏng triển khai.
- Bảo mật và vận hành: dùng skill bảo mật/triển khai đã có và phù hợp với nền tảng; đọc tài liệu chính thức OWASP, provider và runtime khi thiếu hướng dẫn. Cài skill không đồng nghĩa đã cài CLI, browser, MCP hoặc đã đăng nhập dịch vụ.

Các skill bổ sung đã xác minh: `nextjs` cho App Router khi stack là Next.js; `vercel-composition-patterns` cho kiến trúc component; `prisma-orm-setup` để chọn đúng phiên bản Prisma; `sharp-edges` cho API/config và authentication dễ dùng sai; `differential-review` cho diff có baseline Git; `playwright-cli` cho browser/testing khi runtime đã cài; `web-perf` cho đo performance; `workers-best-practices`, `wrangler`, `cf-cli` cho Cloudflare theo cấu hình thực tế; `deployments-cicd` cho Vercel/CI/CD khi đã chọn nền tảng. Không áp dụng các ví dụ deploy, promote, provisioning hay gửi comment bên ngoài nếu nhiệm vụ chưa cho phép.

Các tên agent và slash command riêng của Claude/plugin được nhắc trong upstream không tự được đăng ký khi cài skill độc lập. Dùng quy trình trực tiếp và công cụ Codex tương đương; không gọi agent/command không có. Kiểm tra CLI help và tài liệu hiện hành thay vì chạy nguyên xi ví dụ CI.

## UI và accessibility

Giữ design system nhất quán giữa các trang. Thiết kế mobile-first, không tràn ngang, có label thật, thông báo lỗi liên kết với input, focus rõ, keyboard đầy đủ, semantic HTML, contrast phù hợp và reduced-motion. Nội dung tiếng Việt rõ ràng; font phải hỗ trợ dấu tiếng Việt. Bao gồm loading, empty, success và error states.

UI/UX Pro Max được cài ở phạm vi người dùng. Ví dụ `${CLAUDE_PLUGIN_ROOT}` trong bản upstream không áp dụng trong Codex; gọi script bằng đường dẫn tuyệt đối:

```powershell
python "C:/Users/dell/.agents/skills/ui-ux-pro-max/scripts/search.py" "error summary validation" --domain ux
```

Không truyền dữ liệu riêng tư vào query. Chỉ `--persist` khi cần tạo design system, kèm `--output-dir` trỏ đúng root dự án; đọc MASTER hiện hữu và không dùng `--force` nếu chưa được cho phép.

## Backend, API và database

Định nghĩa trạng thái, trust boundary, quyền theo vai trò và invariants trước khi triển khai luồng quan trọng. Validate input ở server, kiểm tra ownership/quyền trên mỗi tài nguyên và endpoint, giới hạn request/upload, tránh SQL injection, XSS, CSRF và log dữ liệu nhạy cảm. Dùng rate limit theo nghiệp vụ; CAPTCHA không thay thế authorization.

Schema cần primary key, foreign key, unique/check constraints phù hợp; indexes dựa trên truy vấn thực tế và EXPLAIN. Bật và kiểm thử RLS với role thực tế khi cần; trong Supabase phải bảo vệ bảng thuộc exposed schema. Không đưa service-role key vào client. Dùng migration có review và rollback; không sửa production trực tiếp. Các hướng dẫn Supabase chạy SQL để lặp schema chỉ áp dụng cho database local/test đã xác định.

- Đăng ký: xác nhận email bằng token có hạn, dùng một lần; retry gửi email phải idempotent; bảo vệ thông tin cá nhân và ảnh thí sinh.
- Vé/combos: chọn loại/cụm và số lượng, không chọn ghế; quota và giá do server kiểm tra. Transaction/constraints ngăn vượt quota; Hoàn tất và retry phải ghi quyền vé/vote đúng một lần. Giữ quota30 phút không gia hạn retry, mỗi đơn chỉ giới hạn quota còn lại; sau Hoàn tất không hủy/hoàn/thu hồi.
- Minh chứng: QR chuyển khoản theo cấu hình, private upload và ownership. Server lưu thông tin/minh chứng/Hoàn tất thành công thì ghi nhận vé để vote ngay; không đợi BTC duyệt. Tách quyền vote khỏi trạng thái đối soát/PAID/doanh thu. Email vé thuộc bên khác gửi thủ công; không tự xử lý thu hồi quyền/phiếu khi chứng từ sai mà chưa chốt chính sách.
- Bình chọn: mỗi vé ghi nhận từ đơn Hoàn tất một lượt/hạng mục đúng vòng, N vé có N lượt; không chờ email. Thời gian server, unique theo vé/hạng mục, retry nguyên tử, bảo toàn legacy và không lộ PII.

## Kiểm thử, tải và triển khai

Kiểm thử đăng ký/email chung, RLS, upload/Hoàn tất thất bại hoặc retry, tranh quota/combo, quyền vote trước đối soát/email, vote retry và hết hạn vòng. Dùng dữ liệu giả, môi trường local/staging và tài khoản test; không tạo thanh toán hay gửi email thật trong test.

Kiểm tra package scripts rồi chạy lint/typecheck/build/test phù hợp. Báo rõ check chưa chạy hoặc không có, không tuyên bố website đạt chuẩn khi chưa đo. Load test phải có workload, tỷ lệ đọc/ghi, ramp-up, thời lượng, p95/p99 latency, error rate, connection pool, lock contention và ngân sách được xác định. Không chạy tải lên production hoặc dịch vụ ngoài khi chưa được cho phép.

Không commit secrets; dùng cấu hình môi trường và secret store. Kiểm tra đúng môi trường trước migration/deploy. Chuẩn bị rollback, backup phù hợp và quan sát lỗi. Không tự deploy production; preview/staging chỉ thực hiện khi nằm trong phạm vi yêu cầu. Không tự nâng cấp dependency major, đổi provider, xóa dữ liệu hoặc thay secrets. Ưu tiên giải pháp đơn giản, chi phí có căn cứ, tránh hứa khả năng chịu tải chưa kiểm chứng.

## Ngữ cảnh local của người dùng

- Thư mục làm việc: `D:\WED_sk_FTU`; repository chính: https://github.com/tovantai0607/Web_Su_Kien_FTU.git. Trao đổi bằng tiếng Việt.
- Đã đồng bộ nhánh `main` từ GitHub ngày 13/10/2026 tại commit `8d57978`; codebase hiện đã có. Luôn kiểm tra trạng thái Git thực tế trước tác vụ tiếp theo.
- `skill/Nhiemvu.md` là phần công việc người dùng được phân công; đọc để xác định phạm vi khi triển khai. Không tự mở rộng sang phần người khác phụ trách.
- `skill/database.md` chứa thông tin kết nối Supabase người dùng cung cấp; được loại khỏi Git vì có secret key. Không đưa nội dung khóa vào source, giao diện hoặc log.
- Đọc `skill/Prompt.md` khi cập nhật việc cài đặt skills. Đối chiếu và cập nhật báo cáo tại `skill/CODEX_SKILLS_SETUP_REPORT.md`; không báo cài thành công khi chưa xác minh.
- Python đã kiểm tra trên máy: `C:\Users\dell\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`. Nếu đường dẫn thay đổi, tìm lại executable; lệnh `python` trên PATH trước đây trỏ tới alias Windows Store.
- `tools/sepay-sandbox` là bộ thử webhook SePay local đã có trước khi tải code; đọc README của công cụ khi sử dụng, chỉ dùng môi trường test đã xác định.

## Tiến độ triển khai phần việc người thứ hai

- Kế hoạch và bảng nghiệm thu nằm trong `tiến độn.docx` tại gốc dự án, gồm 11 giai đoạn. Đọc trạng thái trong file trước mỗi lượt triển khai.
- Mỗi lượt chỉ thực thi một giai đoạn theo thứ tự. Không tự chuyển sang giai đoạn tiếp theo; sau khi hoàn tất phải dừng và chờ yêu cầu tiếp tục.
- Chỉ đánh X vào ô của giai đoạn khi sản phẩm bàn giao, tests và điều kiện nghiệm thu đã đạt; ghi bằng chứng trong tài liệu hoặc commit liên quan. Nếu còn lỗi, thiếu cấu hình hoặc thiếu quyết định nghiệp vụ, giữ ô trống và báo rõ phần còn thiếu.
- Khi đánh X, cập nhật tổng số giai đoạn hoàn tất và giai đoạn tiếp theo trong file Word; giữ nguyên các ô và nội dung khác. Tạo kế hoạch không đồng nghĩa đã hoàn tất giai đoạn 01.

## Nghiệp vụ và tiến độ sau bổ sung 14/10/2026

Đã nghiệm thu 11/11 local/DEMO theo yêu cầu hoàn tất toàn bộ phần việc. Word và docs/supplement-acceptance.md lưu bằng chứng, không suy ra đã nghiệm thu production. Sau đó người dùng yêu cầu đồng bộ Supabase: đã áp đủ chín migration lên project ifgtyslifgegwcguysbb, schema/history khớp local; xem docs/supabase-sync-20261014.md. Chưa có tài khoản quản trị, cấu hình đợt bán hoặc triển khai Worker trong lượt đồng bộ; không tạo fixture/đo tải online. Không xây email vé tự động; bàn giao dữ liệu có quyền cho bên gửi email thủ công.

## Phạm vi theo bổ sung mới nhất

Không có nhiệm vụ check-in, camera quét vé, QR vào cửa, mapping QR/check-in hoặc email vé tự động. Không dùng payOS/SePay/webhook; chỉ hiển thị QR chuyển khoản rồi nhận minh chứng/lưu dữ liệu. Không xóa code/schema/check-in cũ của phần dùng chung trong lượt sửa tài liệu.

Lưu theo sáu cột ảnh: Mã vé, Thông tin, Minh chứng chuyển khoản, Loại vé, Số lượng, Combo. Lịch năm 2027 trong skill/NGHIEP_VU_HIEN_HANH.md có bán kết 25/4, mở vé sớm chung kết 26/4; không tự suy ra ngày tổ chức chung kết. Kế hoạch 11 bước sau khi bỏ check-in đã nghiệm thu local; cấu hình vận hành thật còn theo báo cáo đồng bộ. Yêu cầu đồng bộ hiện tại cho phép migration đã đối chiếu, không mở rộng thành quyền deploy/push/thay secrets/email/thanh toán hoặc đo tải online.
