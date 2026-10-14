# Thử mua vé ghi Supabase ngày 14/10/2026

Người dùng đã xác nhận giá tạm100.000đ, rồi chọn **Test DEMO, ghi vào Supabase**. Phạm vi này cho phép cấu hình và đơn thử trong project `ifgtyslifgegwcguysbb`; không chuyển tiền, gửi email, deploy hoặc đo tải online. Các quyết định này mới hơn giới hạn fixture local ở tài liệu cũ.

## Link và thao tác thử

[Trang vé DEMO](http://127.0.0.1:5173/ve/test-giao-dich-demo). [Danh sách khách đã mua vé](http://127.0.0.1:5173/admin/ve).

Đăng nhập tài khoản website đã xác minh email, sau đó dùng menu **Vé** → **Xem vé & combo**. Chọn số lượng/combo → Xác nhận vé & combo → bảy thông tin giả → Xác nhận thông tin → QR DEMO/đếm ngược30 phút → Tiếp tục gửi minh chứng → ảnh giả → Hoàn tất. Có thể dùng `output/demo-test/proof-demo.png` trên máy này. Không chuyển tiền thật.

Auth hiện giữ token trong bộ nhớ theo thiết kế bảo mật đã có. Dùng liên kết/menu trong trang sau đăng nhập; tải lại toàn trang có thể yêu cầu đăng nhập lại. Không đổi cơ chế lưu phiên trong tác vụ này.

Sau gộp Git `8115e0f`, frontend5173 nối backend8787 chạy local, xác minh Supabase Auth thật và ghi database thật. Cấu hình loopback chặn thao tác ngoài đơn/offer DEMO đã được duyệt. Admin chỉ được lưu cấu hình DEMO đúng mùa/vòng qua link này và vẫn cần quyền do ứng dụng kiểm tra; SUPER_ADMIN có MFA tùy chọn theo quyết định dùng Git mới. Xem [báo cáo gộp](git-sync-admin-customers-20261014.md) cho kiểm tra và trạng thái mới nhất.

## Dữ liệu cấu hình

- Offer `5c682921-682e-4a24-8f1c-6acd04550fae`, slug `test-giao-dich-demo`, modeDEMO, có công bố để thử.
- Mùa DEMO `f05ac84c-5c71-4ebd-8daa-de7a6fa8dbec`; vòng DEMO `cef5c008-a7c1-4f6b-b5e1-e8c361edf0e2`. Không đổi mùa/vòng FTUCharm2027 đã có.
- The Intro, The Bridge, The Chorus × EARLY/NORMAL: sáu cấu hình.
- Giá đơn100.000đ; Combo2=200.000đ; Combo3=300.000đ. Giá combo tính đủ2/3 vé, chưa áp dụng giảm giá.
- Quota thử100 vé mỗi hạng/tier, cửa sổ7 ngày. Đóng thử21/10/2026 lúc19:50:26 theo giờ Việt Nam. Đây không phải quota hoặc lịch mở bán chính thức2027.
- Offer LIVE `chung-ket-2027` vẫn chưa công bố, không có đơn.

Ảnh chuyển WebP và lưu trong **R2 local** dưới `.wrangler/state/demo-test` theo cấu hình Wrangler; Supabase lưu metadata/key và thông tin đơn/vé. Giữ thư mục persistence này để xem lại ảnh thử sau khởi động lại. Chưa provision R2 online, chưa lưu ảnh vào Supabase Storage. Không tự xóa ảnh/bản ghi thử.

## Đổi giá và cấu hình sau này

Admin → **Bán vé theo bổ sung** → chọn đợt. Form có giá vé đơn, giá Combo2/3, quota, giờ mở/đóng, bật/tắt từng hạng, mode và trạng thái công bố. Thời gian hiển thị/nhập là giờ Việt Nam UTC+7. Để trống giá combo để tắt combo; tắt bán giữ lịch sử thay vì xóa sản phẩm.

Các ID sản phẩm được giữ nguyên khi chỉnh giá. Giá mới chỉ áp dụng đơn mới; đơn đã giữ giữ giá/lịch hết hạn trong snapshot. Quota không được thấp hơn số vé đã cấp và đang giữ còn hạn. Form kiểm tra giờ đóng sau giờ mở, giá nguyên dương và cấu hình LIVE trước công bố; backend/DB tiếp tục kiểm tra quyền và invariants.

Ngày kiểm tra DEMO ban đầu có2 tài khoản SUPER_ADMIN và4 email xác minh, gồm1 tài khoản DEMO tạo riêng cho kiểm thử này, không cấp role cho tài khoản DEMO. Các thay đổi tài khoản/role khác không do tác vụ này thực hiện. Sau gộp, đã đối chiếu11 migration local/remote, gồm `reconciled_admin_event_settings` và `admin_optional_mfa`; SUPER_ADMIN không bắt buộc MFA. Đây là đối chiếu tên/version migration, không xác nhận toàn bộ runtime đã online.

## Bằng chứng

- API thật/Supabase Auth thật: đơn `ffe700e0-1361-443f-8efe-042101a056e5`, Combo2,200.000đ,COMPLETED,2 vé. Retry Hoàn tất giữ2 vé, TTL30 phút, ảnh private; unauth đọc ảnh trả401. Link thử chặn ghi ngoài scopeDEMO.
- Browser mobile390px: đơn `abe714d7-4163-4369-8993-e5b5b56cffcf`, Combo3,300.000đ,COMPLETED,3 vé. Đã chọn ảnh trắng rồi thay ảnh xanh trước gửi. Xem lại ảnh từ storage đúng pixel xanh, không tràn trang hoặc lỗi JavaScript.
- Hai đơn có minh chứng WebP154 bytes/ảnh, tổng5 vé. SQL đọc lại status/quantity/total/ticket_count và soldcounterTheIntroEARLY=5. Không ghi PAID hoặc thực nhận tiền từ ảnh.
- Bài browser đầu dùng tải lại trang nên mất phiên đúng thiết kế; sửa test dùng menu/SPA. Bài tiếp theo đã lưu đơn nhưng assert nhầm câu thông báo; sửa assert và đọc lại đơn đã Hoàn tất, không tạo đơn trùng. Kiểm tra cuối xác nhận ảnh decode trong browser. Không sửa Auth hoặc dữ liệu để làm test đạt.
- 143 tests thường đã đạt trong lần chạy cuối; một native PostgreSQL test bị skip vì chưa opt-in trong lượt này. Tests mới kiểm tra editor, đổi giá giữ snapshot, giảm quota sai và giới hạn entryDEMO kể cả lưu cấu hình admin đúng scope. Kết quả và source hashes xem `ticket-sales-demo-verification.json`.
- Typecheck/lint/build đã chạy; build có cảnh báo chunk3D lớn đã tồn tại. Không đo tải online hoặc test chuyển tiền/email thật.

Artifacts ignored: `output/demo-test/http-verification.json`, `browser-verification.json`, screenshotQR/mobile và typesWrangler. Credentials tài khoản thử chỉ ở file `.secret` ignored, không nằm trong báo cáo/source/Git.

## Chạy lại trên máy này

```powershell
# Chỉ sau khi đã kiểm tra đúng project và được phép ghi DEMO.
node tools/setup-supabase-demo-local.mjs
npm run build
npm run dev:demo-db
# Terminal thứ hai:
npm run dev -- --strictPort
```

Script setup đọc cấu hình có sẵn từ file ignored, không in khóa và không ghi đè cấu hình khác. Cần giữ `.env.local` và `apps/api/.dev.vars.demo-test` ngoài Git. Dùng `--local`, không dùng deploy/remote/tunnel cho môi trường thử này. Images/R2 dùng local bindings theo [tài liệu Cloudflare](https://developers.cloudflare.com/images/optimization/binding/#interact-with-your-images-binding-locally); captcha đăng nhập dùng [test keys chính thức](https://developers.cloudflare.com/turnstile/troubleshooting/testing/).

Hai script kiểm tra HTTP/browser có flag `--run-approved-demo`, chỉ chạy khi đã được duyệt tạo/ghi fixture lên project này. Chúng giữ tài khoản/đơn đã tạo để retry không làm thêm dữ liệu. Script SQL cấu hình ở `tools/configure-supabase-ticket-demo.sql`, có transaction/guard chống ghi đè khi chạy lại. Không dùng giá, quota và lịch của đợt thử làm cấu hình LIVE khi chưa chốt với BTC.
