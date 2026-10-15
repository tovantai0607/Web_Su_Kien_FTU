# Đối chiếu yêu cầu bổ sung FTUCharm

**Xác nhận15/10/2026 về hai đợt bán:** một hạng vé có chung bộ chọn mua, giá và hạn mức theo đợt do server quyết định; không hiển thị hai thẻ EARLY/NORMAL trùng tên. Admin được chỉnh giá vé/combo, số vé sớm và thời gian hai đợt. Con số100 sớm/600 thường và các ngày bán bên dưới là mặc định ban đầu, không còn bị khóa; tổng700 LIVE/vòng vẫn giữ nguyên. Giữ đơn/vé/phiếu, giá đã chốt, quota30phút và kiểm tra số đang giữ/đã bán. Contract và bằng chứng mới: `docs/unified-ticket-sale-phases-20261015.md` ở root.

**Đính chính15/10/2026:** ba tab kho mã riêng: `Vé bán kết` chứa700BK, `Vé chung kết` chứa700CK, `Vé DEMO` chứa50DM ban đầu. Mỗi lựa chọn combo cùng đơn/loại hiển thị một dòng với mã cb<kích thước>_<tổng vé>_<dải mã>; cột Số vé và Số lượng combo tách rõ. Giữ toàn bộ mã/UUID thành viên trong database; không đổi quyền vote. Thay cấu trúc hai tab kho mã của lượt đầu; không đổi mã, số lượng hoặc dữ liệu khách/vote.

**Xác nhận15/10/2026:** mỗi vé có mã quản lý riêng, prefixBK/CK +5 chữ số (700/vòng), DM +5 chữ số (50 chuẩn bị ban đầu). Combo3 nhóm3 vé để BTC bố trí gần nhau. Đã có1450slot/database và3tab kho mã riêng,11 vé DEMO cũ được liên kết; giữ nguyên UUID/mã lịch sử/phiếu. Không coi mã trống là vé/vote hoặc bản chụp Sheet là sync tự động. Xem `docs/ticket-code-register-20261015.md` tại root cho bằng chứng/giới hạn và migration14.

**Xác nhận mới nhất 14/10/2026:** kế hoạch bản chính thức đã được phê duyệt và triển khai local nối Supabase. Tổng 700 vé/vòng gồm 100 sớm + 600 thường; BTC chia quota từng loại và cung cấp giá/QR. Bán kết sớm 29–30/03, thường đến hết 24/04; chung kết sớm 26/04 09:00–11:00, thường đến hết 22/05. Đủ 100 vé sớm đã Hoàn tất thì chuyển thường sớm; vé sớm còn dư chuyển thường cùng loại, giữ còn hạn tiếp tục chiếm quota. Ảnh bán kết 10–11/04 thay mốc 10–11/05 lịch sử; chung kết 23/05, công bố nhà vô địch dự kiến 23:00 cùng ngày do BTC bấm. Giờ vote bán kết chờ BTC, cửa sổ 10 phút trong 25/04; chung kết chưa đặt giờ vote. Xem `docs/official-program-2027.md`; không coi lịch sử bên dưới là cấu hình hiện hành.

Xác nhận mới nhất sau gộp Git `8115e0f`: SUPER_ADMIN có MFA tùy chọn; chỉ SUPER_ADMIN đóng sớm vote với lý do, phiên đã đóng không mở lại. Riêng đợt `test-giao-dich-demo` đã được duyệt ghi dữ liệu thử lên Supabase; các hạn chế fixture local cũ không áp dụng cho đợt này. Không mở rộng sang LIVE hoặc tải online. Xem [báo cáo hiện tại](../../../../docs/git-sync-admin-customers-20261014.md) về 11 migration, tài khoản và link khách mua vé.

Nguồn: [bosung.docx](../../../../skill/bosung.docx), ba ảnh trong file và các xác nhận ngày 14/10/2026. Quy tắc mới nhất về Hoàn tất/vote, email thủ công và bỏ check-in thay thế yêu cầu cũ. Không chỉnh file nguồn để làm nó khớp với phương án kỹ thuật.

## Yêu cầu bắt buộc

| Mã  | Yêu cầu                                                                                                                  | Nguồn                        |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| R01 | Không giới hạn tổng vé bán cho một tài khoản                                                                             | Đoạn mở đầu                  |
| R02 | Mua theo loại/cụm và số lượng, không chọn số ghế                                                                         | Đoạn chia vé                 |
| R03 | Tích chọn combo theo quy định sẵn, nhập số lượng combo; các vé cùng combo được bố trí gần nhau                           | Đoạn combo và ảnh 2          |
| R04 | Trước QR nhập Tên, Trường, Khóa/lớp, MSSV, Email, SĐT, Facebook                                                          | Hai nhóm thông tin           |
| R05 | Bấm Tiếp tục sau form để thấy giao diện QR chuyển khoản và hướng dẫn thanh toán                                          | Đoạn sau thông tin           |
| R06 | Bấm Tiếp tục từ QR để mở form gửi ảnh minh chứng chuyển tiền                                                             | Đoạn gửi minh chứng          |
| R07 | Bấm Hoàn tất để lưu dữ liệu theo sáu cột ảnh 1                                                                           | Đoạn Hoàn tất và ảnh 1       |
| R08 | Mã vé duy nhất; lưu đúng thông tin tài khoản, loại, số lượng, combo và ảnh đã gửi                                        | Đoạn lưu thông tin           |
| R09 | Khi Hoàn tất lưu thành công, số vé được tính để vote ngay: một lượt/vé cho mỗi hạng mục đúng vòng; không chờ duyệt/email | Xác nhận mới nhất            |
| R10 | BTC/bên khác kiểm tra và gửi vé email thủ công; người thứ hai chỉ lưu/bàn giao dữ liệu                                   | Bổ sung và xác nhận mới nhất |
| R11 | Không payOS/SePay/webhook tự xác nhận tiền; không check-in/QR vào cửa/email vé tự động                                   | Bổ sung và xác nhận mới nhất |
| R12 | Hết quota vé sớm thì khóa vé sớm, chuyển về vé thường và cập nhật giá theo cấu hình                                      | Đoạn vé sớm và ảnh 3         |
| R13 | Lịch tổ chức/đăng ký/mở bán/vote đúng các mốc trong ảnh 3, năm 2027                                                      | Ảnh 3 và xác nhận năm        |
| R14 | Không coi viết kế hoạch là đã triển khai; chỉ đánh X với bằng chứng đúng nghiệp vụ mới                                   | AGENTS và yêu cầu tiến độ    |

## Dữ liệu đúng ảnh 1

| Cột hiển thị            | Nội dung                                                              |
| ----------------------- | --------------------------------------------------------------------- |
| Mã vé                   | Mã duy nhất, không trùng                                              |
| Thông tin               | Tên, Trường, Khóa/lớp, MSSV, Email, SĐT, Facebook; gắn đúng tài khoản |
| Minh chứng chuyển khoản | Ảnh đã gửi, gắn đúng bản ghi; không công khai                         |
| Loại vé                 | Loại/cụm khách chọn, đúng vòng/đợt bán                                |
| Số lượng                | Số vé của yêu cầu, tính theo lựa chọn và combo                        |
| Combo                   | Combo đã chọn và số combo                                             |

Đây là mẫu lưu và hiển thị, không bắt buộc database chỉ có một bảng hoặc dùng một cột chứa toàn bộ PII. Cách ánh xạ schema là proposal kỹ thuật phải bảo toàn dữ liệu hiện có; không tự viết migration khi chỉ được yêu cầu sửa tài liệu.

Ảnh 2 minh họa các nhãn: EARLY BIRD với The Intro, The Bridge, The Chorus; The INTRO với Đơn, Combo 2, Combo 3, Đêm. Các ô 0/1/2/5 không phải giá/quota đã chốt. Xác nhận mới nhất: ảnh là minh họa, dữ liệu không có Đêm thì bỏ cột; không tự thêm trường hoặc suy ra số liệu cho Đêm.

## Lịch đúng ảnh 3

| Ngày năm 2027  | Nội dung                                                                  |
| -------------- | ------------------------------------------------------------------------- |
| 15/2–6/3       | Người dùng chỉ xem                                                        |
| 7/3            | Mở đơn đăng ký thí sinh                                                   |
| 21/3           | Đóng đơn đăng ký thí sinh                                                 |
| 29/3           | Mở vé sớm 2 ngày; khoảng 100 vé, dự kiến khoảng 2 giờ hết thì khóa vé sớm |
| Sau đợt vé sớm | Cập nhật giá và bán vé thường                                             |
| Đến 24/4       | Bán vé thường                                                             |
| 25/4           | Bán kết; mở/đóng vote trong ngày, cửa sổ 10 phút                          |
| 26/4           | Mở vé sớm chung kết khoảng 2 giờ, số vé theo BTC quy định                 |
| 10/5–11/5      | Cập nhật ảnh những người vào bán kết, đúng chữ trong ảnh                  |

26/4 là mở bán sớm chung kết, không là ngày tổ chức chung kết. Ảnh chưa ghi ngày tổ chức chung kết hoặc giờ cụ thể. Không biến dự kiến hết sau 2 giờ thành giờ đóng chắc chắn. Các mốc đăng ký/CMS chỉ là điểm phối hợp với người thứ nhất.

## Áp dụng vào 11 giai đoạn

| Giai đoạn | Mã áp dụng              | Sản phẩm đúng phạm vi                                     |
| --------- | ----------------------- | --------------------------------------------------------- |
| 01        | R01–R14                 | Contract theo bổ sung và các xác nhận mới                 |
| 02        | R04, R06–R09, R14       | Dữ liệu/snapshot/quyền lưu đủ mẫu ảnh                     |
| 03        | R01–R03, R12–R14        | Chọn loại/combo/quota/lịch; bỏ chọn ghế                   |
| 04        | R04–R07, R14            | Form thông tin và các bước Tiếp tục                       |
| 05        | R05–R11, R14            | QR, minh chứng, Hoàn tất lưu dữ liệu và quyền vote        |
| 06        | R07, R08, R10, R14      | Danh sách sáu cột theo ảnh 1                              |
| 07        | R09, R13, R14           | Vote theo số vé Hoàn tất, vòng/hạng mục và lịch           |
| 08        | R03, R07, R10, R12, R14 | Danh sách dữ liệu và thống kê theo ảnh 2                  |
| 09        | R01–R09, R12, R14       | Đo tải luồng thực tế khi được yêu cầu                     |
| 10        | R04, R06–R11, R14       | Kiểm tra ownership/private upload/retry và luồng mua/vote |
| 11        | R07, R10, R11, R13, R14 | Hướng dẫn cấu hình, lưu dữ liệu và bàn giao đúng phạm vi  |

Check-in cũ đã xóa; 07 hiện là vote sau khi đánh số lại. Tiến độ hiện tại và bằng chứng mới xem Word/docs/supplement-acceptance.md; trạng thái2/11 trước triển khai là lịch sử. Tests cũ không chứng minh luồng mới.

## Thông tin chưa có và các đề xuất kỹ thuật

BTC cấu hình giá/quota/combo/QR; local dùng dữ liệu giả và DEMO đã được duyệt. Giữ quota30 phút không gia hạn retry; mỗi đơn và tài khoản chỉ giới hạn bởi quota còn lại, không cap10. Sau Hoàn tất không hủy/hoàn/thu hồi. Test ảnh JPG/PNG≤5MB/12MP, private và đúng owner. Schema Supabase đã đồng bộ theo yêu cầu mới; fixture/benchmark vẫn chỉ local; benchmark500→1.000/2phút/mức đã duyệt, p95<2s/lỗi<1%/không trùng hoặc vượt quota. Không tự thêm gate BTC duyệt hay chức năng ngoài bổ sung. Đọc [báo cáo đồng bộ](../../../../docs/supabase-sync-20261014.md) trước lần sửa database tiếp theo; quyền đồng bộ không bao gồm fixture, load online hoặc deploy.

Giữ Auth xác minh email và invariants đã chốt; server kiểm tra dữ liệu/quantity, lưu thành công mới báo Hoàn tất, retry không lưu trùng/tăng quyền. Đây là biện pháp triển khai an toàn cho yêu cầu, không phải luồng thanh toán tự động mới. Ảnh và Hoàn tất không tự chứng minh tiền thực nhận; đối chiếu thủ công thuộc bên khác.
