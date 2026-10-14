# Bàn giao bán vé FTUCharm 2027

Cập nhật sau gộp Git `8115e0f`: [trang khách](http://127.0.0.1:5173/admin/ve) nối Supabase thật qua backend local; ảnh DEMO ở R2 local. SUPER_ADMIN có MFA tùy chọn; chỉ SUPER_ADMIN đóng sớm vote với lý do, phiên đóng không mở lại. Riêng đợt DEMO đã được duyệt ghi dữ liệu Supabase, khác preview minh họa trong nghiệm thu cũ phía dưới. Đọc [báo cáo mới nhất](git-sync-admin-customers-20261014.md) trước vận hành; không dùng hướng dẫn MFA bắt buộc cho SUPER_ADMIN hoặc mở lại vote cũ.

Luồng hiện hành: loại/combo → bảy thông tin → QR → ảnh → Hoàn tất → quyền vote ngay. Email vé do bên khác gửi thủ công. Đọc [nghiệm thu và API](supplement-acceptance.md); các cấu hình/vé ở DEMO là dữ liệu giả, không chuyển tiền thật.

UI lần lượt hiện từng bước: Xác nhận vé & combo → form → Xác nhận thông tin → QR → Tiếp tục gửi minh chứng → ảnh → Hoàn tất. Người mua được đổi lựa chọn vé trước tạo đơn, và đổi ảnh chọn trên máy trước khi gửi Hoàn tất. Sau khi ảnh đã nhận ở server, retry dùng ảnh đó; không ghi đè minh chứng đã nhận hoặc đơn đã Hoàn tất. DEMO cho xem/chọn/đổi ảnh trên máy, không upload/lưu đơn. Schema/API Supabase giữ nguyên.

## BTC cấu hình

1. Dùng mùa/vòng chung đã được người phụ trách CMS xác nhận; không tạo mùa/vòng trùng. Lịch là năm2027. Admin cần email xác minh, MFA, TICKET_STAFF; SUPER_ADMIN quản lý phân quyền.
2. Trong admin chọn **Bán vé theo bổ sung**, tạo mẫu DEMO. Điền ID mùa/vòng, slug/title, venue/ngày/giờ; chưa biết thì giữ nháp. Mẫu 100k/190k/280k/quota100 chỉ phục vụ demo, không là giá đã chốt.
3. Products gồm tên loại, EARLY/NORMAL, quota, giá vé đơn, combo2_vnd/combo3_vnd (null tắt combo), opens_at/closes_at có timezone, enabled. Mỗi SKU có quota riêng, một combo dùng2/3 vé. Không áp cap10/đơn hoặc tổng/tài khoản. Điền quota vừa nhu cầu; cấp rất nhiều vé tạo tương ứng rất nhiều records trong cùng transaction.
4. Giá/lịch mới áp dụng đơn mới; đơn đã giữ giữ snapshot30 phút. Không giảm quota dưới đã giữ/Hoàn tất hoặc đổi vòng/chế độ của đợt đã có đơn. Khi vé sớm hết, vé thường cần đã được BTC mở trong cấu hình. Tắt/ẩn SKU không xóa dữ liệu cũ.
5. LIVE cần hướng dẫn thanh toán, QR PNG/JPG/WebP same-origin tại `/images/...`; phải có asset thật trong bản frontend. Kiểm tra tài khoản, số tiền và mã đơn. Worker kiểm tra QR khả dụng trước khi giữ LIVE. DEMO không có tài khoản nhận tiền thật; khung QR DEMO là minh họa, không chuyển khoản.
6. Chuẩn bị hạng mục nam/nữ, danh sách thí sinh eligible/published đúng vòng trong mục Vòng thi. VOTE_MANAGER mở cửa sổ10 phút tại thời điểm đã xác nhận. Người dùng chọn đúng vòng trên trang Bình chọn.

Không import fixture test vào Supabase có dữ liệu thật. File cấu hình kết nối/secret hiện hữu được giữ riêng, không paste vào JSON cấu hình vé, source, CSV hoặc báo cáo.

## Lịch theo ảnh

| Mốc năm2027 | Hành vi                                                                                   |
| ----------- | ----------------------------------------------------------------------------------------- |
| 15/2–6/3    | Chỉ xem                                                                                   |
| 7/3         | Mở đăng ký thí sinh, thuộc CMS                                                            |
| 21/3        | Đóng đăng ký thí sinh, thuộc CMS                                                          |
| 29/3        | Mở vé sớm2 ngày; khoảng100vé/ước tính2h là thông tin dự kiến, BTC cấu hình quota/giờ thực |
| Sau vé sớm  | Cập nhật giá và bán thường                                                                |
| Đến24/4     | Bán vé thường                                                                             |
| 25/4        | Bán kết, vote10 phút trong ngày, giờ BTC cấu hình                                         |
| 26/4        | Mở vé sớm chung kết khoảng2h/quotaBTC; không là ngày tổ chức chung kết                    |
| 10/5–11/5   | Cập nhật ảnh những người vào bán kết, giữ đúng chữ trong ảnh                              |

Không tự đăng/publish lịch CMS, suy ra ngày chung kết hoặc biến ước tính hết vé thành giờ đóng chắc chắn.

## Xem và bàn giao dữ liệu

Admin có sáu cột đúng mẫu. Mã ở dòng là mã yêu cầu mua duy nhất, các vé cấp để vote có mã con `mã-yêu-cầu-ordinal`. Số lượng là tổng vé đơn+combo; cột Combo giữ số phần combo. Thống kê nhóm theo đúng vòng/loại/tier/Đơn/Combo2/Combo3. Người dùng chốt ảnh thống kê là minh họa; dữ liệu không có “Đêm” thì bỏ cột đó, không tạo trường hoặc suy ra số liệu mới.

CSV tải **trang hiện tại50 đơn**, không toàn bộ mọi trang; bên gửi mail lấy các trang cần dùng. CSV chứa ID minh chứng để tham chiếu qua API có quyền, không có ảnh/URL public; xem ảnh trực tiếp trong admin. Thông tin cá nhân chỉ bàn giao cho người có quyền, không đăng file ra công khai. Dữ liệu/ảnh cần được bên gửi mail đối chiếu và xử lý thủ công; không có outbox/mail vé tự động.

Hoàn tất cấp N vé và N phiếu/hạng mục đúng vòng ngay dù BTC chưa nhận/đối chiếu tiền và chưa gửi mail. Không ghi “đã thanh toán thực nhận” từ trạng thái COMPLETED hoặc tổng tiền theo đơn.

## Xử lý sự cố

- Hết30 phút: database trả PURCHASE_EXPIRED, UI yêu cầu đặt lại. Không kéo dài bằng refresh/retry. Quota hết hạn được bỏ khỏi tồn kho ngay; cron cập nhật trạng thái theo batch để gọn index. Tiền gửi muộn không tự tạo vé.
- Upload/lưu lỗi: chưa thấy Hoàn tất thành công thì retry cùng đơn/proof; không tạo đơn mới khi chưa biết kết quả. Refresh dùng `?don=<id>` để đọc trạng thái owner và proof đã lưu. Hoàn tất COMMITTED trả cùng dữ liệu, không nhân số vé. Upload riêng chưa có quyền vote.
- Network lỗi lúc gắn ảnh: object private có thể đã lưu nhưng chưa rõ DB commit. Không xóa object chỉ vì request timeout; đối chiếu `purchase_evidence.object_key` trước dọn orphan. Chỉ dọn object chắc chắn không được tham chiếu trong môi trường đã được phép, sau cửa sổ request đang chạy; không xóa proof đang dùng.
- Ảnh sai/tiền thiếu/thừa/không nhận: lưu lịch sử, chuyển vấn đề cho BTC/bên đối chiếu thủ công. Theo quyết định mới không hủy/hoàn/thu hồi quyền sau Hoàn tất; không tự xóa vé hoặc phiếu để xử lý.
- Quota tranh chấp: server khóa products, kiểm tra sau chờ khóa. Khách thất bại chọn lại số lượng/loại đang mở; không ghi đè stock từ frontend hoặc sửa counter thủ công.
- Vote sự cố: VOTE_MANAGER đóng; SUPER_ADMIN có lý do mở lại phiên CLOSED chưa FINALIZED. Phiếu đã gửi giữ nguyên, lượt không được cấp lại. Chốt tạo snapshot; công bố riêng; đã chốt không mở lại.
- Legacy chưa có hạng mục: giữ/chặn. VOTE_MANAGER dùng danh sách đối chiếu và ID hạng mục đúng vòng; không tự gán hoặc đổi thí sinh/lịch sử. Có dữ liệu không đủ xác minh thì tiếp tục chặn.

Audit ghi cấu hình, Hoàn tất và thao tác phiên; không log buyer/secret/raw proof. Theo dõi lỗi upload/RPC, quota, thời hạn, pool, orphan và vote đóng. Không đưa token/proof/PII vào log quan sát.

## Migration và phục hồi

Đã đồng bộ đủ chín migration lên project Supabase được người dùng chỉ định ngày 14/10/2026; schema và migration history khớp local. Xem [báo cáo đồng bộ, tài khoản và cấu hình còn thiếu](supabase-sync-20261014.md). Trước vận hành cần backup toàn môi trường, cấu hình và kiểm thử tích hợp thật trong phạm vi được phép. Bảng mới bật RLS, không cấp anon/authenticated trực tiếp; Worker kiểm tra owner/role rồi gọi service RPC. Giữ secret server-only, publishable key frontend. Không thay secret trong lượt đồng bộ.

Rollback `supabase/rollbacks/20261014120000_supplement_purchases.sql` chỉ chạy khi module chưa dùng và chưa có offer/request/vé bổ sung. Guard từ chối khi đã có dữ liệu; sau sử dụng cần forward fix, backup/khôi phục có kế hoạch. Không sửa migration đã áp ở một môi trường; phát hành migration tiếp theo khi cần.

Worker production cần MEDIA (private R2) và IMAGES binding; cấu hình hiện chưa provision chúng. Auth/JWKS/captcha/Origin/rate limiter giữ cấu hình chung, cần test staging thật trước mở bán. Cron bổ sung expire_purchase_holds; registration outbox cũ giữ cho người thứ nhất. Không có provider/webhook hoặc mail vé mới.

## Kiểm tra local tái lập

`npm run typecheck`, `npm run lint`, `npm test -- --maxWorkers=2`, `npm run build`, `npm run test:e2e`. Test native bị skipped nếu không opt-in; không coi skipped là đã kiểm tra database đồng thời.

Native harness chỉ nhận `FTU_TEST_DATABASE_URL` là loopback127.0.0.1, port55433, usercodex_test, databasepostgres; tự tạo database `ftu_supplement_<timestamp>` riêng. Cần PostgreSQL local đã provision và Playwright Chromium. Chạy:

```powershell
$env:FTU_TEST_DATABASE_URL='postgresql://codex_test@127.0.0.1:55433/postgres'
# QA_DIR là thư mục artifact ngoài repository, không chứa dữ liệu thật.
$env:FTU_QA_DIR='C:/path/to/local-qa'
npm test -- --maxWorkers=1 tests/db/native-purchases.test.ts
# Chỉ bật khi đã được phép đo tải local.
$env:FTU_RUN_LOCAL_LOAD='true'
npm test -- --maxWorkers=1 tests/db/native-purchases.test.ts
```

Harness khởi động UI5174/API8788, fake Auth/captcha và private storage local chỉ trong code tests; không thêm bypass vào ứng dụng thật. Đóng các server harness khi xong, giữ DB/artifacts fake để đối chiếu. Không dùng harness/fixture cho dữ liệu thật hoặc URL remote. Bundle Worker dùng `wrangler deploy --dry-run` sau build, không upload/deploy; đừng bỏ `--dry-run` nếu chưa được phép.
