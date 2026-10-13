# Kế hoạch triển khai phần việc người thứ hai

Ngày đối chiếu: 13/10/2026. Lượt đầu thực hiện giai đoạn 01; người dùng sau đó yêu cầu tiếp tục giai đoạn 02 và chốt bảo toàn phiếu legacy. Nhật ký giai đoạn 01 bên dưới giữ bằng chứng tại thời điểm khảo sát; kết quả giai đoạn 02 ở mục 9.

**Trạng thái: hoàn tất giai đoạn 01 ngày 13/10/2026.** Nghiệp vụ và contract đã được người dùng xác nhận; bảng Word đã đánh X ô 01, tổng 1/12, tiếp theo 02. Bằng chứng kiểm tra ở mục 7. Phương án kỹ thuật ở giai đoạn sau vẫn là đề xuất triển khai, không phải chức năng đã hoạt động. Không bắt đầu giai đoạn 02 trong lượt này.

**Trạng thái hiện tại: hoàn tất 02/12, tiếp theo 03.** Giai đoạn 02 đã có migration, rollback và kiểm thử schema local; Word đã đánh X ô 02. Chưa triển khai các API/UI thuộc giai đoạn 03–12. Bằng chứng ở mục 9.

## 1. Baseline và bằng chứng khảo sát

- Workspace `D:\WED_sk_FTU`, nhánh `main`, HEAD `8d57978f7c28962125794be2e912bde0d79c792b`. Remote `origin` trỏ đến repository Web_Su_Kien_FTU được giao.
- Git có thay đổi sẵn: `.gitignore`, `AGENTS.md`; các mục chưa theo dõi: `skill/`, `tools/`, `tiến độn.docx`. Giữ nguyên các thay đổi này; không pull/reset/clean, commit, push hoặc xóa file.
- `git log` có hai commit `88360e0` và `8d57978`. `git ls-tree HEAD` xác nhận Auth middleware, UI, shared schemas, outbox và ba migration đã nằm trong commit hiện tại. Đây là kiểm tra repository local; không xác nhận tình trạng nhánh GitHub mới nhất hay sự đồng ý của thành viên khác.
- Đã đọc `AGENTS.md`, toàn bộ văn bản và bảng theo dõi trong `tiến độn.docx`, `skill/Nhiemvu.md`, README, tài liệu `docs/`, manifests, lockfile, cấu hình Worker, code frontend/backend liên quan và ba migration.
- Khi bắt đầu, bảng Word ghi **0/12 hoàn tất; giai đoạn tiếp theo 01**, ô 01 trống. Chỉ sau khi người dùng xác nhận các quyết định và kiểm tra tài liệu mới cập nhật ô 01, tổng 1/12 và tiếp theo 02; bằng chứng cuối tại mục 7.
- Stack từ `package.json` và `package-lock.json`: npm workspaces; React 19.3.0, Vite 8.3.4, TypeScript 6.0.3, Tailwind 4.3.3, Radix và `packages/ui`; Hono 4.13.13 trên Workers; supabase-js 2.117.3; Zod 4.6.7; TanStack Query 5.104.2; Vitest 5.0.4, Playwright 1.64.0. Giữ nguyên stack và phiên bản. Không có Prisma/Next.js trong manifests đã đọc.
- Các thư mục `features/*` và `modules/*` trong nhiệm vụ là phạm vi tổ chức dự kiến; code hiện đặt chủ yếu trong `pages/*.tsx`, `apps/api/src/index.ts`, `packages/shared/src/index.ts`. Chưa di chuyển hoặc tách code.
- `node_modules` chưa có tại lần khảo sát. Không cài dependencies trong lượt tài liệu này. Các scripts lint/typecheck/test/build/E2E/database/load có trong manifest; chưa chạy lại chúng.
- Không cần đọc `skill/database.md`; không kết nối database từ xa hay dùng credentials. Trạng thái remote trong README/verification là báo cáo cũ, không phải kiểm chứng mới trong lượt này.

## 2. Phạm vi được giao và sở hữu module

Người thứ hai phụ trách bán vé bán kết/chung kết, tồn kho và ghế, orders/checkout, adapter thanh toán, webhook/đối soát, vé QR/email, check-in, vote, dashboard bán vé và vận hành API tương ứng. Người thứ nhất phụ trách trang chính, đăng ký/xét duyệt thí sinh, CMS, mùa/vòng thi và danh sách thí sinh qua vòng. Không làm Auth hoặc database user riêng.

| Phần                                                                                                    | Sở hữu theo nhiệm vụ             | Điểm phối hợp và giới hạn                                                                                                          |
| ------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `features/tickets`, `checkout`, `checkin`, `voting`, `admin-sales`                                      | Người thứ hai                    | Tái sử dụng UI; thêm route qua App/Admin/Account cần review tích hợp                                                               |
| `modules/orders`, `payments`, `tickets`, `checkin`, `voting`                                            | Người thứ hai                    | Đăng ký route trong Hono chung; không thay cơ chế auth cho toàn app                                                                |
| `contest_editions`, `profiles`, `roles`, `user_roles`, `contestants`, `contest_rounds`, `round_entries` | Nền tảng người thứ nhất          | Chỉ đọc theo contract; bổ sung schema/quyền phải có proposal được chấp thuận                                                       |
| `tickets`, `votes`, `issue_ticket`, `check_in`, `cast_vote`, `open_voting` hiện hữu                     | Code đã có trong phần dùng chung | Người dùng cho phép người thứ hai đề xuất mở rộng theo contract; không cần người thứ nhất duyệt thêm; bảo toàn dữ liệu và tích hợp |
| Auth/RBAC, shared Zod/types, UI, API error, notifications/outbox/audit                                  | Dùng chung                       | Giữ một nguồn sự thật; xác nhận người duyệt và cách tương thích trước thay đổi                                                     |
| Events, categories/inventory, orders/payments/reservations, checkins, dữ liệu phiên vote mới            | Người thứ hai đề xuất            | Chỉ là mô hình contract ở giai đoạn 01; migration thuộc giai đoạn 02                                                               |

Đường dẫn cụ thể đã kiểm tra: `apps/api/src/security.ts`, `apps/api/src/outbox.ts`, `packages/ui/src/index.tsx`, `packages/shared/src/index.ts`, `apps/web/src/lib/auth.tsx`, `apps/web/src/lib/api.ts`, `apps/web/src/App.tsx`. Quyền mở rộng dùng chung theo xác nhận D14; không mở rộng sang CMS/đăng ký/quản lý thí sinh hoặc tự triển khai ngoài giai đoạn được yêu cầu.

## 3. Hiện trạng và các khoảng trống

| Chức năng        | Hiện trạng đọc được từ source                                                                            | Còn thiếu hoặc cần thống nhất                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Auth và quản trị | JWT JWKS ES256/RS256, getUser và email_confirmed_at; role từ DB, quản trị cần MFA aal2                   | Tái sử dụng; xác nhận chính sách thu hồi phiên và các quyền nghiệp vụ mới               |
| `/ve`            | Trang thông tin hai đêm, lịch/giá chưa công bố                                                           | API events/hạng vé, tồn kho, sơ đồ ghế và trạng thái bán thực                           |
| Orders/checkout  | Không có route/module hoặc bảng tương ứng trong code đã đọc                                              | Giá server, snapshot, hold TTL, idempotency, expiry và cancellation                     |
| Thanh toán       | Không có PaymentProvider/payment webhook trong Hono                                                      | SePay Test mode trước; khả năng thay provider; xác thực và đối soát                     |
| Vé               | `POST /api/admin/tickets` cấp thủ công; `/api/me/tickets` đọc vé owner                                   | Liên kết order/event/category, phát hành từ payment hợp lệ, QR, tải và email            |
| Check-in         | `POST /api/admin/checkin`, hash token, RPC khóa row và ghi audit; UI nhập mã                             | Camera, chọn sự kiện, từ chối sai sự kiện, thống kê; bảng checkins chưa có              |
| Vote             | `/api/voting/:id`, `/api/votes`, `/api/me/votes`; final round; eligible contestant; vé owner đã check-in | Chốt giới hạn phiếu/check-in/hạng mục; session/results/snapshot/incident APIs           |
| Email            | Outbox chung có dedupe, claim/lease, retry và Resend idempotency                                         | Template vé/QR và delivery contract; chưa có template vé hoàn chỉnh                     |
| Admin            | Quản trị vòng/vote, cấp vé/check-in thủ công, overview                                                   | Đơn, payment, đối soát, tồn kho, kết quả vote có phân quyền                             |
| Tests và tải     | Có unit/E2E/PGlite; script tải là 400 GET localhost                                                      | Chưa có k6 cho luồng mua/vote và nhiều DB connections; không chứng minh 500–1.000 users |

Nguồn chính: `apps/api/src/index.ts`, `security.ts`, `outbox.ts`; `apps/web/src/pages/PublicPages.tsx`, `Voting.tsx`, `Admin.tsx`, `Account.tsx`; `packages/shared/src/index.ts`; ba file `supabase/migrations/20261013000{1,2,3}_*.sql`; `tests/db/database.test.ts`; `tests/load/local-load.mjs`.

Các điểm mâu thuẫn/ảnh hưởng đã xác định:

1. Nhiệm vụ ghi một tài khoản xác minh/mỗi hạng mục; code và tài liệu người thứ nhất dùng một vé đã check-in/mỗi vòng. Contract cuối đã chốt: một phiếu mỗi vé mỗi hạng mục của đúng vòng, không cần check-in, giữ Auth xác minh email. Code cũ vẫn giữ nguyên trong giai đoạn 01; thay đổi đồng bộ ở các giai đoạn triển khai tương ứng.
2. `docs/implementation-plan-person-1.md` ghi quyết định cũ “1 phiếu/vé đã check-in/lượt 10 phút”. Giữ nguyên tài liệu lịch sử đó; quyết định mới của người dùng trong D02/D12 thay thế quy tắc vote cho phần người thứ hai.
3. Nhiệm vụ ưu tiên payOS, nhưng người dùng xác nhận SePay Test mode trước. Provider production vẫn chưa chốt; giữ interface thay được. `tools/sepay-sandbox` là Python/SQLite độc lập, không phải adapter trong Hono/Postgres và không phải bằng chứng tích hợp website.
4. Nhiệm vụ mặc định theo hạng, ghế tùy chọn; người dùng nay yêu cầu 2 hạng và chọn ghế như rạp chiếu phim, tối đa 10 vé/lần mua. `tickets` cũ bắt buộc `seat_label`, unique theo vòng, chưa có event/seat/order. Đã chốt mỗi event gắn một vòng, ghế unique theo event; sơ đồ/sức chứa cấu hình trước test/mở bán.
5. `open_voting` hiện mở cố định 10 phút; `admin_save` vẫn có trường thời gian và chặn đổi khi đã có phiếu. Contract mới dùng quản trị phiên riêng, không hai module thay cùng cửa sổ; mở lại trước finalize theo SUPER_ADMIN duyệt, giữ phiếu/quota cũ; finalize rồi không mở lại.
6. Mục tiêu mới là 500–1.000 đồng thời. AGENTS mô tả 2.000–3.000 và nhiệm vụ có 200–300 mua/400 vote/burst 600–800; chưa có workload mới, không dùng số liệu cũ để kết luận đạt.

## 4. Sổ quyết định

### 4.1 Đã xác nhận trong chat ngày 13/10/2026

| Mã  | Quyết định                                                                                              | Giới hạn xác nhận                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| D01 | Mỗi lượt chỉ thực hiện một giai đoạn và dừng                                                            | Lượt đầu 01; người dùng đã yêu cầu tiếp tục 02; không tự bắt đầu 03                                                 |
| D02 | Phải có vé đúng vòng, không bắt buộc check-in; có hạng mục                                              | Không dùng quota theo tài khoản; quota cuối ở D12                                                                   |
| D03 | SePay Test mode để thử luồng trước, có thể thay payOS/provider khác                                     | Chưa chọn production; không chạy giao dịch sandbox trong lượt 01                                                    |
| D04 | Có 2 hạng ghế, cho chọn ghế đánh số                                                                     | Tên hạng, sơ đồ và sức chứa lấy từ cấu hình; mỗi event gắn một vòng theo D16                                        |
| D05 | Giá demo 100.000 VND mỗi vé, thay đổi được theo cấu hình                                                | Là giá demo mặc định; từng hạng có trường giá riêng, không phải giá bán chính thức                                  |
| D06 | Chưa có mã giảm giá; không chuyển nhượng; chưa có mục hoàn tiền                                         | Không triển khai promo/chuyển nhượng/refund hiện tại; xử lý giao dịch bất thường vẫn cần chốt                       |
| D07 | QR điền sẵn tiền và nội dung đúng đơn                                                                   | QR là chỉ dẫn trả tiền, không bằng chứng đã trả; tiền sai/muộn theo D13                                             |
| D08 | Mục tiêu khoảng 500–1.000 người dùng đồng thời                                                          | Workload/ngưỡng/ngân sách chốt trước giai đoạn đo tải; không phải khả năng đã đạt                                   |
| D09 | Tối đa 10 vé mỗi lần mua                                                                                | Enforce 1–10 ghế distinct/đơn; chưa có giới hạn mua cộng dồn mỗi tài khoản                                          |
| D10 | Giữ ghế mặc định 5 phút, cấu hình được; không gia hạn bằng retry/tải lại                                | Tham khảo FAQ CGV rồi người dùng xác nhận con số trong lần chốt cuối                                                |
| D11 | Hết hạn giữ ghế báo lỗi và yêu cầu đặt ghế lại; kiểm tra đúng tiền vé mới cấp                           | Tiền khớp/đúng đơn/hold còn hiệu lực mới tự cấp; bất thường theo D13                                                |
| D12 | Mỗi vé một phiếu mỗi hạng mục của đúng vòng                                                             | Vé owner/issued/đúng vòng; check-in không phải điều kiện; phiếu không đổi                                           |
| D13 | Tiền thực nhận muộn, sai tiền hoặc trả hai lần vào đối soát, không tự cấp thêm vé                       | Không tự hoàn tiền; giữ history, staff xử lý theo quyền; duplicate cùng transaction không tạo khoản trả lần hai     |
| D14 | Không cần người thứ nhất duyệt thêm proposal dùng chung                                                 | Người dùng chốt contract; người thứ hai mở rộng tickets/votes/API theo scope nhiệm vụ và bảo toàn dữ liệu           |
| D15 | TICKET_STAFF đối soát; CHECKIN_STAFF check-in; VOTE_MANAGER mở/chốt/công bố; SUPER_ADMIN duyệt mở lại   | Staff/admin đều MFA aal2; mở lại chỉ trước finalize, giữ phiếu cũ và không thêm quota; phiên finalized không mở lại |
| D16 | Mỗi event bán vé gắn một vòng; vé thủ công cũ bảo toàn, tính sức chứa và vote như vé mua                | Không xây chức năng vé mời mới; không chuyển nhượng                                                                 |
| D17 | Tên 2 hạng, sơ đồ, số lượng, lịch và hạng mục do admin cấu hình trước test/mở bán; giữ Auth email chung | Không hardcode Top, thời gian sự kiện hoặc dữ liệu demo làm production                                              |
| D18 | Giữ lịch sử phiếu cũ; chặn vote mới của vé có phiếu chưa đối chiếu hạng mục                             | Người dùng xác nhận khi triển khai 02; không tự gán/xóa lịch sử; BTC phân loại có audit trước finalize              |

Các quy tắc tiền nguyên VND, server quyết định giá/trạng thái, kiểm tra quyền, không bán/check-in trùng, QR không chứa PII và tái sử dụng nền tảng lấy từ nhiệm vụ/AGENTS; không ghi chúng thành lời xác nhận mới của BTC.

### 4.2 Câu hỏi đã giải quyết và dữ liệu để cấu hình sau

Q01 đã giải quyết bởi D02/D12/D17; Q02 bởi D04/D16/D17; Q03 bởi D09/D10; Q04 bởi D16; Q05 bởi D11/D13; Q06 bởi D15; Q07 bởi D14; Q08 bởi D08 và xác nhận được chốt workload trước giai đoạn tải. **Không còn câu hỏi nghiệp vụ chặn contract giai đoạn 01.**

Các cấu hình chưa có số liệu, được người dùng xác nhận để điền ở giai đoạn tương ứng:

- Trước test/mở bán: tên 2 hạng, giá từng hạng (mặc định demo 100.000 VND), sơ đồ và sức chứa, ngày/giờ/địa điểm, lịch mở/đóng, danh sách hạng mục vote và eligible contestants.
- Trước đo tải: read/write mix, ramp-up/burst, thời lượng, p95/p99/error thresholds, tài nguyên/pool/locks, môi trường và ngân sách cho mục tiêu 500–1.000.
- Trước triển khai thật: cấu hình provider/environment, email/storage, chính sách retention/ẩn danh, monitoring và quy trình xử lý tài chính ngoài chức năng refund. Không chạy hoặc thay các cấu hình này trong lượt 01.

Không có giới hạn mua cộng dồn mỗi tài khoản được yêu cầu. Contract hiện giới hạn 10 vé/đơn; rate limit/anti-hoarding là biện pháp kỹ thuật, không tự thêm quota mua mới. Có thay đổi chính sách phải hỏi người dùng.

Đã tra FAQ công khai CGV: nguồn search chính thức nêu giữ ghế 5 phút tới khi hoàn tất giao dịch. Người dùng đã chốt `hold_ttl_seconds = 300` mặc định cấu hình, tính từ lúc order/hold được tạo thành công; tải lại hoặc tạo lại QR không kéo dài hạn. Trang đầy đủ bị timeout khi mở trực tiếp; căn cứ tham khảo là nội dung FAQ chính thức trả về qua search, không phải kiểm tra luồng booking thực tế.

## 5. Contract dùng chung đề xuất

### 5.1 Auth và trust boundary

- Giữ `Authorization: Bearer <Supabase access JWT>`, xác minh bằng middleware hiện tại; không nhận caller user_id/role từ body. Quyền staff lấy từ `user_roles`, MFA aal2. Owner orders/tickets lấy từ principal; tài nguyên người khác không được đọc hoặc thao tác.
- Public chỉ đọc nội dung published và dữ liệu bán vé không nhạy cảm. Private read/write qua Worker có kiểm tra quyền; policy/grants DB phải tương ứng. Service secret không ra client; service call không tự chứng minh quyền owner.
- Route mới `/api/orders/*`, `/api/payments/create`, `/api/payments/:orderId/status`, `/api/tickets/*`, private voting phải đăng ký auth rõ ràng: danh sách middleware hiện tại chưa bao phủ chúng.
- **Webhook có boundary riêng:** hiện middleware `/api/*` đòi đúng Origin ở mọi mutation, nên provider có thể bị chặn. Đề xuất chỉ nhánh webhook được miễn kiểm tra Origin/Bearer dành cho trình duyệt, thay bằng xác thực provider trên raw payload; không miễn chung cho API khác. Vẫn giới hạn body, phân biệt môi trường, rate policy riêng và fail closed khi thiếu cấu hình.
- Dùng quyền đã chốt D15: `TICKET_STAFF` bán vé/đối soát, `CHECKIN_STAFF` check-in, `VOTE_MANAGER` mở/chốt/công bố vote, `SUPER_ADMIN` quản trị quyền và duyệt mở lại trước finalize. Không có quyền refund trong scope này. Request luôn có event/session scope rõ và kiểm tra quyền server.

### 5.2 Format, thời gian và retry

- Giữ success `{ data: ... }`, lỗi `{ error: message }` và status hiện hữu. `/api/health` hiện là ngoại lệ trả trực tiếp status/time/mode. Đề xuất thêm `code` lỗi theo cách bổ sung, chỉ sau review shared client; không thay `error` thành object.
- UUID cho internal IDs; event slug chỉ điều hướng, API chi tiết dùng UUID. Giá/tổng tiền integer VND, không float, không nhận tổng tiền do client quyết định. Timestamp ISO 8601 UTC; UI hiển thị Asia/Saigon.
- Dữ liệu mở bán, checkout và vote trả `server_time`, hạn/cửa sổ tương ứng, no-store. Countdown chỉ hỗ trợ hiển thị; DB clock sau khi chờ khóa quyết định mutation.
- Route tĩnh `/api/voting/active`, `/sessions`, `/categories`, `/eligible-contestants`, `/my-votes` phải được đăng ký trước hoặc tách khỏi `/api/voting/:id` hiện hữu, tránh bị parse thành UUID. Review route mount/order cùng chủ API trước tích hợp.
- Đề xuất list dùng `{ items, next_cursor, server_time }`, scope event/session rõ; giới hạn trang được review trước thực thi. Không đổi `/api/me/tickets` đang trả array nếu chưa thống nhất client; có thể bổ sung fields mà không phá envelope.
- Mutations tạo đơn/payment/resend/admin dùng `Idempotency-Key` UUID với scope caller/operation, hash nội dung nghiệp vụ bỏ CAPTCHA. Cùng key khác payload trả 409; cùng request không giữ ghế/phát hành/gửi thêm lần nữa. Thời hạn lưu key và quota resend cần chốt khi thiết kế vận hành.
- Webhook dùng identity provider + environment + transaction/event ID, độc lập idempotency của client. Callback trùng trả acknowledgment sau khi xác nhận trạng thái đã lưu; lỗi phụ thuộc tạm thời không được báo thành công giả. Format acknowledgment riêng theo provider.
- Status dự kiến: 400/415 input; 401 phiên/chữ ký không hợp lệ; 403 quyền/MFA; 404 tài nguyên; 409 hết hạn/hết ghế/trùng/sai transition; 413 body; 429 giới hạn; 503 cấu hình/phụ thuộc. Không trả payload provider nhạy cảm.

### 5.3 Catalog, orders và payment

| API đề xuất                             | Quyền    | Input và output nghiệp vụ                                                                                                                                   |
| --------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/events[?edition=UUID]`        | Public   | Danh sách published: event/round, tên, slug, giờ/địa điểm, sale window/state, server_time                                                                   |
| `GET /api/events/:id`                   | Public   | Chi tiết published và điều kiện sử dụng; không trả cấu hình provider bí mật                                                                                 |
| `GET /api/events/:id/ticket-categories` | Public   | category id/name, price_vnd, remaining; lượng hiển thị không bảo đảm đặt thành công                                                                         |
| `GET /api/events/:id/seats`             | Public   | Đề xuất bổ sung cho chọn ghế: seat id/row/number/category/state; không lộ holder                                                                            |
| `POST /api/orders`                      | User     | `{ event_id, items: [{ category_id, seat_ids }] }`; số lượng từ seat_ids; server tính giá, giữ toàn bộ hoặc từ chối; trả order/total/expires_at/server_time |
| `GET /api/orders/:id`                   | Owner    | Items và snapshot giá, total_vnd, order/payment/hold state và hạn                                                                                           |
| `POST /api/orders/:id/cancel`           | Owner    | Chỉ transition cho phép; giải phóng hold một lần; không đồng nghĩa refund                                                                                   |
| `POST /api/payments/create`             | Owner    | `{ order_id }`; trả payment id/provider/mode, payment reference, amount_vnd, QR instructions và hạn; không tái giữ hoặc gia hạn ghế ngầm                    |
| `POST /api/payments/sepay/webhook`      | Provider | Raw request xác thực theo cấu hình Test mode; normalized event vào transaction xử lý                                                                        |
| `GET /api/payments/:orderId/status`     | Owner    | Trạng thái lưu server và lý do đối soát đã lọc; polling không xác nhận paid từ redirect                                                                     |

`POST /orders` không nhận user_id, unit price, total, trạng thái paid hoặc seat label thay cho seat identity. Đơn chỉ một event gắn một vòng, tổng 1–10 ghế distinct; mỗi item có ghế đúng category/event; một ghế không được giữ/bán đồng thời cho hai đơn. Hạng vé và ghế là hai tầng liên quan, không hai kho độc lập được trừ hai lần. TTL mặc định 300 giây theo D10; không tự thêm quota mua cộng dồn tài khoản.

**State machine theo D11/D13:** order `PENDING_PAYMENT -> PAID | CANCELLED | EXPIRED`, kèm reconciliation state `CLEAR | REQUIRES_REVIEW` độc lập lifecycle. Reservation `HELD -> CONSUMED | RELEASED`. Payment attempt `PENDING | CONFIRMED | REQUIRES_REVIEW | FAILED` độc lập trạng thái đơn. Đơn đã PAID không bị đưa lùi bởi khoản trả lần hai: khoản mới được ghi đối soát riêng. EXPIRED/CANCELLED không tự hồi sinh từ tiền muộn. Không có transition refund trong phạm vi hiện tại.

Tạo order + hold + snapshot trong transaction ngắn; gọi provider ngoài transaction. Nếu provider timeout, lookup/retry cùng attempt/reference trước tạo mới, vẫn giữ hạn gốc. Release/cancel/webhook khóa cùng order/hold theo thứ tự thống nhất, kiểm tra DB clock sau khóa để không vừa giải phóng vừa cấp vé. Hết hạn trả lỗi `ORDER_EXPIRED` hoặc `HOLD_EXPIRED` và yêu cầu tạo đơn/chọn ghế lại; không tự nối dài hoặc xác nhận đơn cũ. Giá demo D05 là dữ liệu cấu hình, không hardcode trong logic tính tiền.

PaymentProvider proposal gồm capability/mode, `createPaymentInstructions`, `verifyWebhook`, `normalizeEvent`, `getPaymentStatus`, `cancelPayment` nếu provider hỗ trợ. SePay chuyển khoản không bắt buộc có khái niệm checkout session/refund như provider khác. Adapter trả dữ liệu chuẩn: provider/mode, transaction identity, reference, tiền nhận/tiền tệ, hướng tiền, tài khoản thụ hưởng đã đối chiếu và thời gian. Provider không hỗ trợ field/capability phải được thể hiện rõ, không giả dữ liệu. payOS hoặc provider khác chỉ triển khai sau khi được chọn và đối chiếu docs riêng.

QR nhận tiền điền sẵn tổng do server tính và reference duy nhất theo order/payment, không PII. Test mode sử dụng tài khoản giả lập và mô phỏng chuyển khoản của SePay. Tài liệu SePay xác nhận màn mô phỏng vẫn cho sửa số tiền/nội dung: QR không ngăn thiếu/thừa tiền. Do đó kiểm tra tiền thực nhận, reference, tài khoản thụ hưởng, môi trường, hướng tiền và xác thực webhook là bắt buộc.

| Tình huống                                 | Xử lý theo contract đã chốt                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| Hợp lệ, tiền khớp, đúng đơn, hold còn hạn  | Confirm payment + PAID + consume hold + issue đúng số vé + outbox nguyên tử |
| Event/giao dịch trùng                      | Không cộng tiền/cấp vé lại; đọc kết quả đã lưu                              |
| Sai chữ ký/môi trường/hướng tiền/tài khoản | Từ chối tự xác nhận; không phát hành vé                                     |
| Thiếu/thừa hoặc reference không xác định   | Ghi sự kiện hợp lệ vào đối soát; không tự cộng dồn/đổi tổng                 |
| Tiền muộn, hold đã release hoặc ghế đã bán | Đối soát; không tự lấy ghế khác hoặc bán vượt sức chứa                      |
| Trả hai giao dịch cho đơn PAID             | Giữ vé đã cấp; giao dịch mới đối soát, không cấp thêm                       |
| Callback lệch thứ tự                       | Dựa state/identity server; không hạ PAID do callback cũ                     |
| Email lỗi                                  | Vé/payment đã commit còn nguyên; outbox retry độc lập                       |

Không có UI hoàn tiền chưa phải là quyết định bỏ qua tiền dư/muộn. Các khoản đó phải giữ record và quy trình người có quyền xử lý; không tự hứa hoàn tiền, xóa record hoặc gán PAID để tránh đối soát.

### 5.4 Vé và check-in

| API                                          | Quyền                | Contract đề xuất                                                                            |
| -------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------- |
| `GET /api/me/tickets`                        | Owner                | Giữ endpoint chung; bổ sung event/category/seat/order khi duyệt compatibility               |
| `GET /api/tickets/:id`                       | Owner                | Chi tiết tối thiểu của vé, event, trạng thái; không trả hash                                |
| `GET /api/tickets/:id/qr`                    | Owner                | QR riêng của vé hợp lệ, private no-store                                                    |
| `POST /api/tickets/:id/resend`               | Owner                | Rate limit/idempotency; tạo job outbox, không phát hành lại vé                              |
| `POST /api/admin/checkin`                    | CHECKIN_STAFF + aal2 | Proposal `{ event_id, token }`; xác thực đúng event + token hash + issued, chuyển nguyên tử |
| `GET /api/admin/checkin/stats?event_id=UUID` | CHECKIN_STAFF + aal2 | Aggregate đúng scope, không lộ PII ngoài nhu cầu                                            |

Kết quả check-in phân biệt `checked_in`, `already_checked_in`, `wrong_event`, `invalid_ticket`; request timeout hiển thị chưa biết kết quả và truy vấn/retry an toàn, không coi lỗi mạng là vé chưa dùng. Hai máy chỉ một transition thành công. Không chấp nhận offline độc lập trong proposal; quy trình ngoại lệ cần BTC duyệt.

**Token QR cần review:** database hiện chỉ giữ hash và API cấp vé trả raw token một lần. Không thể suy ra token từ hash để tải/email lại. Proposal dùng dữ liệu token được mã hóa ở server/storage riêng hoặc cơ chế sinh token có thể tái tạo được review bảo mật; không chọn giải pháp trước khi thống nhất với chủ nền tảng. Không xoay token tự động khi resend vì có thể làm QR đã gửi mất hiệu lực. Không lưu raw token trong log, audit, idempotency result công khai hoặc payload outbox không được bảo vệ. Hash dùng để xác minh; check-in không tin ID vé đơn thuần.

### 5.5 Vote có vé đúng vòng

Giữ baseline `/api/voting/:id`, `/api/votes`, `/api/me/votes` trong source trong lượt này; không thực hiện chỉnh code ở giai đoạn 01. Code hiện dùng `{ round_id, ticket_id, contestant_id, turnstile_token }` và unique `(round_id, ticket_id)`, còn bắt buộc check-in. Contract mới theo D02/D12 bỏ điều kiện check-in, giữ vé owner/issued/đúng vòng và một phiếu/vé/hạng mục; thí sinh eligible/published cùng mùa; không đổi phiếu, retry cùng lựa chọn trả cùng ID. Shared schema/UI/RPC/error/tests cần sửa đồng bộ khi triển khai giai đoạn tương ứng.

Contract API mở rộng theo nhiệm vụ và quyết định đã chốt; schema/migrations triển khai ở giai đoạn 02:

| API đề xuất                                                           | Quyền                           | Nội dung                                                                                                                                     |
| --------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/voting/sessions`, `/active`                                 | Public                          | Phiên published của edition/round, server_time, window/state; không lộ kết quả chưa công bố                                                  |
| `GET /api/voting/categories`, `/eligible-contestants`                 | Public                          | Scope session/category cụ thể; danh sách từ round_entries, category theo cấu hình                                                            |
| `POST /api/voting/votes`                                              | User                            | `{ session_id, ticket_id, category_id, contestant_id, turnstile_token }`; round lấy từ session, vé cùng round; không cần check-in; quota D12 |
| `GET /api/voting/my-votes`                                            | Owner                           | Phiếu caller, không đọc danh tính cử tri khác                                                                                                |
| `GET /api/admin/voting/results`                                       | VOTE_MANAGER/SUPER_ADMIN + aal2 | Aggregate đúng session/category, không dùng counter UI                                                                                       |
| `POST /api/admin/voting/sessions`, `PATCH /:id`, `POST /:id/finalize` | VOTE_MANAGER/SUPER_ADMIN + aal2 | Cửa sổ theo server, freeze eligibility, snapshot/audit; không sửa phiếu đã gửi                                                               |

Quota đã xác nhận một phiếu/vé/hạng mục của vòng. Category có identity thuộc vòng; unique vote theo `(round_id, ticket_id, category_id)` hoặc `(ticket_id, category_id)` khi FK category/ticket bảo đảm cùng round. Không đưa session vào quota theo cách tạo lại quyền khi mở lại: window/session chỉ điều khiển thời gian, không cấp lượt mới. Category/eligible list được freeze từ khi mở phiên. Không tạo lại category ID để lách quota.

Thời gian phiên mặc định 10 phút theo nhiệm vụ, cấu hình từ quản trị; DB clock quyết định `[open_at, close_at)` sau khi chờ khóa. Request nhận trước giờ đóng nhưng xử lý sau không tạo phiếu mới; retry phiếu đã commit có thể trả kết quả cũ sau giờ đóng, không tính phiếu mới. SUPER_ADMIN duyệt mở lại chỉ trước finalize: audit lý do/window mới, giữ toàn bộ phiếu cũ và quota. Finalized thì khóa vĩnh viễn phiên; publish kết quả snapshot theo VOTE_MANAGER/SUPER_ADMIN, không công bố số liệu chưa được duyệt. Chốt eligible từ round_entries, không hardcode Top.

Lifecycle phiên: `DRAFT -> SCHEDULED/OPEN -> CLOSED -> FINALIZED`; trước OPEN có thể sửa cấu hình; từ OPEN freeze category/eligible. `CLOSED -> OPEN` chỉ khi SUPER_ADMIN duyệt, không xóa phiếu. Công bố snapshot là trạng thái riêng sau FINALIZED. API bổ sung dự kiến `POST /api/admin/voting/sessions/:id/reopen` và `POST /api/admin/voting/sessions/:id/publish-results`, kèm idempotency/audit/aal2; không mở lại bằng PATCH thời gian chung.

## 6. Contract dữ liệu ở mức proposal

Chỉ mô tả quan hệ và invariants, chưa có SQL/migration hoặc sửa schema. Người dùng cho phép proposal bảng/API chung theo D14; mọi migration vẫn cần review, kế hoạch bảo toàn dữ liệu và thực thi ở môi trường được phép trong giai đoạn được yêu cầu; không chỉnh lịch sử migration đã áp.

| Nhóm dữ liệu                                                              | Quan hệ/trường nghiệp vụ cần có                                                                    | Ràng buộc cần kiểm chứng ở giai đoạn 02                                                            |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| events                                                                    | edition, round, slug, sale window, starts_at, venue, published                                     | Mỗi event gắn một round, scope mùa/vòng nhất quán, cửa sổ hợp lệ                                   |
| ticket_categories, ticket_inventory                                       | event, tên hạng, price_vnd, capacity/held/sold                                                     | Tiền nguyên không âm, capacity khớp ghế; không hai nguồn tồn kho lệch                              |
| event_seats, seat_holds                                                   | event/category, row/number/label, order, expires_at, state                                         | Unique ghế/event, chỉ một hold hữu hiệu; consume/release một lần                                   |
| orders, order_items, order_reservations                                   | owner, event, items/seats, snapshot giá, total, expiry, state                                      | FK đúng event/category/seat; quantity dương, tổng server; không vượt capacity                      |
| payments, payment_events                                                  | order, provider/mode, reference, transaction/event identity, expected/received amount, xử lý/lý do | Unique reference và transaction theo provider/mode; event replay không xử lý hai lần               |
| tickets hiện hữu, checkins                                                | owner, order item, event/category/seat, nguồn phát hành, token hash, status, check-in actor/time   | Một vé/ghế đã mua; payment hợp lệ hoặc vé thủ công legacy có capacity; check-in một lần đúng event |
| vote_sessions, vote_categories, vote_eligible_contestants, votes hiện hữu | edition/round/session, ticket/user/candidate/category                                              | FK cùng mùa/vòng; unique vé-hạng mục-vòng, phiếu bất biến, cửa sổ server; reopen không thêm quota  |
| vote_result_snapshots, vote_incident_logs                                 | scope, finalized/published, actor, thời gian, lý do                                                | Snapshot truy xuất được, audit thay đổi quyền/thời gian; không lộ PII                              |
| outbox, notifications, audit, api_idempotency                             | Tái sử dụng bảng/function chung                                                                    | Dedupe business, retry có lease, kiểm tra quyền server, không lưu secrets                          |

Không tạo promo_codes/promo_redemptions trong scope hiện tại D06; nếu nhiệm vụ giai đoạn 02 trong Word vẫn liệt kê chúng thì cần người dùng duyệt cập nhật scope, không tự dựng chức năng giảm giá. Refund chưa triển khai; payment history/đối soát vẫn phải lưu. Không thêm chuyển nhượng/đổi owner.

Các proposal tích hợp bắt buộc:

- `tickets` cũ có `round_id`, `seat_label NOT NULL`, unique `(round_id, seat_label)`, status issued/void; việc thêm event/order/category và nguồn vé phải bảo toàn dữ liệu cũ. Vé thủ công legacy phải mapping event/seat, tính vào capacity; không phát hành thêm bằng endpoint cũ vượt tồn kho. Dữ liệu legacy không đủ mapping phải được báo để xử lý trước mở bán, không tự xóa hoặc bịa order/payment.
- `votes` cũ bắt buộc ticket và unique theo vòng/vé. Không tạo bảng cùng tên lần nữa. Giữ ID/lịch sử, lên phương án mapping phiên/hạng mục nếu cần và tương thích API/UI cũ.
- `check_in` cũ không nhận event; proposal bổ sung phải bảo vệ caller cũ và ngăn sai sự kiện, không để hai RPC có quy tắc khác nhau cùng hoạt động.
- `audit_logs.actor_id` hiện bắt buộc auth user; callback/cron không phải người dùng. Cần thống nhất audit hệ thống hoặc dùng payment_events/internal audit riêng, không bịa UUID người dùng để lấp field.
- `emailTemplate` hiện phục vụ hồ sơ; bổ sung template vé qua cùng dispatcher, không làm mất email đăng ký. Token delivery cần bảo vệ riêng như mục QR.
- Dữ liệu giao dịch/vote không được mất do xóa tài khoản hay rollback. Chính sách retention, ẩn danh và FK khi xóa user cần nền tảng/BTC review trước migration dùng chung.
- Bảng exposed phải có RLS và grants phù hợp, user không direct write payments/holds/votes; RPC privileged chỉ Worker có quyền execute và phải kiểm tra actor/ownership. Test cả allow/deny ở vai trò thực. Tài liệu Supabase nhấn mạnh phải xét cả grants và RLS, không suy luận quyền chỉ từ bật RLS.
- Index dựa truy vấn event/category/seat availability, owner order/ticket, expiry, payment identity/reference, aggregate vote theo scope; EXPLAIN và nhiều connection kiểm chứng sau. Không suy ra throughput từ việc có index/transaction.

## 7. Kiểm tra, bằng chứng và điều kiện nghiệm thu

Trong lượt 01 đã kiểm tra read-only: Git status/branch/HEAD/log/tree/remote; bảng Word; manifests/lockfile/config; routes, schemas, RPC/constraints/grants và các tests hiện có; đối chiếu quyết định người dùng với nhiệm vụ và tài liệu người thứ nhất. Đây là review source, không phải chạy thành công luồng nghiệp vụ.

Kiểm tra tài liệu mới: `git diff --no-index --check -- NUL docs/implementation-plan-person-2.md` không báo lỗi whitespace; Git chỉ cảnh báo chuyển LF sang CRLF khi chạm file. Bản Word đầu vào có SHA-256 `DA54CC15F1FE35665E57DDFA14136012EDD17C787F279D74DAA65854AD9FFF8D`, được giữ nguyên tới khi người dùng chốt nghiệp vụ.

Kiểm tra cập nhật Word đã đạt:

- Giữ bản gốc đối chiếu ngoài repository; chỉ sửa nội dung `word/document.xml`, các ZIP parts khác giữ nguyên bytes. So sánh ngược xác nhận chỉ đổi checked/value hiển thị của `progress-01` và dòng tổng 0 thành 1, tiếp theo 01 thành 02.
- Có đủ 12 checkbox content controls, chỉ `progress-01` checked=1 và hiển thị dấu X trong ô; 02–12 checked=0. Nội dung các giai đoạn khác không thay đổi.
- `render_docx.py` đã thử nhưng lỗi thiếu LibreOffice; runtime manifest Windows xác nhận không có LibreOffice, không dùng LibreOffice hệ thống. Fallback dùng Microsoft Word 16.0 xuất PDF read-only và Poppler/Python bundled tạo PNG.
- Bản trước/sau đều 4 trang. Đã xem cả 4 trang bản sau: ô X/dòng tiến độ đúng, không có lỗi layout mới; so sánh ảnh trang 2–4 trùng hoàn toàn bản trước. File bàn giao có bytes đúng bằng bản đã render/kiểm tra.
- SHA-256 Word cuối: `11BD6F48C8E53879E5E6F11E470087ED474E9AA5D7F35D685532352A60EBBD13`. Git status cuối chỉ thêm tài liệu kế hoạch và cập nhật Word bên cạnh các thay đổi có sẵn; không chỉnh code/schema/config.

`docs/verification.md` là báo cáo trước đó; không nhận các con số 31 unit/14 E2E hoặc PGlite/GET load làm kết quả mới. Chưa chạy lint/typecheck/build/unit/E2E/db/load trong lượt 01 do chỉ thay tài liệu, không đổi source và dependencies chưa cài. Chưa thử Auth/MFA thật, webhook website, email, QR/camera, contention đa connection hay tải 500–1.000. Không có migration, deploy, thay secrets hoặc giao dịch/email được thực hiện.

Các invariants dự kiến kiểm tra ở giai đoạn tương ứng: giữ cùng ghế chỉ một người thành công; expiry và webhook không cấp ghế đã release; retry không giữ/cấp/gửi trùng; fake tiền từ client bị bỏ qua; webhook sai chữ ký/sai environment/sai tiền/muộn/duplicate; hai máy check-in chỉ một thành công; owner/role/MFA đúng; vote quota đúng và không ghi mới sau giờ đóng; email lỗi không mất vé. Các tests này là yêu cầu sau, chưa đánh đạt.

| Điều kiện giai đoạn 01                                               | Trạng thái                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Khảo sát repo, scope người thứ hai, hiện trạng và mâu thuẫn có nguồn | Đã soạn bằng chứng source                                                                  |
| Contract API/data/module ownership để review                         | Đã soạn theo nhiệm vụ; người dùng chốt nghiệp vụ/quyền/phạm vi dùng chung ngày 13/10/2026  |
| Vote eligibility/quota/hạng mục thống nhất                           | D02/D12: vé đúng vòng, không check-in, một phiếu mỗi hạng mục                              |
| SePay Test mode trước và provider thay được                          | D03; xác thực callback và tài liệu provider phải kiểm chứng khi implement                  |
| Mô hình hạng + ghế, giá demo và giới hạn/TTL/vé mời                  | D04–D05, D09–D10, D16–D17: 2 hạng/100.000 demo/10 vé/5 phút/mapping và legacy rõ           |
| Tiền sai/muộn/trùng và người đối soát                                | D11/D13/D15: ghi đối soát, không tự cấp thêm/hoàn tiền; TICKET_STAFF                       |
| Người duyệt shared schema/API và quyền vote                          | D14–D15: người dùng chốt, không cần người thứ nhất duyệt thêm; quyền và reopen/finalize rõ |
| Mục tiêu tải và phạm vi nghiệm thu                                   | D08: 500–1.000; người dùng cho phép chốt workload trước giai đoạn tải, chưa tuyên bố đạt   |
| Không còn giả định nghiệp vụ ngăn thiết kế DB                        | Đã chốt nghiệp vụ; cấu hình/thiết kế kỹ thuật và kiểm thử để đúng giai đoạn                |

Người dùng đã trả lời các blockers và xác nhận “Chốt các điểm trên” ngày 13/10/2026 sau khi review quyền, mapping, legacy, giữ ghế, quota và scope cấu hình/tải. Nghiệm thu giai đoạn 01 là nghiệm thu tài liệu/nghiệp vụ/contract, không phải tests chức năng của các giai đoạn 02–12. Đã cập nhật Word: X ô 01, tổng **1/12**, giai đoạn tiếp theo **02**; giữ các ô và nội dung khác. Không thực hiện giai đoạn 02 khi chưa có yêu cầu tiếp tục.

## 8. Tài liệu tham chiếu

Nguồn local: `AGENTS.md`; `tiến độn.docx`; `skill/Nhiemvu.md`; `README.md`; `docs/api.md`, `implementation-plan-person-1.md`, `design-system.md`, `security.md`, `verification.md`, `deployment.md`, `load-test-plan.md`, `skills-applied.md`; code/migrations/tests nêu trên; `tools/sepay-sandbox/README.md` chỉ để xác định giới hạn công cụ, không chạy receiver/tunnel/test trong lượt này.

Skill đã đọc: documents cho đọc bảng Word; supabase và supabase-postgres-best-practices cùng references RLS/transaction ngắn cho review contract dữ liệu. Không cài skill mới hoặc sao chép skill vào source.

Nguồn chính thức đã đối chiếu ngày 13/10/2026:

- [SePay mô phỏng VietQR Test mode](https://developer.sepay.vn/vi/tien-ich-khac/test-mode/mo-phong-tao-ma-vietqr): hỗ trợ điền sẵn tiền/nội dung; màn mô phỏng vẫn cho chỉnh; QR test dùng tài khoản giả lập.
- [CGV FAQ](https://www.cgv.vn/default/faq/): nội dung search từ FAQ chính thức nêu giữ ghế 5 phút; chọn TTL cấu hình mặc định theo yêu cầu tham khảo rạp phim. Mở trang trực tiếp bị timeout, không khẳng định đã kiểm tra giao diện booking thực tế.
- [SePay xác thực webhook](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc): đối chiếu cơ chế xác thực theo cấu hình, đề xuất HMAC-SHA256; chi tiết implement/test dành cho giai đoạn 05.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): grants quyết định quyền thao tác, policy giới hạn row; cần kiểm tra cả hai.
- [Supabase JWT](https://supabase.com/docs/guides/auth/jwts): tham chiếu boundary token; tiếp tục giữ middleware đã có, không thay API SDK trong lượt này.
- [Supabase thay đổi exposure Data API](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically): review explicit grants khi triển khai, không mặc định bảng mới đã exposed. Đã đọc changelog index bằng HTTP read-only sau khi web parser không hỗ trợ markdown.

Lượt này dừng ở giai đoạn 01 đã chốt nghiệp vụ và contract. Những cấu hình được người dùng cho phép điền sau không được xem là số liệu đã có hoặc khả năng đã kiểm chứng. Chỉ bắt đầu giai đoạn 02 khi có yêu cầu tiếp tục.

## 9. Bàn giao giai đoạn 02

Người dùng đã yêu cầu “tiến hành bước tiếp theo”, xác nhận D18 và sau đó yêu cầu tiếp tục phần đang dở. Phạm vi lượt này chỉ database/migrations. Xem [báo cáo schema, RLS, transaction, preflight và rollback](database-sales-voting.md).

- Thêm migration `20261013122255_ftucharm_sales_voting.sql`: 16 bảng mới, inventory view, mở rộng tickets/votes giữ facts cũ; constraints, indexes, RLS/grants và trigger invariants. Ba migration baseline giữ nguyên; không đổi Auth/CMS/schema thí sinh.
- Không tạo bảng promo theo D06. Có ghế/seat_holds theo D04. Không có provider/network call hoặc seed thật trong migration.
- Rollback riêng chỉ cho rollout rỗng, từ chối khi có dữ liệu mới/mapping; khôi phục unique/RPC/grants cũ và kiểm tra up–down–up. Không xóa lịch sử.
- Harness đọc migrations theo tên; script db:test chạy cả hai suite. `npm test` đạt 69 tests/5 files, gồm 52 DB tests (14 hồi quy + 38 mới). Lint, typecheck, build và secret scan đạt. Không thay manifest/lockfile.
- PGlite local, một connection, auth fixture; chưa kiểm chứng Supabase Auth/Data API thật, webhook SePay, email/camera, race nhiều connection hoặc tải mục tiêu. API/UI contract mới sẽ tích hợp ở các giai đoạn tiếp theo; schema không đồng nghĩa app đã bán vé/vote mới được.

Điều kiện giai đoạn 02 đã đạt: migration local/test thực thi; quyền, ràng buộc, bảo toàn dữ liệu và rollback có bằng chứng. Không có quyết định nghiệp vụ chặn giai đoạn này; cấu hình thực và workload giữ lịch chốt ở giai đoạn tương ứng. Không bắt đầu giai đoạn 03 trong lượt này.

Đã cập nhật `tiến độn.docx` sau khi checks đạt: chỉ ô `progress-02` chuyển checked=1/hiển thị X và dòng tổng chuyển 1/12 thành **2/12**, tiếp theo **03**. Đủ 12 controls, chỉ 01–02 checked; các ZIP parts khác giữ nguyên bytes. Bản trước/sau đều 4 trang, đã xem cả 4 trang sau; ảnh trang 2–4 trùng pixel hoàn toàn bản trước. Render bằng Word 16.0 read-only export và Poppler bundled vì runtime không có LibreOffice. File bàn giao đúng bytes bản đã render. SHA-256 cuối: `50A53470C9AE18EA7D5A7B2403E0B5530DB145B15402AB31F030D988A3CC2B77`. Backup và ảnh QA giữ ngoài repository.
