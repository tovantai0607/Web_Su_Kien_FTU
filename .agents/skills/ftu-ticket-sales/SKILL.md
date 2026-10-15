---
name: ftu-ticket-sales
description: Áp dụng nghiệp vụ bán vé FTUCharm từ skill/bosung.docx khi lập kế hoạch, sửa tài liệu hoặc triển khai chọn loại vé, combo, form người mua, QR chuyển khoản, minh chứng, lưu database và quyền vote của dự án Web_Su_Kien_FTU.
---

# Bán vé FTUCharm theo bổ sung

Xác nhận15/10/2026 về giao diện đợt bán: vé sớm/vé thường nằm trong cùng một hạng, khách chỉ thấy một bộ chọn vé/combo theo đợt đang áp dụng. Admin chỉnh giá đơn/combo cho từng đợt, số vé sớm và lịch mở sớm/kết thúc sớm–bắt đầu thường/đóng thường; không khóa các giá trị này vào100 vé hoặc lịch mặc định. Tổng700 vé/vòng LIVE2027 giữ nguyên. Server kiểm tra quota gồm vé đã bán/giữ, giữ snapshot giá của đơn cũ và30 phút; chuyển đợt theo server. Xem `docs/unified-ticket-sale-phases-20261015.md`; migration mới chỉ kiểm thử local, không suy ra online đã cập nhật.

Đính chính15/10/2026: kho mã hiển thị ba tab riêng `Vé bán kết` (700BK), `Vé chung kết` (700CK), `Vé DEMO` (50DM ban đầu); mỗi nhóm combo của cùng đơn/loại hiển thị một dòng (ví dụ cb2_4_DM00012-DM00015,4 vé/2 combo); vé đơn và kho chưa cấp giữ riêng từng mã. Database giữ mã/UUID từng vé để vote. Không gộp BK/CK vào một tab. Đây là cấu trúc hiện hành thay mô tả hai tab kho mã ở lượt đầu bên dưới.

Xác nhận15/10/2026 về mã riêng từng vé:700BK+700CK LIVE2027,50DM ban đầu, hậu tố5 chữ số; Combo3 có3 mã cùng nhóm để BTC xếp gần. Kho mã trống không phải vé đã cấp/vote. Migration register đã áp độc lập; giữ UUID/mã lịch sử/votes, không tái dùng mã đã cấp. Ba tab kho mã giữ đủ mã thành viên, hiển thị gộp combo theo xác nhận mới nhất; tab cũ là Mã đơn theo dòng loại/combo. Đọc `docs/ticket-code-register-20261015.md` ở root; snapshot đã có, tự làm mới Google còn cần owner triển khai Apps Script, không tự suy ra đã hoạt động từ link website.

Xác nhận mới nhất14/10/2026: người dùng yêu cầu triển khai toàn bộ kế hoạch bản chính thức2027 local nối Supabase. Tổng700 vé/vòng gồm100 sớm/600 thường, BTC phân bổ loại/giá/QR; dư vé sớm chuyển thường cùng loại, giữ30phút vẫn chiếm quota. Ảnh bán kết10–11/4, bán kết25/4, chung kết23/5 và BTC công bố vinh danh dự kiến23h cùng ngày. Vote bán kết10phút trong25/4 do BTC đặt giờ; chung kết chờ lịch. Xem `docs/official-program-2027.md` và xác nhận đầu reference; các ghi chú DEMO dưới đây là lịch sử. Không tạo fixture/đơn thử LIVE, gửi email hoặc deploy Internet trong lượt này.

Skill này dành cho repository FTUCharm. Đọc [yêu cầu và bảng đối chiếu](references/requirements.md) trước khi sửa phần liên quan. Đối chiếu với [file bổ sung](../../../skill/bosung.docx), cả ba ảnh, yêu cầu mới nhất của người dùng và AGENTS.md ở gốc.

Xác nhận mới nhất ngày14/10/2026 sau gộp Git `8115e0f`: SUPER_ADMIN có MFA tùy chọn; chỉ SUPER_ADMIN đóng sớm vote với lý do, phiên đã đóng không mở lại. Người dùng chọn Git mới cho cả hai quy tắc; không áp đề xuất mở lại cũ. Riêng đợt `test-giao-dich-demo` được phép ghi fixture Supabase theo xác nhận **Test DEMO, ghi vào Supabase**; không chuyển quyền này sang LIVE/load online. Hiện có 11 migration local/remote, frontend5173 nối backend8787; số chín và giới hạn fixture local phía dưới là lịch sử, dùng [báo cáo hiện tại](../../../docs/git-sync-admin-customers-20261014.md) để đối chiếu.

## Quy tắc quyết định

Yêu cầu Google Sheets mới ngày14/10/2026 bổ sung ngoại lệ cho quản trị: sửa tất cả cột nghiệp vụ qua bảng Data, giữ tài khoản sở hữu khi đổi email liên hệ. Cho phép giảm số vé chỉ khi không thấp hơn số UUID vé khác nhau đã vote; giữ vé đã vote/phiếu cũ, chỉ vô hiệu vé dư chưa vote trong transaction có audit và kiểm tra quota/revision. Đây không phải API hủy/hoàn tiền của khách. Không áp câu “không thu hồi” bên dưới để chặn ngoại lệ đã chốt này. Đọc [contract và trạng thái triển khai](../../../docs/google-sheets-sync-plan-20261014.md); không coi source/local tests hoặc bảng DEMO là đồng bộ Google–Supabase đã hoạt động. Bảng/thư mục đã hạn chế, website chưa deploy và migration mới chưa áp remote.

- Thực hiện đúng luồng: loại/cụm vé và combo → bảy thông tin người mua → Tiếp tục xem QR → Tiếp tục gửi ảnh minh chứng → Hoàn tất lưu database.
- Giao diện tách từng bước: xác nhận vé/số lượng/combo mới hiện form thông tin; xác nhận thông tin mới hiện QR; tiếp tục mới hiện upload. Có xem trước và đổi ảnh đã chọn trên máy trước khi bấm Hoàn tất. Không coi chọn ảnh hoặc xác nhận bước đầu là đã lưu đơn/cấp vé.
- QR và bước minh chứng hiển thị đồng hồ MM:SS nổi bật cho cửa sổ30 phút; đổi bước không khởi động lại. Hết giờ ẩn QR/form và yêu cầu đặt lại. Đơn thật lấy hạn/server_time của database; đồng hồ DEMO chỉ minh họa, không tạo giữ vé thật.
- Lưu/hiển thị đủ sáu cột trong ảnh. Mã vé không trùng; dữ liệu thuộc đúng tài khoản/vòng. Khách không chọn số ghế; không giới hạn tổng số vé/tài khoản.
- Hoàn tất đã lưu thành công thì có số vé đó để vote mỗi vòng/hạng mục ngay; không chờ BTC duyệt hoặc email. Lưu lỗi không báo thành công; retry không nhân số vé/lượt.
- Email vé thủ công thuộc bên khác. Không tự xây chọn ghế, QR vào cửa/check-in, payment provider/webhook, gửi/gửi lại email tự động, hoàn tiền hoặc dashboard giao dịch ngoài bổ sung.
- Lịch dùng năm2027, giữ ngày/tháng và nhãn trong ảnh. Giữ quota30 phút; mỗi đơn chỉ giới hạn bởi quota, không cap10. Hoàn tất không hủy/hoàn/thu hồi. BTC cấu hình, DEMO/local được phép; không đưa fixtures hoặc chạy tải trên Supabase có dữ liệu thật.
- Giữ đúng lịch và nhãn loại/combo trong ảnh. Đánh dấu rõ số ước tính/cấu hình chưa cung cấp; không tự suy ra giá, quota hoặc ngày chung kết.
- Phân biệt quy tắc người dùng với đề xuất kỹ thuật và lịch sử code. Bảo vệ minh chứng/thông tin và dùng Auth/stack hiện hữu; không mở rộng nghiệp vụ chỉ để áp một mẫu kỹ thuật.

## Áp dụng vào kế hoạch và triển khai

Kiểm tra Git và đọc tiến độ Word trước mỗi lượt. Dùng các mã R01–R14 trong reference để đối chiếu từng giai đoạn; thay mọi yêu cầu hiện hành trái chúng. Nội dung code/kiểm thử cũ chỉ là lịch sử, không chứng minh luồng mới đã xong.

Kế hoạch có 11 giai đoạn sau khi bỏ check-in. Đọc Word và bằng chứng hiện tại; không dùng số2/11 của lượt tài liệu cũ làm trạng thái mới. Mặc định chỉ thực hiện giai đoạn được yêu cầu; nếu người dùng yêu cầu hoàn tất tất cả thì thực hiện lần lượt trong phạm vi đã giao. Chỉ đánh X khi đủ sản phẩm, kiểm tra và nghiệm thu. Rà soát lại ảnh hưởng tới contract/schema cũ trước phần phụ thuộc; không xóa dữ liệu cũ.

Nếu thiếu thông tin ảnh hưởng nghiệp vụ/dữ liệu/phần người khác, hỏi trước phần phụ thuộc và tiếp tục đọc/soạn phần độc lập. Skill không tự cấp quyền migration database thật, thay secrets, deploy, push Git hoặc gửi email; yêu cầu rõ của người dùng quyết định phạm vi được phép.

Ngày 14/10/2026, người dùng yêu cầu đồng bộ project Supabase đã kết nối. Đã áp đủ chín migration và kiểm tra schema/quyền, không tạo fixture hoặc chạy tải online. Đọc [báo cáo đồng bộ](../../../docs/supabase-sync-20261014.md) trước lần sửa database tiếp theo; không chạy lại migration đã áp. Đồng bộ database không đồng nghĩa đã deploy Worker, có tài khoản quản trị hay hoàn tất cấu hình ảnh/QR thật.

Khi hoàn tất, báo yêu cầu nào đã áp dụng, file sửa và bằng chứng kiểm tra; không báo kỹ thuật/luồng hoạt động chỉ vì tài liệu khớp.
