# Cấu hình bán vé FTUCharm 2027

Trạng thái mới nhất ngày 14/10/2026: người dùng chốt giá tạm100.000đ và Test DEMO, ghi vào Supabase. Đã tạo đợt thử riêng với sáu hạng/tier, Combo2/3 tính200k/300k, quota100/hạng và cửa sổ7 ngày chỉ để test. Đã xác nhận2 đơn Hoàn tất/5 vé được lưu. Đợt LIVE chung kết2027 vẫn chưa công bố và chưa có products/QR/lịch thật. Xem [hướng dẫn và bằng chứng DEMO](ticket-sales-demo-20261014.md). Các mục về đợt LIVE bên dưới giữ trạng thái chuẩn bị vận hành thật.

## Hiện trạng đã đọc trực tiếp

- Project `ifgtyslifgegwcguysbb`: mùa `ftucharm-2027`, ID `99912261-1765-4980-adcb-3d129a81afba`, chưa công bố.
- Vòng chung kết 2027: ID `555e2f29-d3fe-4995-9276-af5683dbfca5`, chưa công bố. Chưa có vòng bán kết 2027; không dùng vòng bán kết thuộc mùa 2026 thay thế.
- Trước thay đổi, `purchase_offers` và `purchase_products` đều trống. Sau khởi tạo: một offer LIVE chung kết, không có products.
- Supabase có migration `20261014120001_reconciled_admin_event_settings` chưa có tại local. Luồng theo bổ sung hiện dùng `purchase_offers`/`purchase_products`; không tự ghi thêm vào bảng ghế/giá cũ để tạo hai nguồn giá.

## Dữ liệu cần điền

| Cấp     | Trường                | Giá trị hoặc điều kiện                                                       |
| ------- | --------------------- | ---------------------------------------------------------------------------- |
| Đợt bán | Mùa, vòng             | Đúng mùa 2027 và đúng vòng bán kết/chung kết                                 |
| Đợt bán | Slug, tên             | Đề xuất `ban-ket-2027` / `chung-ket-2027`, Đêm bán kết / Đêm chung kết       |
| Đợt bán | Địa điểm, giờ tổ chức | BTC cung cấp; `starts_at` có thể để null khi chưa có giờ                     |
| Đợt bán | Chế độ, công bố       | Đã chọn LIVE; giữ `published=false` đến khi đủ thông số và kiểm tra tích hợp |
| Đợt bán | QR, hướng dẫn         | LIVE cần asset QR thật và hướng dẫn; không dùng QR DEMO để nhận tiền         |
| Loại vé | Tên, đợt              | The Intro, The Bridge, The Chorus; EARLY/NORMAL theo cấu hình BTC            |
| Loại vé | Giá đơn               | Số VND nguyên dương, chưa chốt giá thật                                      |
| Loại vé | Combo 2, Combo 3      | Giá tổng của một combo 2/3 vé cùng loại; null nếu chưa bật                   |
| Loại vé | Quota                 | Số vé, gồm vé đơn và vé trong combo; không phải số combo                     |
| Loại vé | Mở, đóng, enabled     | Giờ có múi giờ; đóng sau mở; chưa chốt thì chưa bật bán                      |

Schema hiện bắt buộc loại vé có giá dương và giờ mở/đóng. Vì vậy bản nháp không biết giá/giờ có thể tạo đợt bán với `products=[]`; không điền giá/giờ giả vào sản phẩm LIVE hoặc tự sửa schema để bỏ constraint.

## Quy tắc đã xác nhận

- Lịch năm 2027: mở vé sớm bán kết 29/3, bán thường đến 24/4, bán kết 25/4; mở vé sớm chung kết 26/4. Chưa có giờ cụ thể hoặc ngày tổ chức chung kết.
- Khoảng 100 vé và khoảng 2 giờ là dự kiến trong ảnh, chưa là quota/giờ đóng chính thức. Không tự chia quota này cho ba loại vé.
- Giữ quota 30 phút; retry không gia hạn. Mỗi đơn/tài khoản chỉ giới hạn theo quota còn lại.
- Hoàn tất lưu thông tin/minh chứng thành công mới cấp số vé và quyền vote đúng vòng/hạng mục; không chờ email hoặc BTC duyệt.
- Không chọn ghế, payment provider, check-in, email vé tự động, hủy/hoàn/thu hồi sau Hoàn tất.
- Giá 100.000/190.000/280.000 VND và quota trong test là dữ liệu DEMO local, chưa được duyệt thành dữ liệu bán thật hoặc fixture trên Supabase.

## Kiểm tra sau khi ghi cấu hình đã được chốt

Đọc lại ID mùa/vòng, giá, quota, lịch, chế độ và trạng thái công bố; kiểm tra không tạo đợt trùng. Không tự công bố mùa/vòng, tạo đơn giả, cấp vé giả, đo tải online hoặc thay đổi quyền tài khoản để thử cấu hình trên project chứa dữ liệu thật.

## Bằng chứng khởi tạo LIVE

- Offer ID: `babfc70d-5b6b-4c62-8fe6-87196aef47de`, slug `chung-ket-2027`, tên Đêm chung kết FTUCharm 2027.
- Đúng mùa/vòng 2027 đã tồn tại. `mode=LIVE`, `published=false`, `starts_at=null`, `qr_path=null`, chưa có hướng dẫn chuyển khoản.
- Đọc lại bằng SQL xác nhận không có products/requests; catalog công khai không trả offer này. Vé và phiếu vẫn bằng 0. Không dùng bản ghi thật để tạo đơn kiểm thử.
- SQL cấu hình đã thực hiện: [tools/configure-final-live-offer.sql](../tools/configure-final-live-offer.sql), có transaction và guard để chạy lại không ghi đè dữ liệu.
- Đây là thao tác cấu hình qua connector được người dùng yêu cầu, chưa phải thao tác admin qua website. Không gán actor Auth tùy ý hoặc tạo tài khoản/role giả để ghi audit.
- Chưa tạo bán kết: mùa 2027 chưa có vòng bán kết trong dữ liệu chung. Cần phối hợp cấu hình vòng trước khi gắn đợt bán.
- Phần còn chờ: giá đơn/combo, quota EARLY/NORMAL của ba loại, giờ mở/đóng, QR/ngân hàng/hướng dẫn; cấu hình backend/media, quyền admin và kiểm thử tích hợp trước vận hành.

## Đọc lại nguồn theo phản hồi người dùng

Đã trích văn bản và xem trực tiếp cả ba ảnh trong `skill/bosung.docx`, rồi đối chiếu `skill/Nhiemvu.md`, `skill/NGHIEP_VU_HIEN_HANH.md` và reference của skill ngày 14/10/2026:

- Ảnh 1 là mẫu sáu cột lưu dữ liệu, không có giá hoặc thông tin nhận tiền.
- Ảnh 2 có EARLY BIRD/The Intro/The Bridge/The Chorus và The INTRO/Đơn/Combo 2/Combo 3/Đêm. Các số 0/1/2/5 là minh họa thống kê; không có giá VND, quota từng loại hoặc giá combo.
- Ảnh 3 ghi ngày/tháng và khoảng 100 vé/2 giờ, không có giờ cụ thể, quota từng loại, giá hoặc QR/tài khoản ngân hàng. Không coi khoảng 2 giờ hết vé là giờ đóng đã chốt.
- Văn bản gốc còn ghi năm 2026; xác nhận trực tiếp mới hơn của người dùng đổi thành 2027 và giữ ngày/tháng. Không sửa nguồn trong lượt cấu hình này.
- Các skill hiện hành ghi BTC cấu hình giá/quota/combo/QR, và chỉ duyệt dữ liệu giả cho local. Không có thông số thật bổ sung để tự bật bán.

Đã hỏi lại phần thiếu dựa trên kết quả đọc nguồn. Giữ offer LIVE đã tạo ở trạng thái chưa công bố; chưa ghi giá/quota/giờ giả hoặc công khai QR DEMO.
