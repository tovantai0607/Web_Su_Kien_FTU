# Nghiệm thu luồng vé theo bổ sung

Cập nhật 14/10/2026. Mùa và lịch áp dụng **2027**. Phạm vi nghiệm thu 11/11 là local bằng dữ liệu giả/DEMO theo xác nhận của người dùng. Lượt tiếp theo được yêu cầu đồng bộ Supabase: đã áp đủ chín migration, kiểm tra schema/quyền và giữ dữ liệu cũ; xem [báo cáo đồng bộ](supabase-sync-20261014.md). Không tạo fixture hoặc đo tải online. Bản triển khai trên nhánh `codex/supplement-ticket-flow`, dựa trên main `ad30504`; thay đổi tài liệu có sẵn được bảo toàn.

## Quyết định đã xác nhận

- Giữ ngày/tháng trong ảnh bổ sung, đổi năm thành 2027; không suy ra ngày chung kết từ ngày mở vé sớm 26/4.
- Chọn loại/cụm, số lượng và Combo 2/Combo 3; không chọn số ghế. BTC bố trí vé cùng combo gần nhau. Nhãn The Intro/The Bridge/The Chorus được giữ trong mẫu.
- Không giới hạn tổng vé/tài khoản hoặc số vé mỗi đơn; server chỉ chấp nhận lượng vé trong quota còn lại. Giới hạn kích thước payload/file và miền kiểu dữ liệu là giới hạn kỹ thuật, không là hạn 10 vé cũ.
- Ảnh thống kê là minh họa; dữ liệu không có Đêm thì bỏ cột đó, không tự thêm/tính.
- BTC cấu hình giá/quota/combo, lịch mở/đóng và QR. DEMO dùng số giả và không chuyển tiền thật. LIVE thiếu QR/hướng dẫn hoặc ảnh QR không khả dụng thì không giữ vé để thanh toán.
- Giữ quota **30 phút**, thời gian database; retry không kéo dài hạn. Hết hạn phải đặt lại. Sau Hoàn tất không hủy/hoàn/thu hồi quyền vote.
- Bảy thông tin người mua → Tiếp tục xem QR → Tiếp tục gửi minh chứng → Hoàn tất. Upload riêng chưa cấp vé; transaction Hoàn tất lưu thành công mới cấp quyền vote ngay.
- N vé có N phiếu cho **mỗi hạng mục đúng vòng**, không cần check-in, BTC duyệt hoặc email. Hoàn tất không tự xác nhận tiền thực nhận/PAID. Bên khác đối chiếu và gửi vé email thủ công.
- Phiếu cũ không có hạng mục được giữ; vé đó bị chặn vote mới tới khi VOTE_MANAGER đối chiếu/gán hạng mục. Không tự gán hay xóa lịch sử.
- TICKET_STAFF cấu hình/xem dữ liệu mua; VOTE_MANAGER mở/đóng/chốt/công bố; SUPER_ADMIN duyệt mở lại trước chốt, có lý do. Giữ MFA và Auth xác minh email chung.
- Đo tải local 500→1.000 người, hai phút/mức, 70% xem vé, 20% giữ/gửi minh chứng/Hoàn tất, 10% vote; p95<2s, lỗi<1%, không vượt quota/trùng mã/phiếu. Không tải online.

## Sản phẩm và sở hữu

Người thứ hai sở hữu `packages/shared/src/purchases.ts`, API `apps/api/src/purchases.ts`, UI `PurchaseTickets`, `PurchaseRecords`, `PurchaseAdmin`, migration/rollback bổ sung và tests liên quan. Dùng chung Auth, Hono, Supabase, UI primitives, Zod, bảng mùa/vòng/thí sinh/vé/phiếu. Không đổi stack hoặc nâng major. Chỉ thêm dev typings `@types/pg` khớp pg 8.23.1 để kiểm tra TypeScript cho test PostgreSQL native.

Người thứ nhất giữ CMS/đăng ký/mùa/vòng/thí sinh và registration outbox; phần này không được thay lịch tự động. Bên khác nhận dữ liệu sáu cột và gửi email vé thủ công. Code/bảng/API vé chọn ghế, payment và check-in cũ được giữ cho lịch sử, không được dùng làm gate của luồng bổ sung.

`purchase_offers/products/requests/allocations/evidence` là mô hình bổ sung dùng quota, tách khỏi orders/seat/payment cũ để không giả lập PAID hoặc ghế. Vé vẫn nằm trong bảng chung `tickets`, source `SUPPLEMENT`, có purchase/ordinal/code; votes và unique vé/hạng mục dùng chung. Migration giữ dữ liệu cũ; không xóa/convert vé hay phiếu lịch sử.

## Contract thực thi

| API                                                                 | Quyền và hành vi                                                                                                                         |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/api/purchase-catalog?slug=`                                   | Công khai: đợt đã công bố, loại/giá/quota/trạng thái, thời gian server; không PII hoặc proof                                             |
| POST `/api/purchases`                                               | Email xác minh; `Idempotency-Key` UUID; `{offer_id,buyer,lines:[{product_id,bundle_size,quantity}]}`; server tính giá, giữ quota 30 phút |
| GET `/api/purchases/:id`                                            | Chủ đơn; trạng thái/hạn/snapshot, QR và proof đã lưu kể cả chưa Hoàn tất                                                                 |
| POST `/api/purchases/:id/evidence`                                  | Chủ đơn còn hạn; raw JPG/PNG≤5MB, ≤12MP; decode/resize/WebP/xóa metadata; private R2; một proof/đơn                                      |
| POST `/api/purchases/:id/complete`                                  | Chủ đơn; `{evidence_id}` đúng đơn; khóa request/products; ghi COMPLETED và N vé trong một transaction; retry không nhân vé               |
| GET `/api/me/purchases`                                             | 100 đơn gần nhất của chủ tài khoản; UI danh sách Hoàn tất sáu cột                                                                        |
| GET `/api/purchase-evidence/:id`                                    | Chủ ảnh hoặc TICKET_STAFF có MFA; private/no-store, không URL công khai                                                                  |
| GET `/api/admin/purchases?page=`                                    | TICKET_STAFF/MFA; 50 đơn Hoàn tất/trang, đếm tổng; CSV trang hiện tại chống formula injection                                            |
| GET/POST `/api/admin/purchase-offers`                               | TICKET_STAFF/MFA; cấu hình có validation, snapshot giá của đơn cũ giữ nguyên; quota không thấp hơn đã giữ/Hoàn tất                       |
| GET `/api/admin/purchase-statistics`                                | TICKET_STAFF/MFA; tổng và nhóm vòng/loại/tier/Đơn/Combo2/Combo3; tiền theo đơn chưa là thực nhận                                         |
| GET `/api/voting/:round`, POST `/api/votes`                         | Bán kết/chung kết; shared Auth, captcha, owner/issued/round/session/category; bỏ check-in; unique/retry; thời gian database sau khóa     |
| POST `/api/admin/rounds/:id/prepare-categories`, `/open-voting`     | VOTE_MANAGER/MFA; chuẩn bị hạng mục nam/nữ và mở 10 phút; vòng có purchase offer không mở vote legacy thiếu hạng mục                     |
| POST `/api/admin/vote-sessions/:id/{close,reopen,finalize,publish}` | Role/MFA; reopen cần SUPER_ADMIN và lý do; giữ phiếu, không cấp lại lượt; đã FINALIZED không mở lại                                      |
| GET `/api/vote-results/:session`                                    | Chỉ snapshot đã chốt/công bố, mùa/vòng còn công bố; không PII                                                                            |
| GET `/api/admin/legacy-votes`, POST `/:id/classify`                 | VOTE_MANAGER/MFA; gán hạng mục đã đối chiếu, giữ facts của phiếu, không đổi phiếu đã phân loại                                           |

Buyer bắt buộc `name,school,cohort_class,student_id,email,phone,facebook`. Quantity của line là số vé đơn hoặc số combo; ticket quantity = quantity×bundle size. Combo hiện là 2/3 vé cùng loại; giá combo riêng hoặc null để tắt. Giá, tên, tier, số lượng, QR/hướng dẫn là snapshot tại giữ vé. Catalog trả trạng thái UPCOMING/OPEN/SOLD_OUT/CLOSED; hết quota vé sớm thì loại đó không đặt được, vé thường đang mở vẫn bán theo giá BTC cấu hình.

Tồn kho khóa products theo thứ tự ID. Bộ đếm sold chỉ tăng cùng transaction Hoàn tất; truy vấn giữ còn hạn dùng partial index để tránh quét lịch sử đã Hoàn tất. Không giữ transaction trong lúc đọc QR asset hoặc xử lý/lưu ảnh. Cron dọn HELD quá hạn theo batch; kể cả chưa cron, query và Hoàn tất vẫn áp hạn database.

## Bằng chứng nghiệm thu

| Bước | Bằng chứng tương ứng yêu cầu bổ sung                                                                                                           |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 01   | Contract/ownership/quyết định ở tài liệu này và xác nhận trong chat; R01–R14                                                                   |
| 02   | Migration `20261014120000_supplement_purchases.sql`, rollback có guard giữ dữ liệu; RLS/grants, owner/FK/unique và snapshot được test          |
| 03   | `/ve` và chi tiết loại/combo; xem trước giờ bán; quota nguyên tử, 30 phút, >10 vé; không seat UI                                               |
| 04   | Bảy trường và hai bước Tiếp tục; validation server/UI; retry không đổi thời hạn                                                                |
| 05   | Private ảnh WebP, Hoàn tất nguyên tử, audit; upload riêng chưa có vé; lỗi cấp vé rollback trạng thái/quota/vé                                  |
| 06   | Đúng sáu cột Mã vé/Thông tin/Minh chứng/Loại/Số lượng/Combo; owner/private proof và CSV                                                        |
| 07   | N vé đúng vòng/hạng mục; không check-in; vote retry/20 kết nối; quản trị đóng/chốt/công bố/reopen và legacy                                    |
| 08   | Admin đọc danh sách/ảnh và thống kê lấy database; role/MFA; không tự báo tiền thực nhận                                                        |
| 09   | Benchmark native PostgreSQL/Hono local 500→1.000, hai phút/mức; báo cáo JSON ngoài repo, tóm tắt phía dưới                                     |
| 10   | TypeScript/lint/tests/build/bundle; HTTP Origin/auth/owner/private upload/strict JSON/body limits; desktop/mobile, keyboard, automated WCAG AA |
| 11   | [Runbook](supplement-runbook.md), contract và hướng dẫn cấu hình/bàn giao; không yêu cầu tự deploy hoặc gửi email thật                         |

Suite thường có **133 tests đạt**, test native là opt-in và mặc định skipped. Native chạy riêng kiểm tra 20 kết nối tranh quota cuối (một thắng), 20 Hoàn tất cùng đơn (một vé), hoàn tất bị chặn trên khóa tới sau hạn (bị từ chối), 20 vote retry (một phiếu), browser desktop/mobile mua → lỗi lưu → retry → Hoàn tất → vote, và admin sáu cột/private ảnh/thống kê. PGlite có rollback migration sạch/tái áp, guard không rollback khi đã có dữ liệu, và lỗi issuance rollback toàn transaction. **46 E2E** desktop/mobile đạt, gồm tự động WCAG AA và màn 320px. Đây không là kiểm tra thủ công toàn bộ accessibility.

Benchmark dùng **virtual users**, ramp 10 giây trong mỗi mức, think 4 giây giữa hành trình, phát request trong 120 giây rồi drain; pool tối đa 20. Tỷ lệ 70/20/10 tính theo hành trình; hành trình mua có ba HTTP requests nên tỷ lệ request khác tỷ lệ hành trình. Auth/JWKS/captcha là test adapter, Images/R2 là local sharp/map; Hono routes và PostgreSQL transactions là thật. Không gọi Supabase/Cloudflare thật, không tốn ngân sách dịch vụ.

Bản đo trước tối ưu không đạt 1.000 (p95≈15,27s, lỗi≈5,54%); không được dùng làm nghiệm thu. Sau bộ đếm sold/partial index, bản đo đạt 500 p95≈13,40ms/p99≈22,88ms, 1.000 p95≈32,97ms/p99≈67,29ms, lỗi0; zero oversold/duplicate codes/duplicate votes/mismatched tickets. Pool waiting quan sát tối đa 19 ở mức1.000. Bản đo cuối đạt500 p95≈14,48ms/p99≈34,54ms và1.000 p95≈41,26ms/p99≈111,26ms, lỗi0, zero violations và counter mismatch; PostgreSQL deadlocks0, pool waiting quan sát tối đa38. Bản đo cuối và audit theo code bàn giao được ghi trong `docs/supplement-verification.json`.

QA gốc: `C:/Users/dell/.codex/visualizations/2026/10/13/01a13503-80c2-70e3-a689-e33b6f930e6b/supplement-implementation-20261014/`. Không sao chép PII/secret vào báo cáo. Chỉ con số tổng hợp và hash/checks được lưu trong Git.

## Giới hạn trước chạy thật

Nghiệm thu local không chứng minh sức tải online, tốc độ mạng/JWKS thật, CAPTCHA thật, Images/R2 billing hoặc mail vé thủ công. Cần môi trường staging riêng và cho phép migration/deploy/test tích hợp trước việc đó. BTC phải cấu hình giá/quota/QR thật, venue/giờ và ngày chung kết chưa có trong ảnh. Không đổi chính sách tự cấp quyền vote bằng minh chứng; ảnh/Hoàn tất không chứng minh tiền đã đến. Nếu ảnh sai, BTC xử lý nghiệp vụ thủ công theo quyết định không hủy/thu hồi, không tự sửa/xóa dữ liệu/phiếu.

Tài liệu chính thức đã đối chiếu: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [supabase-js RPC](https://supabase.com/docs/reference/javascript/rpc), [changelog PostgreSQL](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes), [Cloudflare Images binding](https://developers.cloudflare.com/images/optimization/binding/). Không dùng ltree, legacy PGP hoặc custom operators trong migration bổ sung.
