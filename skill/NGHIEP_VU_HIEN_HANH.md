# Nghiệp vụ hiện hành theo file bổ sung

## Bản chính thức2027 — xác nhận mới nhất14/10/2026

Người dùng phê duyệt triển khai local nối Supabase: đăng ký7/3–hết21/3; vé sớm bán kết29–30/3, vé thường đến hết24/4, ảnh bán kết10–11/4, bán kết25/4. Chung kết sớm26/4 09–11h, thường đến hết22/5; chung kết23/5, dự kiến vinh danh23h do BTC bấm công bố. Tổng700 vé/vòng gồm100 sớm và600 thường, BTC phân bổ từng loại. Dư vé sớm chuyển thường cùng loại; giữ30phút chiếm quota và giữ giá cũ. Bán đủ100 sớm thì chuyển thường sớm, tổng bán và giữ không vượt700. Giá/QR/ảnh/địa điểm/giờ chưa có để chờ BTC, không dùng số giả. Vote bán kết10phút trong25/4 chờ BTC đặt giờ; chung kết chưa đặt lịch. Giữ các yêu cầu Hoàn tất→quyền vote, không check-in/webhook/email vé tự động. Runbook: `docs/official-program-2027.md`; các xác nhận DEMO và mốc trái lịch này bên dưới là lịch sử.

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

Cập nhật 14/10/2026. Nguồn yêu cầu là bosung.docx và các xác nhận mới nhất: bỏ check-in; Hoàn tất có quyền vote ngay; email vé thủ công của bên khác. Nội dung này thay thế các yêu cầu rộng hơn trong prompt cũ.

## Luồng mua và lưu dữ liệu

Khách chọn loại/cụm vé, số lượng, đánh tích combo và số combo theo quy định → nhập Tên, Trường, Khóa/lớp, MSSV, Email, SĐT, Facebook → Tiếp tục xem QR chuyển khoản và hướng dẫn → Tiếp tục gửi ảnh minh chứng → Hoàn tất lưu database. Khi server lưu thành công thì số vé được tính để vote ngay, mỗi vòng và mỗi hạng mục; không chờ BTC duyệt/email. Email vé do bên khác gửi thủ công.

Khách không chọn số ghế; mua theo loại/cụm vé. Không giới hạn tổng vé/tài khoản. Combo được đánh tích và nhập số combo; bên bố trí vé sắp các vé cùng combo gần nhau. Hết số vé bán sớm thì khóa vé sớm và chuyển về vé thường đang mở. Mỗi đơn chỉ giới hạn theo quota còn lại; không có cap10 hoặc hạn tổng/tài khoản.

## Mẫu database và danh sách dữ liệu

Giao diện tách riêng lựa chọn vé/combo và form người mua. Xác nhận vé mới hiện form; xác nhận thông tin mới qua QR; tiếp tục mới hiện upload. Ảnh chọn trên máy được xem trước và đổi trước khi bấm Hoàn tất. Các bước xem/chọn/đổi file chưa lưu database hoặc cấp quyền vote; server giữ quota30 phút khi xác nhận thông tin tạo đơn.

| Cột theo ảnh            | Nội dung lưu                                                          |
| ----------------------- | --------------------------------------------------------------------- |
| Mã vé                   | Mã duy nhất, không trùng giữa các bản ghi                             |
| Thông tin               | Tên, Trường, Khóa/lớp, MSSV, Email, SĐT, Facebook; gắn đúng tài khoản |
| Minh chứng chuyển khoản | Ảnh người mua đã gửi, lưu liên kết riêng tư đúng bản ghi              |
| Loại vé                 | Loại/cụm đã chọn, đúng vòng và đợt vé sớm/vé thường                   |
| Số lượng                | Số vé được lưu, do server kiểm tra                                    |
| Combo                   | Combo đã tích và số lượng combo theo cấu hình                         |

Ảnh thứ hai bổ sung thống kê EARLY BIRD với The Intro/The Bridge/The Chorus, và The INTRO với Đơn/Combo 2/Combo 3/Đêm. Lưu lựa chọn và số lượng để hiển thị theo mẫu; không tự suy ra giá/quota từ những con số minh họa.

## Vote và phạm vi sở hữu

Số lượt vote mỗi vòng, mỗi hạng mục bằng số vé server lưu từ yêu cầu Hoàn tất thành công. Giữ Auth email chung, thời gian vòng theo server, retry không nhân quyền/phiếu, bảo toàn phiếu legacy chưa phân loại. Không đợi xét duyệt chứng từ hoặc email. Hoàn tất không tự khẳng định tiền thực nhận; không tự ghi doanh thu xác nhận từ ảnh.

Người thứ hai làm giao diện mua, QR chuyển khoản, form thông tin/minh chứng, lưu database đúng mẫu, danh sách theo quyền cho bên xử lý và quyền vote. BTC/bên khác đối chiếu và gửi email thủ công. Đăng ký thí sinh/CMS/mùa/vòng vẫn do người thứ nhất.

Không có nhiệm vụ check-in, camera quét vé, QR vào cửa, mapping QR/check-in hoặc email vé tự động. Không dùng payOS/SePay/webhook; chỉ hiển thị QR chuyển khoản rồi nhận minh chứng/lưu dữ liệu. Không xóa code/schema/check-in cũ của phần dùng chung trong lượt sửa tài liệu.

## Lịch theo ảnh

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

Validate input/ownership/quantity/combo ở server, mã vé duy nhất, private upload và transaction/idempotency để Hoàn tất không lưu trùng. Không nhận giá/owner/status tùy ý từ frontend. Dùng tests upload/lưu thất bại, Hoàn tất/retry, quota/combos và vote đúng số vé; không thêm bài test check-in/email vé tự động.

Kế hoạch có11 giai đoạn sau khi bỏ check-in. Luồng bổ sung đã được triển khai; đối chiếu Word và docs/supplement-acceptance.md cho trạng thái/bằng chứng nghiệm thu mới.

BTC cấu hình thông số thật trước mở bán; DEMO/local đã được duyệt. Giữ quota30 phút, ảnh JPG/PNG≤5MB/12MP; không hủy/thu hồi sau Hoàn tất. Không tự xóa phiếu hoặc hoàn tiền. Một lượt triển khai một giai đoạn; không tự migration remote/deploy/push/gửi email.
