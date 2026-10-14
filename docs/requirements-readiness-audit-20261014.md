# Kiểm tra yêu cầu và khả năng vận hành FTUCharm ngày 14 tháng 10 năm 2026

Đối chiếu skill/Nhiemvu.md, skill/NGHIEP_VU_HIEN_HANH.md, skill/Prompt.md, skill FTU, Word, code, migrations và Supabase thật. **Phần việc đã có triển khai và nghiệm thu local/DEMO; chưa đủ điều kiện vận hành online. Tài khoản chưa đủ: Supabase Auth hiện có 0 user và 0 người được phân quyền.**

Lượt này chỉ kiểm tra và ghi báo cáo; không sửa code, migration, dữ liệu online, tài khoản, secret hoặc tiến độ Word. Các yêu cầu cài đặt nằm trong Prompt.md được dùng để đối chiếu, không là yêu cầu cài lại skill.

## Đối chiếu nghiệp vụ

| Yêu cầu                                                        | Bằng chứng và kết luận                                                                                                                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01–R03: loại/cụm, số lượng, combo, không chọn ghế/không cap10 | PurchaseTickets và purchaseSelectionSchema có lựa chọn đơn/Combo2/3, số lượng; DB kiểm tra quota. BTC bố trí combo gần nhau thủ công theo phạm vi đã chốt                                       |
| R04–R06: bảy thông tin, QR rồi minh chứng                      | Có form bảy trường, hai bước Tiếp tục; LIVE kiểm tra asset QR. Upload JPG/PNG xử lý WebP/private, từ chối thiếu Images/R2                                                                       |
| R07–R08: Hoàn tất, mẫu sáu cột, mã duy nhất                    | complete_purchase transaction và constraints; PurchaseRecords có đủ sáu cột, owner/admin đọc ảnh, admin CSV theo trang                                                                          |
| R09: N vé có N lượt/hạng mục đúng vòng ngay                    | DB cấp SUPPLEMENT tickets sau Hoàn tất, không cần check-in/email/duyệt; unique vé/hạng mục, ownership/phiên/thời gian và retry. Có tests trước/sau Hoàn tất và bán kết                          |
| R10–R11: bàn giao, email thủ công, bỏ provider/check-in        | Dữ liệu có quyền/CSV sẵn; không thêm payment provider hoặc email vé. Code/schema legacy giữ riêng                                                                                               |
| R12: vé sớm/quota/giá thường                                   | Có EARLY/NORMAL và trạng thái theo quota/lịch. Vé thường cần BTC cấu hình đang mở; không tự suy giá hoặc giờ chuyển                                                                             |
| R13: timeline 2027                                             | Tài liệu và mẫu cấu hình có các mốc đã chốt. **Dữ liệu vận hành 2027 chưa đủ:** chỉ mùa/chung kết nháp, không bán kết/timeline/lịch đăng ký/thí sinh/đợt vé. CMS do người thứ nhất/BTC cấu hình |
| R14: nghiệm thu có bằng chứng                                  | Word có 11/11 ô X và ghi rõ local/DEMO. Không coi dấu X là đã kiểm thử hoặc triển khai production                                                                                               |

## Kiểm tra chạy trong lượt này

- `npm test -- --maxWorkers=2`: **133 passed, 1 skipped**; 14 test files passed, một file native PostgreSQL skipped do chưa bật môi trường test riêng.
- `npm run typecheck`: đạt.
- Sáu source hashes và hash Word khớp bằng chứng nghiệm thu đã lưu. Tài liệu cũ ghi 46 E2E, native concurrency và benchmark500→1.000 local; không chạy lại E2E/native/benchmark trong lượt kiểm tra này.
- Kiểm tra Supabase qua connector: chín migration đúng version file local; 44 bảng public, không bảng nào tắt RLS. **0 accounts, 0 verified accounts, 0 MFA, 0 role assignments, 0 offers/products/purchases/tickets/votes/contestants**.
- Mùa2027 chưa publish, registration_open/close null; chỉ vòng final chưa publish và hai hạng mục. Timeline2027 có0 dòng.
- Chín SKILL.md bắt buộc trong Prompt.md đều tồn tại tại user skills và các skill tương ứng có trong catalog phiên này. Không cài lại hoặc cập nhật skills chung.
- Không có .env/.env.local/apps/api/.dev.vars/.dev.vars; chỉ template. Không thấy process lắng nghe5173/8787 tại thời điểm kiểm tra.
- Wrangler whoami --json trả `loggedIn:false`; sau đó CLI có lỗi Node Windows UV_HANDLE_CLOSING. Chưa chứng minh có phiên Cloudflare sử dụng được trên máy này; không login/provision/deploy. [Tham chiếu lệnh whoami](https://developers.cloudflare.com/workers/wrangler/commands/general/).
- Git đang ở nhánh local `web_ftu`, HEAD `ad30504`, nhiều thay đổi chưa commit. Remote đúng repository. Không có gh CLI; chưa xác minh quyền push bằng tài khoản Git, không dùng mật khẩu trong chat.

## Những phần còn local hoặc chưa đủ cấu hình

| Phần                    | Còn thiếu                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database                | Schema đã online. Catalog thật rỗng vì chưa có đợt/loại vé cấu hình                                                                                             |
| Web/API                 | Code local; chưa có URL online hoặc bằng chứng triển khai bản này. Dev mặc định preview và dùng fixture nếu không có env override                               |
| Auth ứng dụng           | Thiếu env frontend/server phù hợp, tài khoản website và MFA quản trị. Supabase connector đăng nhập không thay thế đăng nhập website                             |
| Cloudflare              | Cần phiên đăng nhập/account có quyền Workers/R2/Images/Turnstile. Wrangler chưa có MEDIA/IMAGES, Origin còn placeholder; upload thực từ chối khi thiếu bindings |
| Thanh toán theo bổ sung | BTC cung cấp giá/quota/combo/lịch/QR/hướng dẫn thật và assets. Giữ quota30 phút; Hoàn tất cấp quyền vote ngay; không cần account payOS/SePay                    |
| CMS và vote             | Cấu hình bán kết2027/timeline, lịch đăng ký, thí sinh/eligible, publish đúng thời điểm và mở phiên10 phút                                                       |
| Gửi vé thủ công         | Chỉ định người nhận dữ liệu và tài khoản có quyền cần thiết; không thêm gửi mail vé tự động                                                                     |
| Nghiệm thu online       | Cần kiểm thử Auth/MFA/Turnstile, Images/R2 và luồng mua→Hoàn tất→vote thật trong môi trường được phép. Tải local không chứng minh tải online                    |

Supabase là dịch vụ dữ liệu/Auth đang kết nối; không cần một DB login riêng cho mỗi người mua. Cloudflare là môi trường chạy API/lưu ảnh, là tài khoản dịch vụ riêng. GitHub chỉ quản lý code.

## Tài khoản cần có

Tối thiểu một tài khoản website **SUPER_ADMIN**, email được xác minh và MFA aal2. Hàm has_role hiện cho SUPER_ADMIN quyền các module nên có thể dùng một tài khoản cho thử tích hợp. Nếu chia việc: TICKET_STAFF quản lý vé/minh chứng/dữ liệu; VOTE_MANAGER quản lý phiên/hạng mục/kết quả; CONTENT_EDITOR/CONTEST_REVIEWER cho CMS/hồ sơ.

Người mua cần tài khoản Auth xác minh email, không cần role quản trị. CHECKIN_STAFF là role legacy và không cần cho luồng bổ sung. Resend thuộc phần đăng ký chung nếu cần, không là yêu cầu thêm dịch vụ gửi vé tự động.

Email trước đó được cung cấp với ngữ cảnh Git; người dùng chưa chốt dùng cho quản trị website. Chưa tạo tài khoản hoặc cấp SUPER_ADMIN cho danh tính đó. Không đưa mật khẩu vào báo cáo.

## Điểm chưa khớp và giới hạn triển khai

1. Prompt.md:5 và AGENTS.md:5 còn câu “không migration” dù lượt tiếp theo đã đồng bộ thật; đoạn hiện hành phía dưới đã ghi đồng bộ. Cần thống nhất phần mở đầu để tránh đọc nhầm phạm vi.
2. Nhiemvu.md:38 và NGHIEP_VU_HIEN_HANH.md:38 còn liệt kê “Đêm” mà chưa nhắc ngay quyết định bỏ nếu không có data. Skill reference/code đã theo xác nhận mới; không tự bổ sung trường Đêm.
3. Báo cáo cài skill có các đoạn2/11, năm2026 và thiếu Python Playwright thuộc nhật ký trước; không dùng chúng để đánh giá tiến độ hiện tại. Tests hiện dùng Node Playwright, không suy thiếu Python module thành thiếu toàn bộ E2E.
4. Lịch sử mua của người dùng lấy100 bản ghi gần nhất trước khi lọc COMPLETED ở UI, chưa có phân trang. Khi nhiều đơn hoặc nhiều đơn chưa Hoàn tất, giao diện lịch sử có thể không hiện hết đơn Hoàn tất cũ; admin có phân trang50. Không ảnh hưởng các record đã lưu trong DB.
5. `/api/me/tickets` và `/api/me/votes` lấy một response, chưa phân trang hoặc lọc theo vòng/hạng mục tại server. Cần kiểm tra giới hạn REST thật và thiết kế phân trang trước nghiệm thu tài khoản có nhiều vé/phiếu; tests local hiện không chứng minh mọi quyền N vé hiển thị đủ khi response bị giới hạn. Chưa đo hoặc tái hiện trường hợp này trên project thật.

**Kết luận:** nghiệp vụ chính có code và tests local đạt, database schema đã online. Không thể xác nhận “đáp ứng đủ để chạy thật” khi chưa có tài khoản, đợt bán/lịch/thí sinh, cấu hình chạy/upload/captcha và kiểm thử tích hợp online; giới hạn phân trang/tài liệu cũng cần xử lý trước bàn giao vận hành. Word11/11 chỉ là nghiệm thu local đúng phạm vi đã ghi.
