# DEMO dành cho admin, hai đêm chính thức dành cho khách

Yêu cầu15/10/2026: mua/vote DEMO chỉ hiện sau khi đăng nhập tài khoản quản trị. Các tài khoản khác xem hai đêm chính thức theo lịch2027. Giá và QR thật BTC bổ sung sau.

## Hành vi

- `/ve` mặc định trả danh mục LIVE của mùa `ftucharm-2027`, gồm bán kết25/04 và chung kết23/05; admin cũng thấy danh mục chính thức khi mở trang công khai.
- Hai đợt vé sớm/thường hiển thị trong cùng đêm và cùng hạng. Lịch lấy từ metadata server, hiển thị giờ Việt Nam. Giữ lịch mở sớm bán kết29/03, thường31/03 đến hết24/04; chung kết sớm26/04 09–11h, thường đến hết22/05 theo cấu hình hiện có. Admin có thể sửa theo chức năng cấu hình đã triển khai ở lượt trước.
- Hạng chưa được cấu hình giá hiển thị The Intro/The Bridge/The Chorus với nhãn **Chờ cập nhật giá**. Đây là nhãn giới thiệu, không tạo ID sản phẩm, giá0đ, quota từng hạng hoặc QR giả. Không hiện nút nhận đơn cho danh mục chưa có sản phẩm; server tiếp tục chặn LIVE thiếu QR/cấu hình.
- Admin mở **Mua vé DEMO** hoặc **Thử vote và xem BXH DEMO** từ trang quản trị. Link vote có `demo=1&vong=...`; link sau Hoàn tất DEMO giữ đúng phạm vi này.
- `/binh-chon` mặc định đọc vòng chính thức; không tự chuyển sang một vòng khác nếu `vong` không tồn tại. Khách/tài khoản thường mở `?demo=1` thấy thông báo chỉ dành cho admin.

## Quyền và dữ liệu

API xác minh token/email bằng Auth hiện hữu, sau đó kiểm tra quyền từ database, cùng chính sách vào quản trị: SUPER_ADMIN (MFA tùy chọn), CONTENT_EDITOR với MFA. Không dùng email cố định, `user_metadata` hoặc query của khách làm bằng chứng quyền.

Trong website có cấu hình `PUBLIC_EDITION_SLUG`/`DEMO_TEST_OFFER_SLUG`, chỉ danh mục LIVE chính thức được công khai. Với môi trường thử có `DEMO_TEST_OFFER_SLUG`, catalog DEMO theo slug, vòng DEMO, kết quả DEMO và mọi ghi trong phạm vi thử đều yêu cầu quyền admin. Lịch sử DEMO không trả trong danh sách đơn/vé/phiếu của tài khoản thường; đọc đơn và minh chứng DEMO trực tiếp cũng bị chặn. Ownership và quyền xem minh chứng của nhân sự tiếp tục áp dụng.

Giữ hàng rào **online-test chỉ ghi đợt DEMO được phê duyệt**; thay đổi này không bật ghi LIVE. Khi chuyển sang môi trường mở bán thật, admin dịch vụ phải rà soát cấu hình triển khai và các điều kiện vận hành; không chỉ điền giá/QR rồi suy ra online-test đã thành production. Local entry `demo-test.ts` chỉ bổ sung giới hạn hostname; Auth/phạm vi dùng chung với Worker để không còn ép catalog công khai về DEMO.

Không sửa/xóa đơn, mã vé, phiếu hoặc metadata minh chứng. Google Sheets giữ API/quyền đồng bộ hiện hữu. Không thay trigger, token, bucket, migration hoặc cấu hình Supabase trong lượt này. Preview tĩnh `DEMO_MODE=true` vẫn là bản minh họa có nhãn, không ghi dữ liệu; không phải môi trường online-test có Auth.

## Kiểm chứng và bàn giao

Các bài kiểm tra dùng fixture local và chặn network ngoài. Bộ HTTP kiểm tra khách401/tài khoản thường403/admin200 khi vào DEMO; danh mục công khai có hai LIVE; không ghi ngoài phạm vi; giữ dữ liệu lịch sử, chặn đơn/vé/minh chứng DEMO của tài khoản thường; admin vẫn đọc ảnh và API xuất Sheet. Browser journey kiểm tra admin mua → đổi ảnh → Hoàn tất/retry → đúng vòng vote → xem minh chứng trên desktop/mobile. E2E kiểm tra danh mục chính thức, giá chờ cấu hình, quyền vào DEMO, BXH và Axe.

Kết quả cuối:

- Vitest toàn bộ: **278 đạt,0 lỗi,1 native PostgreSQL bỏ qua**; `output/admin-demo-final.json`. Hai ca HTTP/browser được sửa adapter/fixture theo chính sách admin mới và kiểm tra lại đạt; không tăng timeout hoặc bỏ kiểm tra quyền.
- Playwright Auth/official:30 ca đạt ở lượt toàn bộ; hai ca BXH DEMO được sửa để đi bằng link trong ứng dụng sau OAuth (token được giữ trong memory theo chính sách Auth hiện có), chạy lại đều đạt. Lượt cuối sáu ca liên quan catalog/DEMO desktop/mobile đều đạt. Có kiểm tra Axe và không tràn ngang320/390/1280px.
- Đã xem ảnh desktop/mobile `official-ticket-pending-price.png` trong `test-results-auth`; ba hạng giá chờ cấu hình và lịch hiển thị đúng, không bị tràn ngang.
- TypeScript, ESLint, production build và `git diff --check` đạt. Build còn cảnh báo kích thước chunk Three.js hiện hữu.
- Frontmatter và reference của skill được đối chiếu bằng `js-yaml`; Python `quick_validate.py` chưa chạy được vì runtime thiếu PyYAML. Không thêm dependency vào repository.

Nhánh `codex/admin-demo-official-catalog`; source hiện là local, chưa push/deploy trong lượt yêu cầu này. Không có migration mới; migration giá/lịch và hai migration vote pending từ lượt trước vẫn thuộc phần admin dịch vụ tiếp quản theo `NEXT-STEPS-SHEET-IMAGES.md`. Giữ tiến độ Word11/11 là nghiệm thu local cũ; không đổi thành trạng thái production.
