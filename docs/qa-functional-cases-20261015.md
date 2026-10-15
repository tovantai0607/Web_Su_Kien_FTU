# Bộ test case chức năng FTUCharm 2027

Ngày lập: 15/10/2026. Phạm vi: website khách, tài khoản, hồ sơ, CMS, vé/combo,
minh chứng, vote, cấu hình BTC, ảnh/kết quả, Google Sheets và vận hành.
Không mở rộng nghiệp vụ sang email vé tự động, webhook thanh toán hoặc check-in.
Các test legacy của phần dùng chung vẫn được giữ làm regression.

## Chạy và dọn demo

```powershell
cd D:\Web_Su_Kien_FTU
npm run test:full
```

Không cần Supabase secret hoặc tài khoản thật. Cần dependency và Chromium của
Playwright đã cài. Lệnh tạo mẫu người mua và PNG trong thư mục tạm riêng, dùng
chúng trong hành trình mua vé, rồi xóa mẫu trong `finally`. DB PGlite chạy trong
bộ nhớ, apply migration và nạp SQL fixture vào DB riêng; test đóng DB và xóa map
ảnh. Browser context, HTTP/Vite server được đóng sau test, kể cả khi lỗi.
Không tạo demo online nên không có lý do xóa bất kỳ dữ liệu lịch sử trên Supabase.

Nguồn mẫu `.sql`, mã tạo fixture và test được giữ để chạy lại; đó là tài liệu/mã
nguồn, không phải bản ghi khách/vé/vote trên website. Báo cáo và ảnh bằng chứng
chỉ chứa dữ liệu giả, lưu tại `output/full-qa/<run>/`; `latest.json` chỉ tới lượt mới nhất.

Runner bỏ env kết nối DB test từ bên ngoài, không chạy tải, không deploy, không
migration remote. E2E dùng Auth/API giả hoặc API thật local nối PGlite; chặn request
ra ngoài. CAPTCHA/OAuth/email/storage cloud thật chưa được chứng minh bởi adapter.

## Mẫu và tiền điều kiện

- Khách chưa đăng nhập; hai tài khoản QA riêng `demo@example.test`, `qa@example.test`.
- SUPER_ADMIN, CONTENT_EDITOR, CONTEST_REVIEWER, TICKET_STAFF, VOTE_MANAGER; thử aal1/aal2.
- Mùa chính thức test và mùa DEMO/staging riêng; bản công bố và bản nháp.
- Bán kết/chung kết; EARLY/NORMAL; The Intro/Bridge/Chorus; đơn/Combo2/Combo3.
- Giá 100.000 và combo 190.000/280.000 chỉ là fixture local, không cấu hình LIVE.
- Đơn RESERVED/COMPLETED/EXPIRED; hai chủ sở hữu; vé đúng/sai vòng; ảnh PNG thật,
  file giả ảnh, ảnh quá lớn, blob WebP đã xử lý; phiên vote chưa mở/đang mở/đã đóng.
- Thời điểm Việt Nam, trước/đúng/sau mốc; UTC trong database phải tương đương UTC+7.

Quy ước: **L** = có test tự động local liên quan; đối chiếu tên assertion trong
inventory và log thực thi, không hiểu là đã nghiệm thu dịch vụ cloud. **T** = cần
nghiệm thu tích hợp thật trên môi trường test riêng, không chạy vào LIVE.

## Case chức năng và kết quả mong đợi

| ID       | Thao tác / dữ liệu thử                                           | Kết quả mong đợi                                                | Lớp |
| -------- | ---------------------------------------------------------------- | --------------------------------------------------------------- | --- |
| PUB-01   | Mở trang chủ                                                     | Logo, nội dung và liên kết đúng, không lỗi JS                   | L   |
| PUB-02   | Đi tất cả menu/header/footer, tải lại URL con                    | Route đúng, không 404 từ SPA                                    | L   |
| PUB-03   | Xem timeline mùa chính thức                                      | Đúng 11 mốc, thứ tự và năm 2027                                 | L   |
| PUB-04   | Đổi giờ máy khách sang thời điểm mở đơn                          | Trạng thái hành động vẫn theo giờ server                        | L   |
| PUB-05   | Mùa DEMO/staging có dữ liệu                                      | Catalog/timeline/thí sinh công khai không lẫn mùa               | L   |
| PUB-06   | Chưa có thí sinh, ảnh, nhà vô địch                               | Hiện trạng thái chờ, không dựng người/ảnh giả                   | L   |
| PUB-07   | Tìm tên/số báo danh, đổi trang/hạng mục/vòng                     | Kết quả lọc đúng, không lộ email/SĐT/MSSV                       | L   |
| PUB-08   | Mở chi tiết thí sinh đã/không công bố                            | Chỉ hồ sơ công bố đọc được                                      | L   |
| PUB-09   | Mở gallery, next/prev, Escape, keyboard                          | Focus và chỉ báo slide đúng, đóng modal được                    | L   |
| PUB-10   | Thiết bị không có WebGL/context loss                             | Nội dung và navigation vẫn hoạt động                            | L   |
| PUB-11   | Pause/resume, reduced-motion, cuộn khỏi cảnh                     | Dừng chuyển động/GPU đúng, giữ logo                             | L   |
| PUB-12   | Viewport 320/390/desktop/rộng 1920                               | Không tràn ngang; auth cân đối, menu mobile có Dự thi           | L   |
| PUB-13   | Keyboard và axe trên trang chính                                 | Focus, label, dialog và WCAG AA checks đạt                      | L   |
| AUTH-01  | Khách mở /admin hoặc link dữ liệu riêng                          | Yêu cầu đăng nhập; không tải dữ liệu riêng                      | L   |
| AUTH-02  | Email trống/sai, mật khẩu yếu, xác nhận lệch                     | Lỗi rõ, không gửi request không hợp lệ                          | L   |
| AUTH-03  | Hiện/ẩn mật khẩu, chuyển đăng nhập/đăng ký/quên                  | Điều khiển đúng, giữ accessibility                              | L   |
| AUTH-04  | Callback Google có code, render lại                              | PKCE exchange một lần, điều hướng đúng quyền                    | L   |
| AUTH-05  | Callback bị hủy, code lỗi/hết hạn                                | Hiện lỗi an toàn và đường khôi phục                             | L   |
| AUTH-06  | Session cũ, token sai scope/chưa xác minh email                  | Server từ chối, không tin role từ browser                       | L   |
| AUTH-07  | Đăng xuất/đổi người dùng                                         | Xóa dữ liệu cache riêng của người trước                         | L   |
| AUTH-08  | MFA enrollment/challenge/remove qua adapter                      | Yêu cầu xác thực, lỗi không báo thành công giả                  | L   |
| AUTH-09  | SUPER_ADMIN aal1; editor/staff aal1                              | SUPER_ADMIN MFA tùy chọn; staff/editor đủ điều kiện MFA         | L   |
| AUTH-10  | Google thật, email xác minh/khôi phục và MFA thật                | Đúng callback/hostname; không dùng tài khoản khách thật         | T   |
| REG-01   | Khách mở Dự thi trước ngày 7/3                                   | Form ba bước luôn xem được                                      | L   |
| REG-02   | Điền thiếu dữ liệu, chiều cao/hạng mục sai                       | Chặn bước/gửi và gắn lỗi đúng trường                            | L   |
| REG-03   | Đi qua Thông tin → Câu chuyện → Ảnh                              | Giữ nội dung trong trang, không lưu PII vào storage             | L   |
| REG-04   | Trước 7/3, đúng 7/3, hết 21/3                                    | OPEN chỉ từ 7/3 00:00 đến trước 22/3 00:00                      | L   |
| REG-05   | Khách hoặc ngoài lịch thử upload/gửi                             | UI khóa và server/database độc lập từ chối                      | L   |
| REG-06   | Email hồ sơ khác email đã xác minh                               | Từ chối                                                         | L   |
| REG-07   | Gửi hợp lệ rồi retry cùng key                                    | Một hồ sơ, không tăng bản ghi/email outbox                      | L   |
| REG-08   | Người khác sửa/xem hồ sơ riêng                                   | Từ chối ownership                                               | L   |
| REG-09   | BTC yêu cầu bổ sung, chủ hồ sơ sửa                               | Chỉ trường/quy trình cho phép, giữ audit                        | L   |
| REG-10   | BTC duyệt/từ chối hồ sơ, lý do                                   | Đúng quyền, trạng thái và thông báo; không công khai PII        | L   |
| TKT-01   | Đợt vé thiếu giá/QR/quota/hướng dẫn                              | Xem lịch được, không giữ vé                                     | L   |
| TKT-02   | Chọn từng loại, đơn/Combo2/Combo3                                | Tổng vé tính 1/2/3 theo số combo; giá server                    | L   |
| TKT-03   | Mua hơn 10 vé khi quota đủ                                       | Không tự cap 10 ngoài hạn mức quota                             | L   |
| TKT-04   | Số âm, thập phân, product sai vòng/tier/tắt                      | Từ chối toàn bộ, không giữ quota                                | L   |
| TKT-05   | Nhập đủ bảy thông tin trước QR                                   | Đúng thứ tự bước, không hiện form upload sớm                    | L   |
| TKT-06   | Đổi vé/quay lại form trước đặt                                   | Giữ lựa chọn và tính lại tổng đúng                              | L   |
| TKT-07   | Giữ vé và retry cùng key/payload                                 | Cùng đơn, cùng giá, TTL không gia hạn                           | L   |
| TKT-08   | Dùng lại key với payload khác                                    | Conflict, không tạo đơn mới                                     | L   |
| TKT-09   | Giữ vé rồi BTC đổi giá                                           | Đơn giữ nguyên snapshot, đơn mới dùng giá mới                   | L   |
| TKT-10   | Đi qua QR/upload và tải lại đơn                                  | Đồng hồ theo expires_at/server, không reset 30 phút             | L   |
| TKT-11   | Hết TTL                                                          | Chặn Hoàn tất, quota trả đúng một lần                           | L   |
| TKT-12   | Đơn hợp lệ còn TTL khi cửa sổ nhận đơn đóng                      | Được Hoàn tất; không nhận đơn mới                               | L   |
| TKT-13   | Vé sớm bị giữ hết nhưng chưa Hoàn tất                            | Chỉ tạm hết khả dụng, không coi đã bán đủ                       | L   |
| TKT-14   | Đủ 100 EARLY Hoàn tất                                            | Chuyển NORMAL sớm, không vượt 100                               | L   |
| TKT-15   | Hết cửa sổ EARLY còn dư, có hold còn hạn                         | Dư chuyển cùng loại, hold vẫn chiếm quota đến expiry            | L   |
| TKT-16   | Combo tranh quota cuối / tổng vòng 700                           | Không vượt quota thực; không trừ combo như một vé               | L   |
| TKT-17   | Bán kết 29–30/3, thường hết 24/4                                 | Đúng biên đóng/mở, độc lập đồng hồ browser                      | L   |
| TKT-18   | Chung kết 26/4 09–11h, thường hết 22/5                           | Đúng biên, bán hết khóa nhận đơn mới                            | L   |
| TKT-19   | 20 kết nối PostgreSQL tranh vé cuối                              | Chỉ đủ quota thắng, retry đúng một lần                          | T   |
| IMG-01   | File giả JPG/PNG hoặc MIME không khớp                            | Từ chối, không tạo minh chứng/vé                                | L   |
| IMG-02   | Ảnh >5MB hoặc >12MP                                              | Chặn tại server, lỗi rõ                                         | L   |
| IMG-03   | PNG/JPEG thật                                                    | Xử lý WebP, bỏ metadata, lưu private theo owner                 | L   |
| IMG-04   | Chọn nhầm ảnh rồi đổi ảnh trước Hoàn tất                         | Lưu ảnh cuối cùng, không ảnh cũ                                 | L   |
| IMG-05   | Upload lỗi/DB attach lỗi                                         | Không báo Hoàn tất, không cấp quyền vote                        | L   |
| IMG-06   | Hoàn tất lỗi rồi retry                                           | Không upload/cấp vé/vote trùng                                  | L   |
| IMG-07   | Người khác/khách mở URL minh chứng                               | Không đọc được; owner/staff đúng quyền đọc được                 | L   |
| IMG-08   | Không có MEDIA/IMAGES như bản online hiện tại                    | Báo 503, không lưu giả                                          | L   |
| IMG-09   | Restart runtime/storage cloud thật                               | Ảnh vẫn còn, link đúng quyền; cần storage online                | T   |
| DONE-01  | Hoàn tất thành công                                              | Đúng số vé, mã duy nhất, quyền vote ngay                        | L   |
| DONE-02  | Retry/refresh sau Hoàn tất                                       | Không tạo thêm vé/phiếu; không gửi email vé                     | L   |
| DONE-03  | Kiểm tra sáu cột quản trị/CSV                                    | Mã, thông tin, minh chứng, loại, số lượng, combo đúng           | L   |
| DONE-04  | Khách yêu cầu hủy/thu hồi sau Hoàn tất                           | Không có luồng khách tự hủy/thu hồi                             | L   |
| VOTE-01  | Chưa có lịch, trước mở, sau đóng                                 | Không cho vote                                                  | L   |
| VOTE-02  | Bán kết đặt lịch ngoài 25/4 hoặc khác 10 phút                    | Server/database từ chối                                         | L   |
| VOTE-03  | Vé RESERVED/chưa Hoàn tất hoặc sai owner/vòng                    | Không được vote                                                 | L   |
| VOTE-04  | Vé Hoàn tất, đúng vòng/hạng mục/thí sinh                         | Ghi một phiếu, không đợi đối soát/email                         | L   |
| VOTE-05  | N vé Hoàn tất                                                    | N lượt cho mỗi hạng mục đúng vòng                               | L   |
| VOTE-06  | Retry/double click cùng vé và hạng mục                           | Một phiếu, trả kết quả idempotent                               | L   |
| VOTE-07  | Thí sinh không eligible/sai giới tính/mùa                        | Từ chối                                                         | L   |
| VOTE-08  | Cùng vé vote hạng mục khác                                       | Theo quyền từng hạng mục, không trừ nhầm lượt                   | L   |
| VOTE-09  | Hết thời gian, request đang chờ khóa                             | Không ghi phiếu trái hạn                                        | L   |
| VOTE-10  | VOTE_MANAGER đóng sớm hoặc SUPER_ADMIN thiếu lý do               | Từ chối; SUPER_ADMIN có lý do được đóng                         | L   |
| VOTE-11  | Mở lại phiên đã đóng/finalized                                   | Từ chối, giữ phiếu cũ                                           | L   |
| VOTE-12  | Xem kết quả và số người tham gia                                 | Phân biệt tài khoản/vé/phiếu, chỉ snapshot được công bố         | L   |
| VOTE-13  | Scheduler cloud đóng phiên tới hạn                               | Cần bật cron có kiểm soát và nghiệm thu riêng                   | T   |
| CMS-01   | Vai trò thường gọi API admin trực tiếp                           | Chặn ở server, không chỉ ẩn nút                                 | L   |
| CMS-02   | CONTENT_EDITOR cấu hình ấn phẩm                                  | Đúng scope mùa, không vượt quyền SUPER_ADMIN                    | L   |
| CMS-03   | Ảnh vòng lưu nháp, staff xem trước                               | Khách không đọc nháp/ảnh nháp                                   | L   |
| CMS-04   | Bấm công bố khi thí sinh/vòng hợp lệ                             | Chỉ xuất hiện sau thao tác công bố                              | L   |
| CMS-05   | Rút eligible/ẩn vòng/thí sinh sau công bố                        | Ảnh/danh sách công khai tương ứng bị ẩn                         | L   |
| CMS-06   | Nhà vô địch theo hạng mục                                        | BTC chọn thủ công, không suy từ vote, không tự công bố theo giờ | L   |
| CMS-07   | Vòng chưa chọn cutoff thí sinh                                   | Không nhầm quota 700 vé thành 700 thí sinh                      | L   |
| CMS-08   | Lưu giá/quota/QR sai, tổng phân bổ quá cap                       | Từ chối, không cập nhật một phần                                | L   |
| CMS-09   | Thay cấu hình bằng revision cũ                                   | Conflict, giữ bản mới hơn                                       | L   |
| CMS-10   | Sửa vai trò, audit                                               | Chỉ quyền hợp lệ, không giả actor từ client                     | L   |
| CMS-11   | CMS nội dung/tài trợ/lịch ngoài các assertions hiện có           | Nghiệm thu CRUD và bản xem trước với tài khoản test riêng       | T   |
| SHEET-01 | Đọc khách phân trang và dữ liệu có revision                      | Không mất dòng, chỉ role được phép                              | L   |
| SHEET-02 | Combo hỗn hợp, nhiều dòng một đơn                                | Tổng vé và số combo đúng theo snapshot                          | L   |
| SHEET-03 | Đổi email liên hệ                                                | Không đổi user_id/quyền vé/vote                                 | L   |
| SHEET-04 | Giảm dưới số UUID vé đã vote                                     | Từ chối nguyên tử; một vé vote hai hạng vẫn chỉ tính một        | L   |
| SHEET-05 | Sửa loại/số lượng/ảnh, quota không đủ                            | Từ chối hoặc cập nhật nguyên tử, giữ phiếu/ảnh cũ/audit         | L   |
| SHEET-06 | Hai editor cùng revision / retry timeout                         | Một bản ghi nhận, bản kia conflict, không ghi lặp               | L   |
| SHEET-07 | Refresh khi có ô đang sửa                                        | Không ghi đè draft A:L, đánh dấu cần đối chiếu                  | L   |
| SHEET-08 | Xác nhận sau preview nhưng ô/revision đổi                        | Từ chối, yêu cầu xem lại                                        | L   |
| SHEET-09 | Công thức CSV, dữ liệu người mua bắt đầu =,+,-,@                 | Xuất dạng text an toàn                                          | L   |
| SHEET-10 | OAuth Apps Script, trigger một phút, Drive ảnh, export xlsx thật | Cần staging Google riêng, không sửa bảng Data thật              | T   |
| SEC-01   | Origin khác, body lớn, schema lạ/sai UUID                        | 403/413/400; không thay đổi DB                                  | L   |
| SEC-02   | Vượt rate limit                                                  | 429; không retry tự tạo thêm dữ liệu                            | L   |
| SEC-03   | anon/authenticated gọi RPC server-only/đọc bảng riêng            | RLS/grants chặn                                                 | L   |
| SEC-04   | Token không hợp lệ / trộn user/mùa/vòng                          | Chặn ownership và composite constraints                         | L   |
| SEC-05   | Rollback migration local có lịch sử                              | Bảo toàn lịch sử hoặc từ chối rollback nguy hiểm                | L   |
| SEC-06   | Cấu hình chương trình chạy hai lần                               | Không tạo mùa/vòng/timeline trùng                               | L   |
| OPS-01   | Bộ test gặp lỗi giữa chừng                                       | Teardown vẫn đóng DB/context/server và dọn ảnh                  | L   |
| OPS-02   | Chạy lại bộ QA                                                   | Fixtures mới, không phụ thuộc dữ liệu lượt trước                | L   |
| OPS-03   | Auto deploy main trên Cloudflare                                 | Có bằng chứng lượt deploy trước; không trigger lại trong QA này | T   |
| OPS-04   | 500→1.000 người đọc/mua/vote                                     | Môi trường riêng, workload đã chốt, p95/p99/error/quota         | T   |
| OPS-05   | Backup/restore, email thật, CAPTCHA thật, cảnh báo chi phí       | Nghiệm thu staging và vận hành riêng                            | T   |

## Đối chiếu test tự động

Danh sách khai báo test đầy đủ trong `qa-automated-inventory.json` (file, dòng,
tên test). Đây là inventory source, không phải số lượt test thực thi; E2E được
nhân desktop/mobile và một số tests chứa nhiều assertion. Kết quả thực thi nằm
trong `output/full-qa/<run>/summary.json`, `vitest.json` và log từng bước.

Các nhóm chính:

- `tests/db/program-http.test.ts`: public API, draft/publication, ảnh, quyền và throttle.
- `tests/db/browser-journey.test.ts`: browser → Hono → DB/memory media, retry, vote, admin.
- `tests/db/official-program.test.ts`: quota 100/700, rollover, lịch, rollback.
- `tests/db/purchase-http.test.ts`, `purchases.test.ts`: Hoàn tất, sở hữu, ảnh, Sheet edits.
- `tests/db/database.test.ts`, `charm2027.test.ts`, `admin-settings*.test.ts`: hồ sơ/vote/quyền.
- `tests/e2e/*`: giao diện desktop/mobile, form, auth callback mô phỏng, ảnh và accessibility.
- `tests/unit/google-sheets-script.test.ts`: Apps Script chạy bằng adapter local.
- `tests/db/native-purchases.test.ts`: nhiều kết nối thực, không được runner mặc định kích hoạt.

Không ghi “đã test hết cloud” khi chỉ có test local. R2 chưa được kích hoạt,
Google Sheets chưa active; các hàng T vẫn cần môi trường/dịch vụ tương ứng.
