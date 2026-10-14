# Nhiệm vụ người thứ hai theo bổ sung

## Xác nhận mới nhất sau gộp Git

Người dùng chốt dùng Git mới `8115e0f`: SUPER_ADMIN có MFA tùy chọn; chỉ SUPER_ADMIN đóng sớm vote với lý do, phiên đã đóng không mở lại. Các mô tả MFA bắt buộc cho SUPER_ADMIN hoặc mở lại phiên phía dưới/tài liệu cũ đã được thay thế. Trang khách: `http://127.0.0.1:5173/admin/ve`. Đối chiếu mới có 11 migration local/remote; số chín bên dưới là lịch sử. Xem [báo cáo gộp và kiểm tra](../docs/git-sync-admin-customers-20261014.md).

## Cấu hình và kiểm thử DEMO mới nhất

Người dùng đã chốt giá tạm100.000đ và **Test DEMO, ghi vào Supabase** ngày14/10/2026. Cho phép dữ liệu thử của riêng đợt `test-giao-dich-demo`; giới hạn fixture local của các lượt trước không còn áp dụng cho đợt này. Combo2/3 thử tính200k/300k, quota100/hạng và cửa sổ7 ngày chỉ là cấu hình DEMO. LIVE2027 chưa công bố. Form admin đổi giá/quota/combo/lịch; giá mới áp dụng đơn mới, không ghi đè snapshot đơn đang giữ. Giữ Auth/quyền/MFA,30 phút và invariants cũ. Không chuyển tiền, email, deploy hoặc load online. Ảnh thử lưu R2 local, metadata/đơn/vé ở Supabase. Xem [hướng dẫn DEMO](../docs/ticket-sales-demo-20261014.md).

## Đồng bộ Supabase theo yêu cầu mới

Đã áp đủ chín migration lên project ifgtyslifgegwcguysbb ngày14/10/2026; schema/history khớp code local và giữ dữ liệu cấu hình cũ. Xem [báo cáo đồng bộ](../docs/supabase-sync-20261014.md) về tài khoản, các phần còn local và cấu hình thật. Yêu cầu này thay giới hạn migration remote của lượt nghiệm thu local trước; không bao gồm fixture/load online, deploy, push, thay secrets, gửi email hoặc thanh toán. Nghiệm thu11/11 vẫn là local/DEMO.

## Quyết định bổ sung đã chốt ngày 14/10/2026

Lịch giữ ngày/tháng trong ảnh và dùng năm **2027**. Giữ quota **30 phút**, không gia hạn retry; không giới hạn mỗi đơn hoặc tổng vé/tài khoản ngoài quota còn lại. Hoàn tất lưu thành công cấp quyền vote ngay, không hủy/hoàn/thu hồi sau đó. BTC cấu hình giá/quota/combo/QR; nghiệm thu local bằng dữ liệu giả và DEMO, không chuyển tiền thật. Supabase có dữ liệu thật: không tạo fixture/đo tải online. Yêu cầu tiếp theo đã cho phép đồng bộ schema; đủ chín migration đã áp, xem docs/supabase-sync-20261014.md. Kịch bản tải local 500→1.000, 2 phút/mức, 70% xem/20% giữ-minh chứng-Hoàn tất/10% vote, p95<2s, lỗi<1%, không trùng/vượt quota đã được duyệt.

Người dùng yêu cầu hoàn tất tất cả các giai đoạn trong lượt này; yêu cầu đó thay giới hạn một giai đoạn/lượt của prompt cũ cho công việc đã được giao. Đồng bộ database đã được yêu cầu riêng và hoàn tất; không tự deploy, push hoặc gửi email.

Luồng đã triển khai dùng chung Auth/tickets/votes và các bảng quota bổ sung; contract/bằng chứng tại [nghiệm thu](../docs/supplement-acceptance.md), cấu hình/bàn giao tại [runbook](../docs/supplement-runbook.md). Tiến độ chính thức xem `tiến độn.docx`, không suy từ nhật ký nghiệm thu cũ.

## Skill nghiệp vụ bắt buộc cho phần bán vé

Đọc `.agents/skills/ftu-ticket-sales/SKILL.md` và `references/requirements.md` của skill trước khi lập kế hoạch hoặc sửa luồng vé/QR/minh chứng/database/vote. Đây là skill từ bosung.docx và các xác nhận mới nhất; mã R01–R14 dùng để kiểm tra từng mục. Không dùng mô tả payment/check-in/email/hủy đơn cũ để mở rộng phạm vi. File bổ sung và ảnh được giữ làm nguồn; không sửa nguồn để hợp thức hóa phương án.

Cập nhật ngày 14/10/2026; đọc NGHIEP_VU_HIEN_HANH.md, bosung.docx và tiến độn.docx. Phạm vi là luồng mua/lưu dữ liệu trong ảnh và quyền vote đã chốt; bỏ check-in và gửi email vé tự động.

## Luồng cần xây

Giao diện theo xác nhận mới: chọn vé/số lượng/combo → **Xác nhận vé & combo** → hiện bảy trường → **Xác nhận thông tin** → hiện QR → **Tiếp tục gửi minh chứng** → chọn/xem trước ảnh, có nút **Đổi ảnh minh chứng** nếu chọn nhầm → **Hoàn tất**. Các bước sau ẩn cho tới khi xác nhận bước trước. Đổi ảnh ở đây là đổi file trên máy trước khi gửi Hoàn tất; không sửa ảnh server đã nhận hoặc đơn đã Hoàn tất. Quota30 phút bắt đầu khi server giữ đơn sau xác nhận thông tin, không khi chỉ xác nhận lựa chọn vé.

Khách chọn loại/cụm vé, số lượng, đánh tích combo và số combo theo quy định → nhập Tên, Trường, Khóa/lớp, MSSV, Email, SĐT, Facebook → Tiếp tục xem QR chuyển khoản và hướng dẫn → Tiếp tục gửi ảnh minh chứng → Hoàn tất lưu database. Khi server lưu thành công thì số vé được tính để vote ngay, mỗi vòng và mỗi hạng mục; không chờ BTC duyệt/email. Email vé do bên khác gửi thủ công.

Không chọn số ghế. Bán theo loại/cụm, số lượng và combo có tích chọn/số combo. Không giới hạn tổng vé/tài khoản; BTC bố trí vé cùng combo gần nhau. Hết quota vé sớm khóa vé sớm, chuyển vé thường đang mở. Không tích hợp provider/webhook hoặc tự triển khai phần gửi mail của bên khác.

## Dữ liệu đúng ảnh mẫu

| Cột theo ảnh            | Nội dung lưu                                                          |
| ----------------------- | --------------------------------------------------------------------- |
| Mã vé                   | Mã duy nhất, không trùng giữa các bản ghi                             |
| Thông tin               | Tên, Trường, Khóa/lớp, MSSV, Email, SĐT, Facebook; gắn đúng tài khoản |
| Minh chứng chuyển khoản | Ảnh người mua đã gửi, lưu liên kết riêng tư đúng bản ghi              |
| Loại vé                 | Loại/cụm đã chọn, đúng vòng và đợt vé sớm/vé thường                   |
| Số lượng                | Số vé được lưu, do server kiểm tra                                    |
| Combo                   | Combo đã tích và số lượng combo theo cấu hình                         |

Ảnh thứ hai bổ sung thống kê EARLY BIRD với The Intro/The Bridge/The Chorus, và The INTRO với Đơn/Combo 2/Combo 3/Đêm. Lưu lựa chọn và số lượng để hiển thị theo mẫu; không tự suy ra giá/quota từ những con số minh họa.

Danh sách để bên khác kiểm tra/lấy dữ liệu gửi mail phải giữ đúng các cột trên. Không tự phát triển dashboard giao dịch/QR check-in ngoài yêu cầu. Dùng Auth và schema chung, thông tin gắn đúng tài khoản/vòng; private minh chứng, mã duy nhất và Hoàn tất idempotent. Giữ kiến trúc/dependencies hiện tại và bảo toàn dữ liệu cũ.

## Vote sau Hoàn tất

Một vé được lưu thành công = một lượt mỗi vòng/hạng mục đúng vòng. N vé có N lượt/hạng mục. Không chờ BTC duyệt hoặc mail; upload/lưu thất bại chưa có quyền. Retry không tạo thêm vé/lượt; kết quả lấy database, thời gian server và không sửa phiếu đã gửi. Giữ quy tắc legacy và quyền quản trị phiên đã chốt.

## Giới hạn phần việc

Không có nhiệm vụ check-in, camera quét vé, QR vào cửa, mapping QR/check-in hoặc email vé tự động. Không dùng payOS/SePay/webhook; chỉ hiển thị QR chuyển khoản rồi nhận minh chứng/lưu dữ liệu. Không xóa code/schema/check-in cũ của phần dùng chung trong lượt sửa tài liệu.

Phần đăng ký thí sinh, CMS, mùa/vòng thuộc người thứ nhất. Bên khác đối chiếu/gửi email vé thủ công; người thứ hai chỉ lưu và bàn giao dữ liệu theo quyền.

## Lịch trình trong ảnh bổ sung

| Ngày năm 2027  | Nội dung đúng ảnh bổ sung                                                  |
| -------------- | -------------------------------------------------------------------------- |
| 15/2–6/3       | Người dùng chỉ xem                                                         |
| 7/3            | Mở đơn đăng ký thí sinh                                                    |
| 21/3           | Đóng đơn đăng ký thí sinh                                                  |
| 29/3           | Mở bán sớm 2 ngày; khoảng 100 vé, dự kiến khoảng 2 giờ hết thì khóa vé sớm |
| Sau đợt vé sớm | Cập nhật giá, bán vé thường                                                |
| Đến 24/4       | Bán vé thường                                                              |
| 25/4           | Bán kết; mở và đóng vote trong ngày, cửa sổ 10 phút                        |
| 26/4           | Mở vé sớm chung kết khoảng 2 giờ, số vé theo BTC quy định                  |
| 10/5–11/5      | Cập nhật ảnh những người vào bán kết, đúng chữ trong ảnh                   |

Năm 2027 theo xác nhận mới nhất; thay quyết định 2026 trước đó. 26/4 là ngày mở vé sớm chung kết, không được tự đổi thành ngày tổ chức chung kết. Ảnh chưa ghi ngày tổ chức chung kết hay giờ cụ thể; chỉ các phần phụ thuộc thông tin này cần chốt. Lịch đã có phải ghi đúng, không được nói toàn bộ lịch chưa có.

## Kiểm tra và tiến độ

Tests form/QR/minh chứng/lưu, ownership, quantity/combos, quota vé sớm, Hoàn tất/retry và vote theo số vé. Kiểm tra mobile/keyboard/error/retry, lint/typecheck/build theo thay đổi; chỉ báo đạt với bằng chứng. Mục tiêu tải 500–1.000 phải chốt workload và đo, không suy từ tests chức năng.

Kế hoạch có11 giai đoạn sau khi bỏ check-in. Luồng bổ sung đã được triển khai; đối chiếu Word và docs/supplement-acceptance.md cho trạng thái/bằng chứng nghiệm thu mới.

BTC cấu hình thông số thật trước mở bán; DEMO/local đã được duyệt. Giữ quota30 phút, ảnh JPG/PNG≤5MB/12MP; không hủy/thu hồi sau Hoàn tất. Không tự mở rộng phạm vi, nâng major, sửa DB thật, thay secrets, deploy, push hoặc gửi mail. Lượt hiện tại triển khai toàn bộ phần việc đã được người dùng yêu cầu.

## Đối chiếu từng giai đoạn với bổ sung

| Bước | Yêu cầu áp dụng         | Phạm vi                                              |
| ---- | ----------------------- | ---------------------------------------------------- |
| 01   | R01–R14                 | Contract từ bổ sung và xác nhận mới                  |
| 02   | R04, R06–R09, R14       | Lưu đủ thông tin/minh chứng/sáu cột và quyền vote    |
| 03   | R01–R03, R12–R14        | Loại/cụm, combo, quota vé sớm và lịch                |
| 04   | R04–R07, R14            | Form người mua và các bước Tiếp tục                  |
| 05   | R05–R11, R14            | QR, minh chứng, Hoàn tất lưu dữ liệu và quyền vote   |
| 06   | R07, R08, R10, R14      | Danh sách sáu cột theo ảnh 1                         |
| 07   | R09, R13, R14           | Vote theo số vé đã Hoàn tất, vòng/hạng mục/lịch      |
| 08   | R03, R07, R10, R12, R14 | Thống kê loại/combo theo ảnh 2                       |
| 09   | R01–R09, R12, R14       | Đo tải luồng thực tế khi được yêu cầu                |
| 10   | R04, R06–R11, R14       | Bảo vệ dữ liệu/private minh chứng và kiểm tra retry  |
| 11   | R07, R10, R11, R13, R14 | Cấu hình và bàn giao đúng phạm vi, không buộc deploy |

Định nghĩa R01–R14 ở `.agents/skills/ftu-ticket-sales/references/requirements.md`. Đây là bảng áp dụng yêu cầu, không là kết quả kiểm thử hay xác nhận code mới đã chạy. Không thêm API hủy/hoàn tiền, QR vào cửa, email tự động hoặc payment provider chỉ vì kế hoạch cũ có chúng.
