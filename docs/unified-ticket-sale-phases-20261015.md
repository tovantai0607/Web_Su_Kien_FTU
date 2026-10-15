# Vé sớm và vé thường chung một hạng

**Yêu cầu triển khai tiếp theo15/10/2026:** người dùng đã yêu cầu push nhánh và gộp main để cập nhật website. Source được bàn giao theo quy trình này; phần trạng thái local bên dưới ghi nhận thời điểm kiểm thử trước push. Cloudflare Builds cần đạt cho đúng commit, và admin Supabase vẫn cần áp migration cấu hình mới. Không dùng merge Git làm bằng chứng migration đã chạy.

Theo yêu cầu15/10/2026, mỗi hạng The Intro/The Bridge/The Chorus chỉ hiển thị một thẻ mua. Hai đợt giá là cấu hình bên trong hạng; server xác định đợt đang áp dụng. Admin tự chỉnh giá, số vé sớm và lịch, thay quy tắc khóa100 vé sớm/lịch cố định. Tổng700 vé/vòng LIVE giữ nguyên.

## Thao tác của admin

1. Vào `/admin/cau-hinh`, chọn **Đợt bán vé**, chọn đêm cần chỉnh.
2. Trong **Số lượng và lịch từng đợt**, nhập số vé bán sớm, giờ mở sớm, giờ kết thúc sớm/bắt đầu thường và giờ đóng thường. Giờ nhập là giờ Việt Nam.
3. Mỗi hạng có hai cột **Vé sớm / Vé thường**: chỉnh giá đơn, giá Combo2/3 và số lượng vé của từng đợt. Để trống giá combo để tắt. Số lượng combo được quy về số vé khi trừ quota.
4. Tổng phân bổ vé sớm không vượt giới hạn sớm; tổng phân bổ thường không vượt tổng vé trừ giới hạn sớm. Phân bổ đủ và bật các loại cần bán trước khi nhận đơn; server vẫn kiểm tra QR/cấu hình LIVE.
5. Bấm **Lưu cấu hình vé**. Dữ liệu người mua và đơn cũ không bị đổi giá. Chỉ khi lưu thành công mới áp dụng cho đơn mới.

Đợt DEMO cũ có thể còn dùng lịch riêng từng sản phẩm. Nút **Thiết lập hai đợt bán chung** đưa lịch/quota hiện có vào form chung để admin rà soát rồi lưu; không tự thay cấu hình trên Supabase khi chỉ mở form. Mẫu chưa phân bổ dùng hạn mức DEMO700 làm điểm bắt đầu, không tự bật bán.

Quyền lưu giữ `TICKET_STAFF` với chính sách MFA hiện hành; `SUPER_ADMIN` có thể dùng AAL1. Khách thường không có quyền gọi API lưu cấu hình.

## Hành vi mua vé

- Ba hạng vé có ba bộ chọn số lượng/combo; không có sáu thẻ trùng tên. Có thể mở phần **Xem giá và lịch các đợt** trong cùng thẻ.
- Vé thường mở khi hết cửa sổ sớm hoặc đủ số vé sớm đã Hoàn tất. Vé sớm còn dư chuyển sang thường cùng loại; vé đang giữ tiếp tục chiếm quota.
- Giao diện lấy trạng thái/giá từ server và làm mới định kỳ15giây, không dùng đồng hồ máy khách để tự mở bán. Khi chuyển đợt, số lượng cũ không tự chuyển sang giá khác; khách phải chọn lại.
- Snapshot giá, tổng tiền, đơn/vé đã Hoàn tất và hạn giữ30phút được bảo toàn. Không thêm bước BTC duyệt thanh toán, email tự động hay chọn ghế.

## Thay đổi kỹ thuật

- `PurchaseTickets.tsx` và `lib/ticket-phases.ts`: nhóm sản phẩm theo tên hạng, chọn cấu hình đợt hiện tại; giữ ID sản phẩm thật khi gửi server. Tương thích DEMO cũ có cả hai đợt mở cùng lúc.
- `PurchaseOfferEditor.tsx`: gộp hai đợt vào cùng hạng, thêm form quota/lịch toàn đêm; kiểm tra trường và giờ Việt Nam.
- Shared Zod/API: kiểm tra thứ tự thời gian, hạn mức/phân bổ và cấu hình trùng tên/hạng/đợt; lỗi server có thông báo rõ.
- Migration mới `20261015102130_configurable_sale_phases.sql`: bỏ khóa100 vé/lịch cũ, giữ700 LIVE; khóa offer→products, kiểm tra quota đang bán/giữ và tính chuyển quota theo phân bổ mới trong transaction. Giữ kiểm tra quyền, phạm vi, hàm lưu gốc và audit. Không gộp hoặc xóa các dòng EARLY/NORMAL trong database, giữ khóa ngoại của đơn lịch sử.
- `.gitattributes` cố định SQL ở LF: tránh lỗi so khớp function body khi clone trên Windows với core.autocrlf. Các migration lịch sử không đổi nội dung.

## Bằng chứng và trạng thái triển khai

- Full Vitest: **278 đạt,0 lỗi,1 native PostgreSQL bỏ qua**; báo cáo local `output/unified-sale-phases-vitest.json`.
- Playwright Auth/official: **30/30 đạt** trên desktop/mobile, gồm chỉnh form admin, chuyển đợt giá, không tràn ngang320/390/1280px và Axe. Sau chỉnh spacing, kiểm tra lại hai ca admin đều đạt.
- Lint, TypeScript và production build đạt. Build còn cảnh báo kích thước chunk Three.js hiện hữu; không thay kiến trúc/dependency trong lượt này.
- Đã kiểm tra giá giữ không đổi sau sửa cấu hình; chặn quota thấp hơn số đang giữ; tính lại rollover khi700 vé thường đang giữ; chặn tài khoản không quyền; cấu hình/lịch admin giữ nguyên khi chạy lại bootstrap local.
- Đã chạy rollback local: phục hồi policy khi tương thích và bảo toàn đơn đang giữ; từ chối rollback khi lịch/quota LIVE đã được BTC tùy chỉnh. Sau rà soát cuối,29 kiểm tra trực tiếp phần form/chọn đợt/database vẫn đạt.
- Đã xem ảnh giao diện admin desktop/mobile trong `output/sale-phases-admin-*.png`. Dữ liệu và Auth ở bài kiểm thử trình duyệt là fixture local; không dùng dữ liệu khách thật.

**Hiện chỉ hoàn thành source/kiểm thử local.** Chưa push/deploy Worker hoặc áp migration mới lên Supabase trong lượt này; kết nối Sheet đang chạy online không bị thay đổi. Supabase hiện16 migration theo lượt kích hoạt Sheet, còn hai migration vote và migration cấu hình mới chưa áp remote. Không tuyên bố website online đã có form mới.

Trước triển khai, admin cần backup đúng môi trường, đối chiếu migration history rồi áp migration mới và deploy source tương ứng. Không chạy lại migration đã áp, không dùng đợt LIVE để tạo đơn thử. Rollback tại `supabase/rollbacks/20261015102130_configurable_sale_phases.sql` giữ dữ liệu và từ chối quay về policy cũ nếu cấu hình LIVE đã được BTC tùy chỉnh; phải rà soát riêng thay vì tự đặt lại lịch/quota.
