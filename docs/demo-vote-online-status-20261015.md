# Mua vé, Sheet và demo bình chọn — 15/10/2026

**Cập nhật cuối:** người dùng yêu cầu dừng kích hoạt do tài khoản dịch vụ không thuộc họ; chỉ push nhánh, admin khác làm phần còn lại. Xem [bàn giao đầy đủ](HANDOFF-ONLINE-TEST-ADMIN-20261015.md). Không áp migration/deploy/fixture mới hoặc bật trigger. Đã sao lưu phạm vi nghiệp vụ/hàm bằng DPAPI local và đối chiếu10 bảng không đổi; CLI đăng nhập chưa hoàn tất và đã dừng.

## Trạng thái đã kiểm tra trực tiếp

Website `https://ftucharm-test.bancotaima1235.workers.dev` vẫn trả health `mode=live`. Catalog truy vấn slug `test-giao-dich-demo` trả HTTP200 nhưng không có offer; API vote vòng DEMO trả404. Đăng nhập admin không tự thay đổi mùa/scope catalog hoặc phiên bản code đã deploy. Không dùng HTTP200 của trang HTML admin để chứng minh tài khoản đã đọc được dữ liệu riêng tư.

Supabase project `ifgtyslifgegwcguysbb` có6 đơn DEMO COMPLETED,15 vé issued. Vòng DEMO `cef5c008-a7c1-4f6b-b5e1-e8c361edf0e2` đã published nhưng chưa có round_entries, hạng mục, phiên vote hoặc phiếu. Các số này là truy vấn chỉ đọc; không tạo thêm fixture trong lượt này. Remote có14 migrations và chưa có Edge Function nào.

Callback Apps Script đã lưu ở hai nơi theo `apps-script-callback-20261015.md`, nhưng chưa đăng nhập phiên tích hợp/chạy installer hoặc xác minh trigger. Sheet hiện có snapshot lịch sử; không được báo đơn mới sẽ tự vào Sheet chỉ vì đã deploy Web app hoặc thêm redirect. Hoàn tất và ghi đơn vào database với đồng bộ Sheet là hai bước khác nhau.

## Thay đổi đã chuẩn bị local

- `DemoTicketLinks`: admin tổng quan và trang khách mua vé có liên kết vào từng đợt DEMO đã công bố, kèm đường dẫn vote đúng vòng. Không tạo offer, mở lịch hay tự cấp vé cho admin.
- Trang vote có BXH tạm **chỉ DEMO**, từng hạng mục riêng, thứ hạng đồng hạng khi số phiếu bằng nhau, gồm thí sinh0 phiếu. Cập nhật mỗi15 giây, sau vote thành công và nút Cập nhật BXH. Phiếu mỗi vé/hạng mục và retry giữ nguyên; không đổi cách công bố kết quả LIVE.
- RPC `read_demo_vote_leaderboard` là aggregate SQL một snapshot, không trả UUID vé/tài khoản/người mua. Chỉ service_role được gọi, SECURITY INVOKER; loại vòng unpublished hoặc có offer LIVE. API chỉ gọi cho vòng của offer DEMO đã cấu hình trong môi trường. Migration chưa có thì trả BXH chưa có dữ liệu, không giả thành0 phiếu.
- Migration local `20261015081633_demo_vote_leaderboard.sql` và rollback chỉ thêm/bỏ hàm đọc; không sửa vé/phiếu/history. Chưa áp remote.

## Kiểm tra

Tests database/HTTP tập trung32 đạt; UI unit cuối3 đạt; E2E4 đạt (desktop/mobile), gồm nút DEMO admin, refresh/chuyển hạng mục BXH, không tràn ngang và Axe. Typecheck, lint, build đã đạt; build còn cảnh báo Three.js lớn như trước. Các bài thử dùng database PGlite/HTTP adapter và Auth/API fixture riêng, chặn request dịch vụ ngoài. Không coi screenshot/mock là demo hosted đã mở vote.

Toàn bộ suite sau sửa:268 đạt,1 native PostgreSQL skip; Wrangler online-test dry-run đạt. Sau đó bổ sung thông báo chưa cấu hình phiên DEMO: chạy lại3 UI unit, typecheck/build/diff-check đều đạt. Không cộng bài unit bổ sung này vào số268 của full suite đã chạy trước đó. Đây là đóng gói local, không phải deploy hoặc kiểm chứng load/race trên Supabase thật. Không đánh thêm X vào Word từ kết quả local này.

## Kích hoạt online còn thiếu

1. Review/backup/apply4 migrations pending: Sheets `20261014160311`, deadline `20261015024905`, quota safety `20261015032157`, BXH DEMO `20261015081633`. Project có dữ liệu thật; không tự áp khi chưa được duyệt theo AGENTS.md.
2. Triển khai và smoke Edge codec `ftu-proof-transform` với static WASM, private Storage, Auth/HMAC/ownership. Không bỏ codec hoặc lưu raw để vượt yêu cầu runtime. Đã kiểm tra lại CLI2.121.0 deploy help và không có Docker CLI trên máy; phải giải quyết đóng gói static WASM trước bước triển khai, không tự cài Docker hoặc coi cờ use-api là bằng chứng bundle đã đủ file.
3. Deploy Worker `online-test` đúng source đã kiểm tra, giữ fence chỉ ghi offer DEMO và email tắt; không sửa lịch/giá/quota LIVE. Push/merge main hiện kích hoạt Cloudflare Builds nên cũng là deploy, không tự thực hiện.
4. Kết nối OAuth Apps Script bằng owner SUPER_ADMIN rồi chạy `installFtuSync()`. Xác minh cả hai trigger mỗi phút và cập nhật DEMO thật ở các tab, không dùng import snapshot thay chứng minh tự đồng bộ.
5. Tạo thí sinh/hạng mục/phiên DEMO riêng bằng dữ liệu giả; thử mua→ảnh→Hoàn tất→Sheet→vote→BXH, retry và hết giờ. Admin cũng cần vé thuộc chính tài khoản mình; không dùng vé của khách hoặc vòng LIVE. Không mở lại phiên đã đóng.

Link dự kiến sau kích hoạt (hiện chưa hoạt động trọn luồng): `/ve/test-giao-dich-demo`, `/binh-chon?vong=cef5c008-a7c1-4f6b-b5e1-e8c361edf0e2`, `/admin/ve`. Chưa có bằng chứng mới về tải/hosted codec/trigger hai chiều. Không gửi email hoặc chuyển tiền.
