# Đồng bộ bảng Data với Supabase

## Bàn giao admin15/10/2026

Người dùng yêu cầu chỉ push source, phần online do admin khác thực hiện bằng tài khoản của họ. Bắt đầu từ [bàn giao kích hoạt](../../docs/HANDOFF-ONLINE-TEST-ADMIN-20261015.md):4 migration pending, codec hosted/Worker chưa deploy, OAuth/trigger chưa bật. Callback đã cấu hình nhưng không đồng nghĩa Sheet tự đồng bộ. Giữ bảng/thư mục private và không dùng phiên đăng nhập của tài khoản khác.

## Callback đã cấu hình qua giao diện ngày15/10/2026

Owner đã triển khai Apps Script riêng. Theo yêu cầu điều khiển hai tab, đã lưu `FTU_SCRIPT_CALLBACK_URL` bằng URL `/exec` do người dùng cung cấp và thêm đúng URL này vào Supabase Redirect URLs. Đã tải lại để đối chiếu: thuộc tính callback khớp toàn bộ URL; Supabase có5 URL, giữ nguyên4 URL cũ và Site URL. Đây là cấu hình callback, chưa đăng nhập phiên tích hợp hoặc cài trigger. Backend mới/3 migration pending/Edge codec vẫn cần kích hoạt riêng trước nghiệm thu đồng bộ. Xem `docs/apps-script-callback-20261015.md`.

## Kho mã riêng từng vé15/10/2026

Ba tab nguồn riêng: `Vé bán kết` chứa700BK, `Vé chung kết` chứa700CK, `Vé DEMO` chứa50DM, combo cùng đơn/loại gộp một dòng; vé đơn và mã chưa cấp giữ từng dòng. Bản chụp đã điền11 vé DEMO cũ. Mỗi mã5 chữ số sau prefix; mã đã cấp không dùng lại. Hai tab cũ đổi riêng headerA sang `Mã đơn`, vẫn dùng19 cột/UUID/revision để chỉnh đơn, không nhập mã pool vào cột mã đơn. Script mới cần24 headers đúng tab kho mã và endpoint `/api/admin/sheets/ticket-codes` đã deploy. Script đọc nguồn LIVE rồi tách BK/CK vào đúng tab, nguồn DEMO chỉ nhận DM. `installFtuSync()` cài thêm trigger `syncFtuTicketCodes` mỗi phút; chưa có trigger/deployment thật trong lượt tạo kho. Các tab kho mã là bản xem; chỉnh đơn ở Khách mua vé. Xem `docs/ticket-code-register-20261015.md`.

## Cập nhật15/10/2026

Xác nhận hiển thị mới: mua2 Combo2 =4 vé có một dòng mã nhóm `cb2_4_DM00012-DM00015`, cột P=4 vé, Q=Combo2, R=2 combo. Một Combo3 dùng `cb3_3_...`. Chỉ gộp cùng đơn, vòng, loại/đợt, kích thước combo và trạng thái; vé đơn/kho chưa cấp vẫn riêng. Cột B chứa đủ mã thành viên, U chứa UUID, X chứa số thứ tự (phân tách xuống dòng). Mã nhóm là nhãn hiển thị được tính từ các vé đang có, không thay UUID hoặc khóa vote. Mã có khoảng trống được ghi bằng nhiều dải nối `+`, không giả định vé ở giữa thuộc nhóm.

Header mới vẫn24 cột: A=`Mã vé / nhóm`, B=`Mã vé thành viên`, R=`Số lượng combo`, U=`_ticket_ids`, X=`_sequences`. Installer/sync yêu cầu header mới; không chạy code cũ lên bản xem đã gộp. Job đọc đủ trang trước khi gộp, khóa tránh hai lần sync chồng, kiểm tra mỗi mã/UUID duy nhất và mọi mã cũ còn trong nguồn. Khi số dòng giảm do gộp, ghi toàn bộ bản xem và phần đuôi trống trong cùng một lệnh; không xóa mã nguồn. Nếu nguồn thiếu/trùng hoặc thông tin nhóm khác nhau thì báo lỗi và giữ bản hiện có. Các kiểm tra giúp phát hiện lỗi; không cam kết Google/API không bao giờ gián đoạn. Kích hoạt Apps Script vẫn là bước vận hành còn thiếu.

Đã nhập bản chụp5 đơn COMPLETED DEMO/11 vé/6 dòng vào cả hai tab, đủ19 cột gồm số lượng combo, và đọc lại khớp nguồn. Trạng thái trong bảng ghi rõ chưa bật tự đồng bộ; không còn chỉ có dòng mẫu như mô tả lịch sử dưới đây. Folder/bảng hiện có owner và một writer được chỉ định, không chia sẻ link/anyone/domain. Minh chứng DEMO hiện hành đã sao chép lên Supabase Storage private; ô ảnh vẫn là UUID, không có public URL.

URL API test đã có: `https://ftucharm-test.bancotaima1235.workers.dev`. Backend mới trong lượt chuẩn bị chưa deploy; migration Sheets/deadline/quota và Edge codec cần kích hoạt/test trước bật ghi từ Sheet. Source Apps Script vẫn chưa deploy/trigger/OAuth. Owner cần tạo standalone script và callback URL thật để cấu hình allowlist Auth; công cụ Drive hiện tại không triển khai Apps Script/tạo trigger được. Không tự thêm wildcard hoặc coi snapshot là job realtime. Đọc `docs/predeploy-storage-sheet-fixes-20261015.md` để biết thứ tự kích hoạt còn lại.

Code hiện dùng Auth/RBAC chung của website; không có service-role key trong Sheet hoặc Apps Script. Schema bổ sung và API cần được kiểm tra/apply đúng môi trường trước khi bật đồng bộ. Google Sheet đích: https://docs.google.com/spreadsheets/d/1n6nbwjErwOCsh-auVyOUmVP5jTIRsud45ADYdRhXViU/edit .

## Cấu hình owner

Tạo **standalone Apps Script** do tài khoản SUPER_ADMIN sở hữu, chỉ owner được mở project script; không tạo bound script chia sẻ cùng mọi editor của Sheet. Sao chép `Code.gs` và manifest. Thêm vào Script Properties ba cấu hình không phải server-secret: `FTU_API_BASE_URL` (domain HTTPS của website/API), `FTU_SUPABASE_URL`, `FTU_SUPABASE_PUBLISHABLE_KEY`. Deploy callback web app chỉ cho **owner truy cập**, lưu URL `/exec` ở `FTU_SCRIPT_CALLBACK_URL` và thêm đúng URL đó vào redirect allowlist Supabase sau review. Mở callback và đăng nhập Google bằng tài khoản admin để tạo phiên riêng qua PKCE/Auth chung.

Refresh token của phiên riêng chỉ nằm trong Script Properties của project owner. Không đưa token vào ô, source Git, báo cáo hoặc chat; không sao chép refresh token của phiên trình duyệt thường. Backend xác minh JWT/quyền trên mỗi request. Helper PKCE đã có source, còn cần cấu hình URL và kiểm thử OAuth thật trước activation; chưa tự deploy callback hay đổi allowlist Auth chung.

Trước OAuth có thể chạy riêng `restrictFtuSharing()` để hạn chế chia sẻ thư mục và bảng mà không cần token. Người dùng đã đổi quyền, metadata xác minh không còn chia sẻ bằng link. `installFtuSync()` kiểm tra lại quyền/API/config rồi tạo trigger đọc mỗi phút và xử lý sửa ô. Chạy nền mỗi phút cả khi tab đóng; không cam kết lịch chạy chính xác từng giây vì quota và scheduler Google.

Máy local `127.0.0.1:5173/8787` không được Apps Script Google truy cập. Chưa deploy Worker hoặc bật trigger trong lượt build; cần runtime HTTPS được duyệt và các bindings thật cho ảnh trước nghiệm thu online. Native Sheets connector hiện chưa có thao tác triển khai Apps Script/tạo trigger hoặc thu hồi permission link; chỉ có thể dựng layout mẫu và đọc lại quyền.

## Cách chỉnh bảng

Mỗi dòng là một lựa chọn loại/combo của đơn. Cùng mã đơn có thể có nhiều dòng, UUID ẩn liên kết đúng đơn. Sửa các thông tin chung ở một dòng sẽ được truyền sang các dòng cùng đơn; không đổi UUID, chủ đơn hoặc vòng bằng sửa email. Số lượng cột K là số **vé**: Combo2 phải chia hết2, Combo3 chia hết3. Đổi loại vé theo nhãn hạng/tier đang có trong cấu hình cùng đợt. Không tự tạo/xóa đơn bằng chèn/xóa dòng.

Cột M **Số lượng combo** là số suy ra, không phải tổng số vé: K=4/L=Combo2 → M=2; K=6/L=Combo3 → M=2; vé Đơn → M=0. Đổi lượng/nhãn ở K:L; M được tính lại, không có hai trường nhập số lượng cạnh tranh. Trạng thái ở N, thời điểm ở O, metadata ẩn P:S. Cả hai tab dùng19 cột; installer chặn schema cũ18 cột để không nhận nhầm UUID/revision.

Minh chứng mới: nhập link file ảnh Drive dạng `/file/d/<id>/...` hoặc file ID. Owner script phải đọc được ảnh; chỉ JPG/PNG≤5MB. API kiểm tra ảnh, xử lý WebP và lưu phiên bản mới; ảnh cũ vẫn xem được theo quyền. Cột trạng thái chỉ báo đã đồng bộ khi transaction database thành công. Lỗi quota, số vé đã vote hoặc revision sẽ giữ nguyên database và báo ở dòng.

Tab `Database hiện hành` là nguồn chỉ đọc được cập nhật đầy đủ. `Khách mua vé` là bản chỉnh sửa: job không ghi đè A:L của dòng đã có, không xóa/sắp xếp dòng. Khi database đổi ngoài Sheet, giữ ô hiện có và đánh dấu cần đối chiếu. Owner mở callback web app, nhập UUID đơn, bấm **Xem hai bản**, rồi xác nhận gửi bản chỉnh sửa đã xem. Nếu ô/revision đổi sau preview thì từ chối, cần xem lại. Có thể sửa draft theo tab nguồn trước khi xem/xác nhận; không tự tải lại đè lên người đang gõ. Luồng này có source và unit, chưa nghiệm thu Google thật.

Snapshot lệnh nằm trong tab nội bộ bảo vệ; retry giữ operation ID/payload dù ô đổi sau đó. Chỉ xoay operation sau xác nhận đối chiếu rõ ràng, không gửi mù khi timeout. Revision và khóa ở database bảo vệ trường hợp lệnh cũ vẫn chạy. Giá cũ giữ nếu loại/combo không đổi; loại/combo mới lấy giá cấu hình. Không chuyển đơn thành PAID từ sửa Sheet.

Tải Excel từ Sheets bằng **Tệp → Tải xuống → Microsoft Excel (.xlsx)**. File tải xuống là snapshot, không tiếp tục ghi ngược Supabase. Bản copy Sheet hoặc `.xlsx` cũng không tự nhận quyền tích hợp.

## Trạng thái build và phần chưa nghiệm thu

- Migration/RPC sửa đơn, endpoint đọc phân trang/sửa/stage ảnh đã được thêm để kiểm thử local. Chưa áp migration này lên Supabase thật.
- Layout Sheet được dựng bằng dữ liệu mẫu; folder/bảng hiện chỉ có owner sau khi người dùng hạn chế chia sẻ. Chưa sao chép khách thật.
- Apps Script là source chuẩn bị, chưa deploy/chạy trigger. Khâu OAuth phiên riêng, xung đột chỉnh sửa nhanh trong lúc refresh và giới hạn Google phải được nghiệm thu trước sử dụng thật.
- Không tự bật online, tạo phiên vote, thay CAPTCHA, đổi secret hoặc mở bán LIVE trong lượt này.
