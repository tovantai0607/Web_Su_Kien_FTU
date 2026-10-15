# Kho mã vé và ba tab Data — 15/10/2026

## Quyết định đã xác nhận

Người dùng chọn mỗi vé một mã riêng, Combo3 có3 mã cùng nhóm; đính chính bán kết/chung kết phải là hai tab riêng, bên cạnh tab DEMO. Xác nhận cuối thay500 bằng **700 BK +700 CK**, và **50 DM** để test. Hậu tố là5 chữ số. BK/CK là bán kết/chung kết2027; giữ quota chính thức700/vòng, không phải700 cho từng hạng Intro/Bridge/Chorus.

- `Vé bán kết` (`gid=202`): BK00001–BK00700.
- `Vé chung kết` (`gid=204`): CK00001–CK00700.
- `Vé DEMO` (`gid=203`): DM00001–DM00050;11 đã liên kết vé DEMO cũ,39 chưa cấp tại lúc kiểm tra.
- Giữ7 thông tin người mua, minh chứng riêng tư, loại/đợt, combo, nhóm và mã lịch sử. Sheet gộp các vé cùng combo/loại trong một đơn thành một dòng, giữ từng mã/UUID thành viên trong database và cột thành viên. Vé đơn và mã chưa cấp vẫn mỗi mã một dòng.
- Hai tab cũ vẫn là bản theo dòng loại/combo để chỉnh sửa đơn. Đổi riêng tiêu đề cộtA sang **Mã đơn**, không đổi dữ liệu/UUID/revision hoặc xóa dòng. Trùng mã đơn trên các dòng của cùng đơn không phải trùng mã vé.

Nhóm combo được giữ để BTC xếp gần nhau; không phải chọn số ghế hoặc cam kết đã gán vị trí ghế. Các mã chưa có người mua là kho mã, không phải vé đã phát hành và không tạo quyền vote.

## Đã thực hiện trên Supabase và Google Sheet

Đã fetch Git: `origin/main` vẫn `3bbb82c`, không thấy main mới hơn trong lượt kiểm tra. Health website200/mode live; catalog công khai hiện hai đợt LIVE, mỗi đợt0 products. Không suy ra bản online đã có những thay đổi local chưa push từ lượt trước.

Migration `20261015041125_ticket_code_register.sql` đã áp vào project được chỉ định sau review/tests, độc lập với3 migration Sheets/deadline/quota còn pending. Ban đầu CLI tạo version040222; sau MCP apply đã đối chiếu và đổi tên file/rollback/references khớp version remote041125, SQL không thay đổi sau apply. Remote hiện14 migration. Không áp3 migration cũ hoặc deploy Worker trong lượt này.

- `ftu_sales_private.ticket_code_batches`: phạm vi offer/vòng, tiền tố duy nhất và sức chứa namespace.
- `ftu_sales_private.ticket_code_slots`: mã generated và PRIMARY KEY, UNIQUE ticket_id/vòng+số thứ tự, liên kết một lần. Bật RLS; không cấp SELECT/write trực tiếp cho anon/authenticated/service_role. Các RPC cần quyền server/role thực tế.
- Trigger AFTER INSERT ticket cấp mã trong cùng transaction Hoàn tất. Khóa batch và UNIQUE ngăn hai người nhận cùng mã; retry không phát thêm mã. Thiếu mã ngoài capacity thì toàn bộ Hoàn tất rollback, không báo thành công hoặc cấp dở.
- Chỉ cấu hình ba offer đã xác nhận. Chuẩn bị đúng1450 slot; không tạo ticket/user/order giả cho1400 mã LIVE. DM có50 slot ban đầu, giữ quota mua hiện hữu; có thể sinh tiếp trong namespace5 chữ số khi mua sau này, không quay lại dùng mã đã cấp.
  -11 vé đã cấp được liên kết mã quản lý DM, không sửa ticket_code lịch sử, UUID, chủ vé hoặc phiếu. Mã cũ có cột riêng để đối chiếu. Mã quản lý vẫn giữ nếu vé bị void theo ngoại lệ Sheet đã chốt; không cấp lại cho người khác.
- Chụp và so fingerprint đầy đủ tickets/purchases trước–sau: **không đổi**; votes vẫn0. Report fingerprint ở `output/ticket-code-register/` bị ignore. Không chứa PII trong tài liệu/Git.
- Lượt đầu đã nhập1450 dòng×24 cột vào2 tab kho mã gộp; lượt đính chính đã tách thành3 tab; đọc lại toàn bộ giá trị khớp source và1450 mã duy nhất. Đọc sentinel đầu/cuối/chuyển BK→CK; ghi chú thời điểm nhập, cột kỹ thuật ẩn, filter/freeze, source tab được bảo vệ. Không đổi quyền Drive (owner + một writer cụ thể, không link/anyone/domain).
- QA.xlsx importer suy nhầm chuỗi shared-string trống thành số26 trong cột nhóm chưa cấp. Đã đối chiếu native cells thực sự trống và chỉ chuẩn hóa bản render local để kiểm tra; không ghi26 hoặc sửa dữ liệu Sheet để chiều theo renderer.
- Đã nhập thông tin/minh chứng/nhóm của11 vé DEMO cũ. Các dòng chưa cấp để trống thông tin khách. Đã xuất.xlsx và kiểm tra bố cục các vùng đầu/cuối/nhóm combo, không đưa ảnh chứa PII lên báo cáo công khai.

## Source và trạng thái tự động

API mới `/api/admin/sheets/ticket-codes?mode=LIVE|DEMO&page=0` trả200 dòng/trang sau Auth/RBAC, với kiểm tra lại role/MFA ở database. `/api/me/tickets` bổ sung `display_code/group_code` theo đúng chủ; vote tiếp tục dùng UUID, không thay unique vote/history. UI vote ưu tiên mã quản lý; danh sách đơn/CSV đổi nhãn Mã đơn. Phần Worker/React mới đang local, chưa deploy.

`tools/google-sheets/Code.gs` bổ sung `syncFtuTicketCodes()` và trigger mỗi phút khi owner chạy installer. Ba tab kho mã là bản nguồn để xem; chỉnh buyer/quantity/combo qua `Khách mua vé` với cơ chế conflict/revision sẵn có. Script đọc LIVE một lần rồi tách theo tiền tố BK/CK; DEMO chỉ nhận DM. Script từ chối khi schema/thứ tự mã khác hoặc số nguồn giảm, không xóa hàng/mã. Chuỗi nguồn có khả năng thành công thức được escape khi setValues; native initial writes dùng stringValue.

**Database tự gắn mã cho Hoàn tất đã hoạt động sau migration. Google Sheets tự làm mới mỗi phút chưa được kích hoạt trong lượt này.** Bản hiện có trong Sheet là snapshot đã kiểm chứng. Website URL được dùng cho `FTU_API_BASE_URL`; URL Apps Script là web-app callback do Google sinh khi triển khai, không phải tên miền Worker.

Đã tìm mime Apps Script trong Drive được kết nối:0 kết quả; thư mục FTU_DATA chỉ có Data. Đã tra plugin hỗ trợ: Google Drive có thể sửa Sheet nhưng công cụ hiện tại không có tạo/triển khai project Apps Script hoặc trigger; không tìm thấy tích hợp phù hợp bổ sung. Không suy ra có URL `/exec` hoặc dùng mật khẩu Git để đăng nhập Google.

Để bật phần Google: owner tạo standalone project private, dùng Code.gs/manifest và hướng dẫn `tools/google-sheets/README.md`; deploy web app owner-only, cấu hình callback chính xác trong Supabase Auth, đăng nhập admin rồi chạy `installFtuSync()`. Cần deploy API mới trước khi installer chạy. Không tạo bound script dùng chung editor của Data vì refresh token riêng không được chia sẻ cho toàn bộ editor. Chỉ phát link callback sau khi Google thực sự tạo deployment.

## Kiểm tra

- Demo mua4 vé mới (15/10): HTTP API local + Supabase Auth thật, đơn `bf0900e2-0bcd-4dda-aee6-76d2a194e63f` gồm1 vé đơn +1 Combo3 cùng The Intro EARLY,400.000đ/COMPLETED. Được cấp `DM00012` đơn và `DM00013–DM00015` combo; giữ4 UUID/chủ vé đúng tài khoản thử. Retry Hoàn tất không cấp thêm. Ảnh PNG giả đã qua xử lý WebP184bytes, lưu Supabase Storage private và tải lại/hash khớp; đọc không đăng nhập trả401. Không chuyển tiền/gửi email hoặc tạo fixture LIVE.
- Đã thêm hai dòng đơn DEMO mới vào hai tab19 cột, giữ nguyên sáu dòng cũ; tab Vé DEMO hiện44 dòng xem, đủ50 mã (15 đã cấp/35 chưa cấp). Nhóm mới `cb3_3_DM00013-DM00015` và vé đơn `DM00012` cùng thông tin người mua/minh chứng/request. Đây là bản chụp cập nhật trực tiếp, chưa nghiệm thu trigger mỗi phút. Bằng chứng riêng ở `output/combo-grouping/mixed-four-verification.json` bị ignore.
- Sau demo4 vé: regression Apps Script **19/19 đạt**, typecheck và lint file test đạt. Đọc lại cả hai tab19 cột xác nhận sáu dòng cũ không đổi, hai dòng mới có tổng4 vé/1 combo/cùng request. Đã render và xem các dòng mới cùng dòng lân cận. BK/CK vẫn700 mã chưa cấp/vòng; không sửa kho LIVE.

- Yêu cầu gộp mới15/10: mỗi lựa chọn combo cùng đơn/loại có một dòng; mã nhãn `cb2_4_DM00012-DM00015` nghĩa2 Combo2/4 vé, còn mã vé/UUID được bảo toàn. Đã đổi ba tab sang header mới24 cột; DEMO từ50 dòng nguồn thành46 dòng xem (7 dòng vé/nhóm đã cấp +39 chưa cấp). Đọc lại46×24 ô khớp source, đủ50 mã duy nhất/11 UUID vé duy nhất, không có dòng dư; kho BK/CK vẫn700 mã/tab. Có bản sao trước sửa trong output/combo-grouping bị ignore.
- Suite register + Apps Script sau sửa gộp: **27/27 đạt**. Bao gồm hai Combo2 thành một dòng, cô lập đơn/loại, không giả dải liên tiếp khi có lỗ, từ chối mã/UUID trùng hoặc nhóm thiếu, ghi bản xem thu gọn/retry, chặn nguồn mất mã và Combo3 vắt qua trang200. Không sửa Supabase/migration/phiếu; không push/deploy hoặc kích hoạt Google trong lượt này.

- Đối chiếu Combo3 ngày15/10: Supabase có đúng nhóm `DM00003–DM00005`, ba mã liên tiếp, cùng một request/tài khoản/thông tin người mua, bundle_size3. Sheet `Vé DEMO!A4:X6` khớp ba mã, nhãn nhóm, mã đơn, bảy thông tin, minh chứng và UUID request; không sửa hoặc tạo thêm đơn online.
- Kiểm thử bổ sung local/PGlite: hai khách đặt trước/sau nhưng Hoàn tất theo thứ tự ngược; khách mua một Combo3 nhận00001–00003, khách mua hai Combo3 nhận00004–00006 và00007–00009, mỗi combo có group riêng, thông tin/chủ vé đúng từng người, retry không cấp dư. Suite register + Apps Script **23/23 đạt**. Đây là transaction test tuần tự trong PGlite; chưa thay thế kiểm thử nhiều kết nối đồng thời/native PostgreSQL hay nghiệm thu tự đồng bộ Google.

- Lượt đính chính tách tab: chuyển700 dòng CK sang tab riêng, giữ nguyên700 BK, đọc lại đủ1400 dòng×24 cột và notes khớp bản trước chuyển, không có mã trùng hoặc dữ liệu CK sót ở tab BK. DEMO vẫn50 mã/11 đã cấp. Giữ header/filter/freeze/ẩn cột kỹ thuật; tab nguồn mới bảo vệ owner-only. Không sửa database, không cấp mã mới hoặc thay quyền chia sẻ.
- Regression Apps Script **14/14 đạt**, gồm định tuyến nguồn LIVE trộn BK/CK sang hai tab riêng và cô lập DEMO. Các kết quả suite rộng bên dưới thuộc lượt tạo kho trước đó.

- Full suite trước những sửa nhỏ cuối: **248 đạt,1 native skip**;29 files đạt/1 skip.
- Suite liên quan cuối gồm register/rollback/HTTP/Apps Script: **27/27**. Bao gồm baseline13 migration thực tế,700BK+700CK,50DM, Combo3/nhóm/unique/retry, backfill giữ lịch sử, rollback khi hết stock, Auth/role/MFA, owner-only codes, chống ghi công thức.
- Typecheck/lint/build đạt; E2E Auth/admin/official **24/24** desktop/mobile. Chưa kiểm chứng race mới bằng nhiều kết nối PostgreSQL native hoặc load online; không chạy fixture mới/thanh toán/email lên LIVE.
- Security advisor không có lỗi RLS mới; hai private tables có INFO vì deny-all không policy là chủ ý. [Giải thích lint RLS/no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Cảnh báo Auth leaked-password protection là cấu hình sẵn có, không tự đổi Auth/secret.
- Giữ Word11/11 local/DEMO lịch sử; không đánh hoàn thành tự động Google/production từ kết quả source/snapshot.

Rollback chỉ gỡ khi chưa gắn bất kỳ mã nào; sau khi11DM được liên kết, giữ migration/history, sửa tiến về trước và không xóa/tái dùng mã.
