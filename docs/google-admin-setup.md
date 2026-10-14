# Google login và cấu hình quản trị FTUCHARM

Mã chạy trên React/Vite, Supabase Auth và API Workers hiện có. Không có tài khoản admin giả, mật khẩu cố định hay endpoint công khai tự cấp admin. `/admin/cau-hinh` chỉ tải dữ liệu khi server xác nhận `SUPER_ADMIN`. Theo yêu cầu mới ngày 14/10/2026, admin được truy cập ở `aal1`; MFA là tùy chọn. Các vai trò nhân viên khác giữ chính sách đang có. Migration `20261014122630_admin_optional_mfa.sql` đã được áp vào đúng project thử nghiệm; rollback ở `supabase/rollbacks/20261014122630_admin_optional_mfa.sql` khôi phục các hàm trước thay đổi, không xóa tài khoản hay phương thức MFA.

## Kết nối dự án thử nghiệm

Project được yêu cầu trong nhiệm vụ: `ifgtyslifgegwcguysbb`. Không dùng các lệnh bên dưới cho production.

1. Trong terminal trên máy chạy `npx supabase login`. Nhập mã xác minh từ trang “Authorize Supabase CLI” vào chính terminal đó và nhấn Enter, chờ thông báo “You are now logged in”. Mở trang có mã xác minh chưa hoàn tất đăng nhập. Đăng nhập dashboard trong trình duyệt **không** đăng nhập CLI. Không gửi mã xác minh, token hay secrets trong chat.
2. Kiểm tra `npx supabase projects list` có đúng project. Trước mọi ghi database, đọc `supabase_migrations.schema_migrations`, đối chiếu các migration trong repo và kiểm tra database thử nghiệm không có dữ liệu thật. Kiểm tra CLI ngày 14/10/2026 xác nhận các bảng vé/vote đã tồn tại, và chưa có user, đơn hàng, phiếu vote hay yêu cầu mua vé bổ sung. Không suy ra lịch sử migration chỉ từ HTTP 404 của publishable API.
3. Chạy `npm run typecheck`, `npm run lint`, `npm test`, `npm run db:test` và các E2E. Chỉ áp những migration chưa có, theo thứ tự. Migration mới: `20261014120001_reconciled_admin_event_settings.sql`.
4. Dùng CLI `db query --linked --project-ref ...` để đọc trạng thái. SQL là đối số hoặc tệp qua `--file`. Việc áp migration phải ghi lịch sử tương ứng, trong cùng transaction do migration runner quản lý; không chạy riêng file SQL. Dùng `db push --linked --project-ref ifgtyslifgegwcguysbb --skip-vault --dry-run` trước khi áp; không include seed hoặc roles và không đổi vault secrets. Nếu CLI yêu cầu password, nhập tại terminal riêng, không truyền secret trong command line/chat.
5. Tạo cấu hình riêng `apps/api/.dev.vars` theo `.dev.vars.example`: publishable key, server-only secret key, origin `http://127.0.0.1:5173`, `DEMO_MODE=false`. Không đổi/rotate key để hoàn thành nhiệm vụ này.

Migration `20261014120000_supplement_purchases` đã được lấy nguyên bản từ lịch sử remote và đưa vào repo. Migration quản trị đã đối chiếu baseline đó, giữ vé bổ sung và vote bán kết, và rollback khôi phục đúng các hàm remote trước đó. Bản migration quản trị đã được sắp sau dependency remote, thành `20261014120001_reconciled_admin_event_settings.sql`, rồi áp thành công vào project thử nghiệm ngày 14/10/2026; lịch sử remote đã xác nhận. Bản sao schema/hàm/constraints/policies/grants trước thay đổi nằm trong `output/qa/trial-before-admin.json`; SQL lịch sử remote nằm trong `output/remote-baseline/`. Các tệp output không thuộc Git. Nhãn “Production” trên Dashboard là nhãn nhánh chính của Supabase; phạm vi cho phép trong nhiệm vụ này chỉ là project thử nghiệm được chỉ định.

Backend local đã được nối tới đúng project qua tệp `.dev.vars` riêng, giới hạn quyền đọc trên Windows và không thuộc Git. Kiểm tra sau migration (`output/qa/trial-after-admin-smoke.json`) xác nhận các RPC cấu hình/cấp admin từ chối actor không hợp lệ, RPC mở vote 10 phút cũ không còn quyền service role, và HTTP quản trị từ chối khách. Hai bảng giá/đợt bán bật RLS và không cấp SELECT cho client. Advisor chỉ báo INFO về các bảng RLS không có policy; đây là các bảng chỉ cho backend truy cập, đã thu hồi quyền client ([giải thích của Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). Google provider đã được bật sau lần kiểm tra này; cả hai Gmail được chỉ định đã có SUPER_ADMIN. RPC đọc cấu hình đã xác minh hoạt động ở aal1. Chưa tạo tệp mật khẩu riêng cho các tài khoản đã có quyền.

## Cấu hình Google OAuth

Trong Google Cloud của bạn, tạo OAuth client loại **Web application**, đặt audience ở chế độ thử nghiệm và thêm `bancotaima1235@gmail.com` vào test users.

- Scope chỉ `openid`, email và profile; không xin quyền Gmail.
- Authorized redirect URI: `https://ifgtyslifgegwcguysbb.supabase.co/auth/v1/callback`.
- Cấu hình origin local nếu Google yêu cầu, dùng `http://localhost:5173`; có thể truy cập Vite qua localhost. Giữ origin backend khớp đúng URL trình duyệt khi đổi giữa localhost và 127.0.0.1.
- Trong Supabase Dashboard → Authentication → Sign In / Providers → Google: bật provider và điền Client ID/Client Secret. Client Secret không được đặt trong biến `VITE_*`.
- Supabase URL Configuration: thêm chính xác `http://127.0.0.1:5173/tai-khoan/oauth-callback` và `http://localhost:5173/tai-khoan/oauth-callback`. Giữ các redirect email/recovery hiện có. Không dùng wildcard production.

Tài liệu chính thức: [Google OAuth trên Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google).

Chỉ chuyển `.env.local` sang `VITE_PREVIEW_MODE=false` sau khi API/config thực đã sẵn sàng. Chạy `npm run dev:api` và `npm run dev` trong hai terminal. Frontend gọi `/api` qua proxy hiện có. Password login còn cần Turnstile site key, CAPTCHA provider và MFA; không bỏ kiểm tra này để đăng nhập tạm. Các luồng upload/email cần bindings và provider riêng, không được tự coi là đã kết nối trong nhiệm vụ này.

Backend xác minh token bằng `getClaims` của SDK rồi kiểm tra user hiện tại qua Auth server, issuer, audience và thời hạn. SDK hỗ trợ cả khóa bất đối xứng và HS256 cũ bằng xác minh server, không nhận claims chưa xác minh và không cần rotate signing key ([tài liệu getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims)).

## Cấp admin thật

1. Dùng nút Google để đăng nhập bằng `bancotaima1235@gmail.com`. Không tạo tài khoản khác hoặc auto-confirm email để vượt bước xác minh.
2. Đặt `ADMIN_EMAIL` trong `.dev.vars` bằng email đó.
3. Chạy `node scripts/bootstrap-admin.mjs --staging --project-ref ifgtyslifgegwcguysbb`. Script kiểm tra user đã xác minh và có Google identity, tạo mật khẩu ngẫu nhiên 24 ký tự, cấp role bằng RPC server-only và ghi audit.
4. Thông tin đăng nhập nằm ngoài repo, tại `%LOCALAPPDATA%/FTUCHARM/admin-ifgtyslifgegwcguysbb.secret`. Trên Windows file được giới hạn quyền cho user hiện tại và SYSTEM. Script chỉ in đường dẫn; không in password. Retry dùng lại tệp của đúng user/project. Nếu đã có `SUPER_ADMIN`, không đổi mật khẩu.
5. Vào trang tài khoản rồi dùng “Mở quản trị” tới `/admin/cau-hinh`. TOTP là tùy chọn, không phải điều kiện vào quản trị của SUPER_ADMIN.

Nếu bootstrap báo lỗi, không tự tạo user trùng, không bỏ xác minh và không đưa service key lên frontend. Chưa có file bàn giao khi chưa xác minh được tài khoản Google thật.

## Quy tắc và tương thích

- Vote sử dụng giờ Việt Nam trên form, UTC tại API và database clock để nhận phiếu. `SCHEDULED` có thể nhận phiếu khi đến giờ mà không chờ cron. Trước giờ mở sửa cả hai mốc; khi đang mở chỉ sửa giờ đóng kèm lý do; không mở lại phiên đã kết thúc qua trang cấu hình. Danh sách hợp lệ bị khóa khi đến giờ mở.
- Baseline remote cho phép vé đã phát hành của đúng tài khoản bỏ phiếu hạng mục mà không cần check-in, gồm vé bổ sung; frontend và các hàm vote giữ quy tắc đó. Vote legacy không theo hạng mục giữ quy tắc riêng đang có.
- API mở vote cũ yêu cầu body thời gian, dùng cùng RPC kiểm tra mới. Các RPC 10 phút cũ bị thu hồi quyền `service_role`; giữ định nghĩa để rollback và đọc lịch sử. Form quản trị cũ không được xóa hoặc sửa riêng giờ vote.
- Mỗi sự kiện có đợt REGULAR và EARLY tùy chọn, hai giá theo hai hạng vé. Lịch bán sớm kết thúc không muộn hơn lúc bán thường mở. Giờ đóng là exclusive; không bán trong khoảng trống giữa đợt.
- Quote gồm phase ID và revision; giữ ghế kiểm tra lại sau khi lấy locks. Đơn đã tạo giữ nguyên `order_items.unit_price_vnd`, kể cả khi đổi giá. Request cũ thiếu quote không được đặt theo phase mới; catalog legacy không có phase vẫn giữ contract cũ.
- Không tự tạo/sửa sơ đồ ghế, công bố mùa/vòng hoặc mở bán khi lưu cấu hình. Chưa có sự kiện hoặc chưa đủ hai hạng vé sẽ có trạng thái hướng dẫn. Cấu hình event inventory là luồng chuẩn bị dữ liệu riêng đang có.

## Kiểm thử và rollback

`npx playwright test --config playwright.auth.config.ts` dùng auth provider và API giả lập, chạy desktop/mobile. Không tạo tài khoản, gửi email, bỏ phiếu hoặc thanh toán thật. Kiểm thử live Google/MFA và lưu trên database thử nghiệm phải làm sau khi kết nối dịch vụ; kết quả mock không thay thế nghiệm thu live. Kiểm thử PGlite xác minh invariants; không coi đó là phép đo concurrency/row-lock trên PostgreSQL nhiều kết nối.

Docker local hiện chưa phản hồi được engine, nên chưa chạy kiểm thử PostgreSQL nhiều kết nối. Không thay thế bằng load test trên Supabase remote. Google đã được cấu hình và quyền admin đã được xác nhận. Chưa nghiệm thu việc lưu lịch vote thật vì mùa/vòng hiện còn nháp và chưa có thí sinh hợp lệ; không tự công bố hoặc tạo dữ liệu để vượt điều kiện này.

Rollback mới ở `supabase/rollbacks/20261014120001_reconciled_admin_event_settings.sql`, ngoài migrations. Trước áp thử nghiệm lưu cấu hình và schema backup. Rollback chặn nếu có đơn gắn phase hoặc audit của thay đổi lịch/giá; cần review để bảo toàn giao dịch. Sau rollback deploy lại code tương thích cũ trong môi trường thử nghiệm. Không chạy rollback production.
