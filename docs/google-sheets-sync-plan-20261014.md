# Google Sheets và trạng thái vận hành — 14/10/2026

Đã kiểm tra Git, dựng bảng Data và triển khai source đồng bộ để kiểm thử local. Đồng bộ Google–Supabase chưa được kích hoạt: website chưa deploy HTTPS, Apps Script chưa deploy/xác thực và migration mới chưa áp lên database thật.

Cập nhật15/10/2026: đã bổ sung cột M **Số lượng combo** cho cả hai tab; tổng19 cột, metadata ẩn chuyển sang P:S. Đối chiếu dữ liệu/kiểm tra mới tại [báo cáo số lượng combo](google-sheets-data-audit-20261015.md); các ghi nhận18 cột bên dưới là lịch sử trước bổ sung.

Git khi bắt đầu: `main` và `origin/main` cùng `6914289de0c4fe42022b9bb0d51ca5dc8a585790`, ahead/behind0/0; không có bản mới hơn để tải. Giữ một thư mục `D:\WED_sk_FTU`, bảo toàn tài liệu đang có, xây dựng trên nhánh `codex/google-sheets-sync-20261014`. Người dùng sau đó yêu cầu đẩy nhánh và gộp `main`; kết quả commit/merge đối chiếu trong lịch sử Git. Bàn giao Git không kích hoạt migration, deploy hoặc trigger online.

## Yêu cầu người dùng đã xác nhận

- Dùng Google Sheets trên Drive, tải xuống `.xlsx` khi cần.
- Cập nhật mỗi một phút khi đang sử dụng bảng.
- Đồng bộ hai chiều: Supabase lên bảng; sửa được phép trên bảng ghi lại Supabase.
- Sửa Email chỉ thay thông tin liên hệ; giữ nguyên tài khoản sở hữu đơn/vé/vote theo xác nhận người dùng.
- Người dùng đã chốt: chặn giảm số vé xuống dưới số **vé khác nhau đã được dùng để vote**, giữ nguyên đơn và các phiếu khi từ chối. Ví dụ3 vé,2 vé đã vote, sửa xuống1 phải bị từ chối. Một vé đã vote ở hai hạng mục vẫn chỉ tính là một vé đã dùng, không tính hai vé.
- Người dùng yêu cầu hiển thị số người đã vote và đóng khi hết thời gian. Giữ riêng số tài khoản đã vote và tổng phiếu theo hạng mục để không nhầm một tài khoản có nhiều vé với nhiều người; không suy ra thay đổi quy tắc một phiếu/vé/hạng mục.
- Người dùng chọn sửa **tất cả các cột nghiệp vụ**. Không còn áp đề xuất chỉ sửa bảy thông tin người mua; không tự chặn mọi thay đổi chỉ vì đơn đã có phiếu. Quy tắc giảm số lượng tối thiểu đã được chốt như trên.
- Thư mục đích: [FTU_DATA](https://drive.google.com/drive/folders/135fZ0togpOpVqe2ugXvv-DzlPxwEL-FM), bảng [Data](https://docs.google.com/spreadsheets/d/1n6nbwjErwOCsh-auVyOUmVP5jTIRsud45ADYdRhXViU/edit), tab `Khách mua vé`. Người dùng chọn dùng Data hiện có, hạn chế chia sẻ cả folder và file; sau khi người dùng đổi quyền, metadata xác minh chỉ còn owner, không có `anyone:writer`. Bảng chỉ có dòng DEMO không liên kết đơn database.
- Theo bổ sung: chỉ lưu thông tin/minh chứng để team kiểm tiền thủ công. Không thêm xác nhận thanh toán tự động, webhook, check-in hoặc email vé tự động.

## Còn cần xác nhận trước phần phụ thuộc

- Google Drive đã kết nối bằng owner; quyền bảng/thư mục đã xác minh. Chưa cấp thêm quyền cho team.
- Không còn câu hỏi về giảm số lượng dưới số vé đã vote hoặc email sở hữu. Ngoại lệ chỉnh sửa đơn đã hoàn tất chỉ có trong RPC admin mới; người mua vẫn giữ quy tắc immutable.
- Phương thức xác thực đồng bộ phải dùng quyền được giới hạn và audit, phù hợp Auth chung; không đặt Supabase secret/service key trong ô bảng hoặc mã công khai.
- Người dùng xác nhận website chưa deploy. Backend hiện ở loopback; cần HTTPS, bindings ảnh và callback/Auth đúng trước activation. Chưa tự deploy hoặc mở tunnel.

## Contract đề xuất không phụ thuộc lựa chọn cột

- Supabase là nguồn dữ liệu chính. Mỗi dòng gắn UUID đơn và revision; không xác định đơn bằng số dòng hoặc email người mua.
- Tab `Database hiện hành` chỉ đọc nhận toàn bộ dữ liệu mới từ Supabase. Tab `Khách mua vé` giữ bản chỉnh sửa; job nền không ghi đè A:L của dòng đã có hoặc xóa/sắp xếp dòng. Khi database đổi ngoài Sheet, đánh dấu cần đối chiếu. Màn hình Apps Script owner cho xem hai bản và xác nhận gửi draft trên revision đã xem; thay đổi ô/revision sau preview bị từ chối. Snapshot lệnh cố định tránh gửi payload khác dưới cùng operation ID khi retry.
- Ghi ngược qua backend có kiểm tra quyền, validation, kiểm tra thay đổi cho phép và audit; không ghi trực tiếp bằng key toàn quyền từ bảng. Gửi lại cùng thay đổi không tạo đơn/vé/phiếu mới.
- Khi thay số lượng/loại/combo: kiểm tra đơn/revision, khóa dữ liệu cần thiết theo thứ tự cố định và tính lại quota trong cùng transaction. Giữ các UUID vé đã vote và toàn bộ phiếu; khi giảm, chỉ xử lý vé chưa vote để số vé còn hiệu lực khớp số lượng mới, không xóa lịch sử. Nếu không đủ quota hoặc lượng mới dưới số vé đã vote, từ chối toàn bộ chỉnh sửa. Đường vote phải dùng khóa tương thích để không có race giữa giảm vé và gửi phiếu.
- Mã hiển thị sửa được nhưng phải duy nhất; UUID đơn/người sở hữu/vòng không đổi bởi thao tác sửa các cột nghiệp vụ. Không đổi quyền sở hữu qua email liên hệ. Giữ snapshot cũ trong audit để đối chiếu, không báo lại đơn là đã nhận tiền khi sửa bảng.
- Không tin trường email/role gửi từ ô Sheet là danh tính người chỉnh sửa. Cách xác minh actor phải được kiểm chứng với cơ chế Google/Auth được chọn.
- Sheet chỉ chia sẻ cho team được phép quản lý. UUID hệ thống/revision dùng xác định bản ghi được bảo vệ, tách khỏi mã vé hiển thị có thể sửa theo yêu cầu. Backend tự kiểm tra quyền, mã không trùng và nghiệp vụ đã chốt; bảo vệ ô không thay thế authorization.
- Sửa minh chứng qua JPG/PNG≤5MB đặt trực tiếp trong FTU_DATA; API kiểm tra/biến đổi ảnh và lưu phiên bản riêng, chỉ đổi ảnh hiện hành khi transaction thành công. Giữ ảnh cũ/audit; Storage ảnh online chưa triển khai.
- Hiển thị thời điểm đồng bộ cuối, lỗi và thay đổi chưa lưu. Chỉ báo thành công khi database xác nhận. Đồng bộ đọc phải phân trang đầy đủ, không chỉ lấy50/100 bản ghi như UI hiện tại.
- Xuất `.xlsx` là bản dữ liệu tại thời điểm tải; không mô tả file offline là tự đồng bộ. Link ảnh phải giữ quyền truy cập, không công khai minh chứng.

## Điều kiện kiểm tra trước bật đồng bộ

- Cùng đơn3 vé: dùng2 UUID vé để vote, sửa xuống1 bị từ chối và không đổi quota/đơn/vé/phiếu; một UUID vote ở hai hạng mục chỉ tính một vé đã dùng.
- Sửa lượng trong giới hạn được chốt không làm mất phiếu đã ghi; hai tác vụ sửa/vote đồng thời vẫn giữ đúng invariants. Không vượt quota khi hai người tăng số vé.
- Sửa email không đổi user_id hoặc quyền đọc/vote. Người không có quyền không đọc/sửa được đơn qua API đồng bộ.
- Hai editor cùng sửa một revision: một bản được ghi, bản còn lại báo xung đột; không mất dữ liệu. Retry cùng operation không tạo thêm thay đổi/vé.
- Refresh không ghi đè ô đang sửa; lỗi sync giữ thay đổi chờ xử lý và hiển thị lỗi. Xuất toàn bộ dòng đã đồng bộ, có thời điểm cập nhật cuối.
- Bảng thử dùng dữ liệu giả. Tích hợp Google/OAuth và thao tác xung đột thật trên Google, cùng race nhiều kết nối PostgreSQL vẫn cần nghiệm thu trước activation.

## Source và kiểm tra trong lượt build

- Migration `20261014160311_google_sheets_purchase_edits.sql`: revision, audit/idempotency, ngoại lệ transaction cho admin sửa đơn, khóa quota/vé, giữ UUID đã vote, phiên bản ảnh. Rollback từ chối nếu đã có lịch sử sửa/ảnh cần bảo toàn. Chưa áp lên Supabase thật.
- API `/api/admin/sheets/purchases?page=...`, POST sửa đơn và stage ảnh dùng Auth/RBAC chung; TICKET_STAFF cần MFA trừ SUPER_ADMIN theo Git mới. Audit ghi danh tính admin tích hợp, không coi email trong ô là danh tính editor.
- `tools/google-sheets/Code.gs`, manifest và README: script standalone owner, PKCE phiên riêng, token trong Script Properties, trigger một phút/onEdit, state nội bộ bảo vệ. Trigger nền cũng chạy khi bảng đóng; lịch Google không bảo đảm chính xác từng giây. Chưa deploy/chạy trigger hoặc nghiệm thu OAuth thật.
- UI vote có số tài khoản đã vote và tổng phiếu; không trả thông tin khách. Worker scheduled đóng phiên OPEN hết giờ, không finalize/publish. Database chưa có RPC mới thì UI giữ tương thích bằng participation null.
- Full suite cuối: **194 tests đạt, một test native bỏ qua**, 22 files đạt; Apps Script unit8/8. Native PostgreSQL127.0.0.1:55433 không chạy (ECONNREFUSED), chưa kiểm chứng race mới bằng nhiều kết nối thật.
- Playwright Auth/admin hồi quy đạt10/10 desktop/mobile: quyền admin/khách, MFA tùy chọn, danh sách khách/minh chứng/CSV và callback website. Đây không phải nghiệm thu callback Apps Script Google thật.
- Khi bàn giao Git, public E2E đạt49/50 với2 workers; test animation 3D mobile bị timeout chờ canvas thay đổi. Chạy lại riêng đúng test bằng1 worker đạt1/1 (12,3 giây), không sửa code/test. Không mô tả lần chạy chung là50/50 hoặc khẳng định nguyên nhân timeout đã được chứng minh. CI trên GitHub cần đối chiếu kết quả riêng.
- Lint/typecheck, production build, Wrangler dry-run đạt. Build có cảnh báo chunk Three.js lớn; dry-run không deploy và chỉ ra cấu hình top-level chưa có domain/MEDIA/IMAGES thật.
- Read-back Google xác minh18 cột, header cố định, filter, validation combo, metadata bảo vệ/ẩn và phone text. Export/render QA mẫu local: renderer đọc sai text số0 và ô ngày trống khi import; dùng native cell values để đối chiếu chính xác. Chưa kiểm thử workbook có khách thật hay OAuth/trigger end-to-end.

## Điều kiện kích hoạt tiếp theo

1. Chọn và duyệt runtime HTTPS/ảnh online. Cấu hình domain/Origin, MEDIA/IMAGES, Auth và CAPTCHA theo môi trường; bảo toàn/chuyển ảnh đang ở R2 local để các đơn cũ không mất minh chứng khi xem online.
2. Backup và review migration/rollback trên project chứa dữ liệu thật; chạy kiểm tra cạnh tranh nhiều kết nối test trước khi áp migration mới lên Supabase. Không dùng rollback xóa lịch sử sau khi đã chỉnh sửa.
3. Owner tạo standalone Apps Script với source/manifest hiện có, callback owner-only, redirect allowlist cụ thể và phiên admin PKCE riêng. Chưa có công cụ connector để tự deploy Apps Script/trigger.
4. Nghiệm thu bằng dữ liệu giả: đơn mới lên cả hai tab, sửa email không chuyển ownership, quantity/quota/vote invariants, thay ảnh giữ bản cũ, hai editor/revision, timeout/idempotency, xung đột sau preview, xuất `.xlsx` và giới hạn request/Google quotas.
5. Chỉ sau khi đạt mới bật job mỗi phút trên bảng thật. `.xlsx` tải xuống là snapshot; không tự đồng bộ ngược database khi sửa file offline.

## Đối chiếu DEMO và phần thật

Đọc code, cấu hình local và truy vấn chỉ đọc project Supabase ngày14/10/2026:

| Phần                          | Hiện trạng                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth/người dùng/admin         | Supabase Auth thật; có4 user xác minh. Không còn tình trạng chưa có tài khoản ở báo cáo cũ.                                                                       |
| Đơn/thông tin/vé sau Hoàn tất | Ghi thật vào Supabase; không chỉ mock UI. Không xác nhận tiền đã nhận.                                                                                            |
| Danh sách khách/CSV/Sheet     | API thật; bảng Data đã dựng mẫu và có source sync. Tải `.xlsx` từ Sheets được; chưa có dữ liệu khách thật/đồng bộ tự động.                                        |
| Backend/web                   | Vite5173/Worker8787 local; chưa có bằng chứng deploy bản này lên domain online. Health `mode:live` chỉ là DEMO_MODE=false, không chứng minh đã triển khai online. |
| Giới hạn entry thử            | `demo-test.ts` chỉ cho host loopback và ghi đúng đợt DEMO; các POST vote/ngoài scope không đi qua môi trường thử này.                                             |
| Offer/giá/quota/combo/QR      | Một offer DEMO công bố, một offer LIVE chưa công bố. Cấu hình thử không là thông số BTC công bố.                                                                  |
| Ảnh                           | R2 local có ảnh; Supabase metadata có liên kết. Supabase Storage có0 bucket tại lần đọc này.                                                                      |
| CAPTCHA                       | Site key local là test key chính thức, chưa nghiệm thu CAPTCHA thật.                                                                                              |
| Phiên vote                    | Supabase chưa có bản ghi `vote_sessions`; các vòng đọc được chưa có cặp giờ mở/đóng. Có code/tests nhưng chưa có phiên sự kiện thật để nghiệm thu online.         |
| Tải/bảo mật tích hợp          | Đã có tests/CI và benchmark local; chưa chứng minh tải và luồng đầy đủ ở runtime online.                                                                          |

Không coi các phần chủ động bỏ theo bổ sung (payment provider, email vé tự động, check-in) là nhiệm vụ còn thiếu. Phần CMS/thí sinh/lịch đăng ký thuộc người thứ nhất; cần phối hợp cấu hình dữ liệu dùng chung trước mở bán/vote.
