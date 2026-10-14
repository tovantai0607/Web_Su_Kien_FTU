# Đồng bộ Supabase FTUCharm ngày 14 tháng 10 năm 2026

Đã dùng plugin Supabase kết nối đúng project `ifgtyslifgegwcguysbb`, áp bốn migration còn thiếu theo yêu cầu mới của người dùng và đối chiếu schema với code local. Database đã đồng bộ cấu trúc; website/API và hạ tầng lưu ảnh chưa được triển khai online trong lượt này.

## Thay đổi đã thực hiện

| Migration local và remote                    | Nội dung                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| 20261013143000_ftucharm_sales_voting         | Schema nền cho tickets/votes, bảo toàn cấu trúc legacy                             |
| 20261013150000_ticket_inventory_operations   | RPC tồn kho cũ được code/cron hiện hữu tham chiếu                                  |
| 20261014100000_charm2027_profiles_categories | Trường hồ sơ, hạng mục nam/nữ, mùa 2027 dạng nháp                                  |
| 20261014120000_supplement_purchases          | Loại/combo/quota, bảy thông tin, minh chứng riêng tư, Hoàn tất cấp vé và vote ngay |

Không bật lại luồng chọn ghế/payment/check-in cũ. Những bảng nền đó là phụ thuộc của lịch sử migration/code hiện hữu; luồng mới dùng purchase_offers, purchase_products, purchase_requests, purchase_allocations và purchase_evidence. Ảnh lưu private ở R2; database lưu metadata/object_key, không chứa file ảnh nhị phân.

Connector tạo version theo thời điểm thực thi. Đã lưu history trước sửa, kiểm tra tên và MD5 toàn bộ SQL của từng migration, rồi cập nhật riêng bốn version trong transaction để khớp tên file local. Không chạy lại SQL khi sửa history. Lịch sử cuối cùng có đúng chín version local; không chạy lại CREATE TABLE hoặc import fixtures.

Dữ liệu cấu hình có trước được giữ nguyên: một mùa 2026 nháp, ba vòng, 11 mốc timeline, ba nhóm tin và tám role. Migration hiện hữu thêm một mùa 2027 và vòng chung kết dạng nháp, hai hạng mục; không publish hoặc mở vote. Không chuyển lịch CMS cũ sang 2027 hay tự tạo vòng bán kết/cutoff thay người phụ trách CMS.

## Kiểm tra đã có bằng chứng

- 12 hàm nền trước cập nhật khớp migration local. Replay chín migration local thành công.
- Sau cập nhật, 53 hàm public/private, 362 cột, constraints, 159 indexes và 24 RLS policies khớp schema local; khác biệt cách PostgreSQL 18/PGlite biểu diễn NOT NULL được đối chiếu qua is_nullable trên PostgreSQL 17 remote.
- 44 bảng public bật RLS. Không có SECURITY DEFINER RPC public cấp EXECUTE cho anon/authenticated; service_role đủ quyền RPC. Năm bảng purchase không cấp quyền trực tiếp cho client.
- HTTP từ máy này: JWKS 200/ES256; Auth settings 200, signup bật, email confirmation bật; public editions 200; đọc purchase_requests bằng publishable key bị từ chối 401. Node fetch ban đầu timeout; PowerShell kiểm tra thành công. Chưa kiểm thử phiên đăng nhập thật hoặc checkout trên Cloudflare.
- Catalog chạy được và trả offers rỗng đúng dữ liệu. Chưa có Auth user, role assignment, offer/product, đơn mua, vé, phiếu vote hoặc thí sinh.
- Advisor bảo mật chỉ có INFO RLS enabled/no policy ở 20 bảng server-only, không ERROR/WARN. Performance có INFO 41 FK chưa có index phủ và 48 index chưa dùng. Chưa có workload online; giữ indexes đã kiểm thử, không tự thêm/xóa theo các thông báo INFO.
- Đã lưu schema, định nghĩa hàm, grants/policies và dữ liệu cấu hình trước cập nhật, schema sau cập nhật, generated TypeScript types và báo cáo đối chiếu tại thư mục QA ngoài Git. Đây là bản chụp đối chiếu, không thay thế backup toàn project/Auth/Storage hoặc PITR.

Nghiệm thu 11/11 trong Word vẫn là local/DEMO. Kết quả tải local trước đó không chứng minh sức tải Supabase/Cloudflare online. Không tạo fixture, đơn/vé/vote test, chuyển tiền hoặc gửi email trên project này.

## Những phần còn local hoặc cần cấu hình

| Phần              | Hiện trạng và điều kiện còn thiếu                                                                                                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database/RPC      | Đã ở Supabase; schema và history khớp local                                                                                                                                                                                |
| Web/API           | Theo chỉ định tiếp theo đã tạo/chuyển sang nhánh local web_ftu, giữ toàn bộ thay đổi từ codex/supplement-ticket-flow; nhánh web_ftu chưa có trên origin trước khi tạo. Chưa commit/deploy/push trong lượt này              |
| Môi trường local  | Chỉ có .env.example và apps/api/.dev.vars.example; chưa có .env.local hoặc apps/api/.dev.vars. Dev mặc định preview, đọc fixtures; connector kết nối không tự cấu hình app                                                 |
| Cloudflare        | Wrangler chưa có MEDIA/IMAGES binding; Origin đang là placeholder. Cần account/môi trường Workers, private R2, Images, Turnstile và cấu hình server. Chưa kiểm tra đăng nhập/account Cloudflare; không tự provision/deploy |
| Secret/public key | Project có publishable key dùng frontend; server dùng secret riêng trong .dev.vars/Workers secrets. Không cần tạo DB user mới cho API dùng SDK/RPC; không đưa server key vào VITE_*                                        |
| CMS 2027          | Mùa/chung kết còn nháp; vòng bán kết 2027, timeline, registration window và thí sinh/eligible thuộc người phụ trách CMS/BTC cấu hình                                                                                       |
| Bán vé            | BTC cấu hình loại The Intro/The Bridge/The Chorus, giá/quota/combo, lịch/giờ, QR và hướng dẫn thật trước publish. Không đưa giá giả/quota test lên DB thật                                                                 |
| Gửi vé email      | Bên khác thực hiện thủ công từ dữ liệu có quyền; không thêm mail vé/outbox tự động                                                                                                                                         |
| Kiểm thử online   | Còn cần đăng nhập/MFA, upload R2/Images, checkout/vote đúng môi trường được phép; chưa chạy load online                                                                                                                    |

## Tài khoản cần có

Hiện auth.users và user_roles đều có **0** bản ghi.

Tối thiểu cần **một tài khoản quản trị SUPER_ADMIN**, xác minh email và bật MFA; has_role hiện coi SUPER_ADMIN có quyền các module. Nếu chia việc, dùng tài khoản TICKET_STAFF cho vé/dữ liệu và VOTE_MANAGER cho phiên/hạng mục/kết quả; CONTENT_EDITOR/CONTEST_REVIEWER cho người phụ trách CMS/hồ sơ. Tài khoản bên gửi mail chỉ cấp quyền dữ liệu cần dùng. CHECKIN_STAFF là role cũ, không cần cho luồng bổ sung.

Người mua dùng tài khoản Auth xác minh email, không cần gán role quản trị hoặc tạo DB login. Không có nhu cầu tạo user test trên database đang được người dùng xác định là có dữ liệu thật.

**Đang chờ:** email/UUID tài khoản quản trị và cách phân vai do người dùng chỉ định. Chưa tạo tài khoản, tự xác minh email, đặt mật khẩu hoặc cấp quyền cho một danh tính suy đoán. Sau khi tài khoản được đăng ký và xác minh, đối chiếu đúng UUID rồi bootstrap SUPER_ADMIN; các phân quyền tiếp theo dùng quản trị/MFA và audit.

Yêu cầu đồng bộ Supabase ở lượt này thay giới hạn migration remote của lượt nghiệm thu local trước. Không mở rộng thành quyền đo tải online, deploy, push Git, thay secrets, gửi email hoặc thanh toán thật.
