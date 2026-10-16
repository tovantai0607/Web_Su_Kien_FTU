# Đồng bộ chỉnh sửa và làm sạch vé — 16/10/2026

## Quyết định đã xác nhận

- Admin/nhân sự vé được xóa từng trường trong bảy thông tin liên hệ hoặc bỏ minh chứng. Việc này cập nhật Supabase; website đọc lại dữ liệu đó. Email liên hệ không thay tài khoản sở hữu.
- Mã vé BK/CK/DM và các khóa nội bộ không được xóa/sửa.
- Xóa sạch bảy trường người mua **và** minh chứng của một dòng trong tab kho mã sẽ thu hồi cả dòng vé/nhóm combo, trả quota, đưa mã về trạng thái chưa cấp để bán lại. Một dòng hai Combo 2 gồm bốn vé sẽ thu hồi cả bốn.
- Nếu bất kỳ vé trong dòng đã vote, chặn toàn bộ thao tác; giữ nguyên dữ liệu và phiếu. Nhóm khác trong cùng đơn giữ thông tin chung.
- Mỗi lần bán lại tạo UUID/token vé mới. Mã hiển thị có thể được tái cấp, nhưng UUID vé cũ luôn bị vô hiệu, không chuyển quyền/vote sang chủ mới. Giữ lịch sử và audit.
- Không mở chức năng hủy/hoàn tiền cho khách. Đây là ngoại lệ quản trị thay quy tắc không tái sử dụng mã cũ.

## Sản phẩm đã triển khai local

Nhánh `codex/sheet-ticket-reuse-20261016`, xuất phát main `5d0e2b0`. Giữ file báo cáo kiểm thử online từ lượt trước; không ghi đè hoặc xóa dữ liệu/ảnh cũ.

### Database và API

Migration `supabase/migrations/20261016134929_sheet_ticket_recycling.sql`:

- Lưu lịch sử gắn mã–UUID và metadata dòng vé trong schema private, không cấp SELECT trực tiếp cho client/service-role. Metadata ổn định giúp trả một nhóm không làm vé nhóm còn lại đổi loại theo vị trí cũ.
- RPC quản trị kiểm tra role/AAL, revision đơn, tập mã và UUID hiện hành, phạm vi đơn và toàn nhóm combo. Payload nghiêm ngặt không nhận owner hoặc trạng thái từ Sheet.
- Sửa từng trường cho phép chuỗi rỗng, minh chứng nullable; form mua mới vẫn bắt buộc đủ thông tin và ảnh trước khi Hoàn tất.
- Làm sạch cập nhật vé `void`, trả allocation/sold quota, giải phóng slot mã và ghi audit trong một transaction. Đơn hết vé chuyển `CLEARED`, số lượng/tiền bằng 0, lines rỗng, minh chứng hiện hành bỏ gắn. Ảnh/lịch sử cũ không bị public hoặc xóa vật lý.
- Cùng thứ tự khóa offer → request → products → tickets → batch mã. `FOR UPDATE` làm giao dịch chờ nhau ở database; không phải hàng đợi FIFO có vị trí chờ. Unique constraints vẫn bảo vệ mã/UUID khi retry hoặc chạy nhiều Worker. Không có network call trong transaction.
- Idempotency lưu kết quả thao tác; retry sau khi mã đã bán lại không được làm sạch lượt cấp mới. Payload cũ bị từ chối nếu sai revision/UUID.
- Rollback chỉ dùng trước khi có dữ liệu làm sạch/tái cấp; sau đó bị chặn, không phục hồi quyền chủ cũ.

Các endpoint:

| Endpoint                                            | Chức năng                                                                                      |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /api/admin/sheets/purchases/:id/ticket-groups` | Đọc mã/UUID, buyer, proof, revision và metadata dòng hiện hành                                 |
| `POST /api/admin/sheets/purchases/:id/ticket-group` | Sửa thông tin/minh chứng hoặc làm sạch một dòng/nhóm                                           |
| `POST /api/admin/sheets/purchases/:id`              | Chỉnh sửa đơn ở tab Khách mua vé; xóa sạch thông tin chung và ảnh sẽ làm sạch cả đơn nguyên tử |

RPC chỉ service-role gọi được; API vẫn kiểm tra phiên/quyền và hàng rào DEMO của online-test. Vé đã vote khóa theo ticket trước khi kiểm tra, không chỉ kiểm tra bằng giao diện.

### Sheet và website

- Ba tab `Vé bán kết`, `Vé chung kết`, `Vé DEMO` cho sửa/xóa **F:L** (bảy thông tin), **M** (minh chứng). Xóa ảnh trong ô M và toàn F:L là yêu cầu làm sạch dòng; không xóa hàng hoặc cột mã. Các cột loại/số lượng/combo tiếp tục sửa qua `Khách mua vé` theo validation sẵn có.
- Cột Y `_revision` bổ sung; U:Y ẩn. Installer bảo vệ các cột hệ thống; owner Google có thể vượt protection của chính họ nhưng API vẫn từ chối thay mã/UUID.
- Baseline và payload pending nằm trong các tab private/ẩn `_Mã vé đồng bộ BK/CK/DM`. Lưu operation trước HTTP; timeout retry đúng payload. Xung đột giữ ô đang sửa, ghi chú lỗi tại ô D1, không tự gửi đè trên phiên bản mới. Khi cần lấy lại bản server, khôi phục ô sửa về baseline rồi chạy sync/đối chiếu; không sửa cột Y để bỏ qua kiểm tra.
- Sau khi server đã thay đổi, tab khách chỉ lấy lại dữ liệu khi bản ô còn khớp baseline đã xác nhận. Nếu có sửa mới khi request đang chạy, giữ lại và báo đối chiếu. Các tab ảnh và kho mã lấy lại nguồn mới; không dùng snapshot cũ trước thao tác làm sạch.
- Google Sheets không có compare-and-set cho một lần sửa thủ công. Không cam kết tuyệt đối không có va chạm ô ở thời điểm refresh; revision/UUID và transaction ngăn ghi đè hoặc cấp trùng trong database. Nếu có sửa đồng thời, phải xử lý thông báo xung đột.
- Web `/admin/ve` có **Sửa thông tin vé** theo từng dòng/nhóm, mã chỉ đọc; được bỏ từng trường/ảnh. Nút lưu nêu rõ khi sẽ trả vé về kho, backend chặn vé đã vote. Danh sách khách và admin tự lấy lại khi đang mở sau mỗi 60 giây, cũng lấy lại sau khi lưu/focus. Không cam kết Sheet hoàn thành đúng trong 60 giây khi trigger đang chờ khóa hoặc provider chậm.

## Bằng chứng kiểm tra

- Full suite: **306 đạt, 2 native test bỏ qua** trong lượt chạy tổng hợp. Bao gồm browser journey desktop/mobile luồng mua, sửa ảnh, retry, vote và xem ảnh admin; unit form quản trị mới; Apps Script VM; HTTP và SQL/RLS/rollback.
- Chạy riêng ca native mới trên PostgreSQL 16.15 loopback `127.0.0.1:55433`: **đạt**. Xác nhận 20 backend PID khác nhau, các giao dịch thực sự chờ khóa, 40 mã/UUID duy nhất cho 20 đơn, retry Hoàn tất không tạo thêm vé. Hai mươi lần làm sạch cùng operation chỉ trả quota một lần; 20 đơn tranh quota cuối chỉ có một thắng; mã tái cấp có UUID mới.
- Chạy lại ca native và bộ kho mã sau thay đổi migration: **15/15 đạt**. Lượt bổ sung sau đó kiểm tra kho mã/rollback/Apps Script/fence DEMO: **49/49 đạt**, gồm cài migration trên baseline17 remote mà không kích hoạt ba migration khác. Test kho mã kiểm tra xóa từng trường, xóa Combo3 nhưng giữ đơn lẻ, bán lại cùng mã, stale UUID/revision, chặn nhóm đã vote, làm sạch đơn nhiều loại nguyên tử, chặn rollback khi đã dùng.
- Lượt cuối kiểm tra Apps Script, form quản trị và HTTP: **35/35 đạt**, gồm tạo đủ28 cột baseline trước khi ghi. Lint, typecheck, production build và Worker `online-test --dry-run` đạt. Build còn cảnh báo chunk lớn từ bundle hiện có; không là bằng chứng tải online.
- Báo cáo máy (ignored): `output/sheet-ticket-recycling-20261016/tests.json`, `native.json`; log bundle Worker cùng thư mục. `git diff --check` đạt. PostgreSQL loopback do lượt kiểm thử bật đã được dừng sau khi hoàn tất; không để test server chạy nền.

## Trạng thái online và kích hoạt

**Trạng thái kết thúc lượt triển khai local:** chưa kích hoạt thay đổi này trên remote; chưa áp migration, push/merge/deploy hoặc sửa Sheet online. Không làm sạch DM00012 hoặc dữ liệu LIVE. Sau đó người dùng đã yêu cầu push nhánh và gộp main để cập nhật Worker; việc phát hành Git không tự cập nhật database/Apps Script. Kết quả CI và deployment phải kiểm tra trên đúng commit phát hành trước khi báo online đã cập nhật.

Kiểm tra read-only Supabase ngày16/10: project `ifgtyslifgegwcguysbb` có **17 migration**, chưa có `20261016134929`. Các migration cũ về deadline vote, BXH DEMO và đợt bán cấu hình cũng chưa có trong registry remote; không suy ra các phần đó đã kích hoạt. Migration làm sạch mới không dùng việc này làm quyền áp thêm phần vote hoặc sửa lịch LIVE.

Địa chỉ kiểm tra sau kích hoạt:

- Website: https://ftucharm-test.bancotaima1235.workers.dev/ve
- Quản trị vé: https://ftucharm-test.bancotaima1235.workers.dev/admin/ve
- Bảng Data: https://docs.google.com/spreadsheets/d/1n6nbwjErwOCsh-auVyOUmVP5jTIRsud45ADYdRhXViU/edit

Trình tự admin sở hữu dịch vụ cần thực hiện sau review/backup:

1. Backup schema/functions và dữ liệu nghiệp vụ liên quan bằng công cụ được phép, lưu riêng có bảo vệ. Đối chiếu migration history và các định nghĩa guard/RPC hiện hành; migration từ chối nếu không khớp source dự kiến. Không ghi key/token/backup PII vào Git.
2. Áp migration mới trên project đã xác nhận bằng migration workflow, không chạy lại migration cũ. Kiểm tra quyền, constraints, audit và advisors.
3. Triển khai Worker/frontend đúng commit đã kiểm tra; giữ online-test chỉ ghi DEMO. Kiểm tra version/deployment, không chỉ dựa vào merge Git.
4. Cập nhật **standalone Apps Script Code.gs** từ repository, giữ Script Properties và token; cập nhật deployment đang dùng. ProofViewer không đổi. Giữ bảng và thư mục ở Hạn chế.
5. Owner chạy `enableFtuTicketEditing()` một lần. Hàm kiểm tra `editing_version=1` từ API trước khi bật, bổ sung Y/protection/baseline. Hai trigger mỗi phút hiện có tiếp tục chạy, không tạo trigger trùng. Kiểm tra danh sách trigger và execution log.
6. Thử một đơn DEMO mới: Hoàn tất → ảnh/Sheet → xóa một trường → đọc lại Supabase/web → xóa sạch dòng chưa vote → cùng mã bán lại bằng UUID mới. Thử vé đã vote phải bị chặn. Không dùng LIVE để thử.
7. Nếu lỗi: tắt `FTU_CODE_EDITS` để dừng ghi từ kho mã, giữ pending/baseline/audit để đối chiếu. Sau khi đã làm sạch/tái cấp, sửa tiến thay vì rollback làm hồi sinh chủ cũ. Nếu chưa sử dụng và dữ liệu còn thỏa schema cũ, dùng rollback đã kiểm tra rồi triển khai source trước đó.

Tài liệu kỹ thuật đối chiếu: [PostgreSQL row locks](https://www.postgresql.org/docs/current/explicit-locking.html), [Supabase database functions](https://supabase.com/docs/guides/database/functions). Tài liệu mô tả cơ chế; các con số kiểm thử ở trên lấy từ chạy local.
