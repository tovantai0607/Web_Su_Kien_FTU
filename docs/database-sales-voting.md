# Database bán vé và bình chọn giai đoạn 02

Ngày nghiệm thu: 13/10/2026. Baseline: `8d57978f7c28962125794be2e912bde0d79c792b` trên nhánh `main`. Tài liệu này bàn giao schema, migration, rollback và kiểm thử database local cho phần việc người thứ hai. Chưa tích hợp HTTP/UI bán vé, payment provider hoặc vote theo hạng mục; chưa áp migration lên Supabase từ xa.

## Phạm vi và quyết định áp dụng

Theo [contract đã chốt](implementation-plan-person-2.md), mỗi sự kiện thuộc một vòng thi, có hai hạng và ghế đánh số; mặc định 100.000 VND/vé, giữ 300 giây, tối đa 10 ghế/đơn. Giá và cấu hình thực do admin cung cấp sau. Không có mã giảm giá, chuyển nhượng, chức năng vé mời mới hoặc hoàn tiền trong phạm vi đã xác nhận. Vì vậy không tạo `promo_codes`/`promo_redemptions` dù roadmap Word ban đầu liệt kê chúng.

SePay Test mode là hướng tích hợp đầu tiên; schema phân biệt `provider` và `mode` để thay adapter sau. Một vé hợp lệ của đúng vòng được một phiếu mỗi hạng mục, không cần check-in. Giữ Auth xác minh email và vai trò chung. Người dùng đã cho phép mở rộng `tickets`/`votes` và contract dùng chung, không cần người thứ nhất duyệt thêm.

Quyết định bổ sung D18: giữ nguyên lịch sử vote cũ; vé có phiếu chưa đối chiếu hạng mục bị chặn vote mới đến khi BTC phân loại. Không tự gán hạng mục, phiên hoặc thời gian cho lịch sử.

## Sản phẩm bàn giao

- Migration thứ tư: [20261013122255_ftucharm_sales_voting.sql](../supabase/migrations/20261013122255_ftucharm_sales_voting.sql). Ba migration cũ giữ nguyên.
- Rollback có điều kiện: [20261013122255_ftucharm_sales_voting.sql](../supabase/rollbacks/20261013122255_ftucharm_sales_voting.sql), đặt ngoài thư mục migrations.
- [Kiểm thử schema mới](../tests/db/sales-schema.test.ts) và [kiểm thử hồi quy chung](../tests/db/database.test.ts). Harness đọc toàn bộ migrations theo thứ tự tên; `npm run db:test` chạy cả hai suite database.
- `.gitignore` bổ sung duy nhất dòng cache `/supabase/.temp/` vào các thay đổi có sẵn. Không sửa manifest/lockfile, cấu hình credentials, Auth, CMS, API hoặc giao diện.

## Mô hình dữ liệu

| Nhóm                | Bảng hoặc view                                                                   | Ràng buộc chính                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Cấu hình và tồn kho | `events`, `ticket_categories`, `event_seats`, view `ticket_inventory`            | FK mùa/vòng; hai vị trí hạng; ghế và label unique theo event; tồn kho suy ra từ ghế, holds và vé                  |
| Đặt chỗ             | `orders`, `order_items`, `order_reservations`, `seat_holds`                      | 1–10 ghế distinct; snapshot giá/nhãn; quota reservation khớp items; TTL bất biến; một claim HELD/CONSUMED mỗi ghế |
| Giao dịch           | `payments`, `payment_events`                                                     | Tiền nguyên VND; identity theo provider/mode/transaction; một confirmation/đơn; event đã áp dụng bất biến         |
| Vé                  | Mở rộng `tickets`; `checkins`, `ticket_delivery_secrets`                         | Liên kết event/seat/item cùng scope; issued seat và item unique; một check-in; ciphertext chỉ server đọc          |
| Bình chọn           | `vote_sessions`, `vote_categories`, `vote_eligible_contestants`; mở rộng `votes` | FK đúng vòng; quota vòng/vé/hạng mục; kiểm tra owner, vé issued, candidate và clock sau khi khóa                  |
| Kết quả và sự cố    | `vote_result_snapshots`, `vote_incident_logs`                                    | Snapshot từ tổng phiếu thật, chỉ sau finalize; lịch sử append-only; audit phân loại legacy và mở lại              |

Có 16 bảng mới, một view và helper schema private. Không tạo bảng user hoặc bản sao Auth. Các FK mới mặc định không xóa dây chuyền lịch sử tài chính/vote khi xóa tài khoản. Các quan hệ legacy còn lại giữ nguyên theo baseline; retention/ẩn danh toàn hệ thống phải được review trước khi xây chức năng xóa tài khoản.

`ticket_inventory` dùng `security_invoker`, dành cho server; cần PostgreSQL 15 trở lên khi áp thực tế. Không có counter tồn kho độc lập phải đồng bộ. Vé legacy đã map tính vào sức chứa; consumed hold và vé tương ứng không được đếm hai lần. HELD đã quá thời gian vẫn chiếm ghế cho đến khi server chuyển RELEASED: đây là lựa chọn bảo toàn tồn kho, chưa có job giải phóng trong giai đoạn 02.

## Transaction và trạng thái

Migration có `BEGIN/COMMIT`. Trigger kiểm tra tức thời bảo vệ identity và chuyển trạng thái; constraint trigger deferred kiểm tra tính đầy đủ tại commit. Không thể commit đơn chỉ có một phần items, reservations hoặc holds. Snapshot giá không đổi khi giá hạng đổi sau đặt đơn.

Đơn chuyển từ `PENDING_PAYMENT` sang `PAID`, `CANCELLED` hoặc `EXPIRED`. Không gia hạn TTL, không expire sớm, không phục hồi đơn đã kết thúc. Hold chỉ chuyển từ HELD sang CONSUMED/RELEASED; không chiếm lại cùng bản ghi. Khi PAID, tổng tiền, confirmation, event xác thực, reservations và holds phải khớp. Vé PAID cần item và consumed hold đúng owner/scope.

Tiền sai, đến muộn hoặc transaction thứ hai lưu để đối soát, không tự cấp thêm vé/hoàn tiền. Trùng cùng transaction không được tạo bản ghi xử lý thứ hai; replay count chỉ tăng. Cờ xác thực trong database là kết quả backend cung cấp, không tự xác minh chữ ký. Adapter ở giai đoạn 05 phải xác thực payload, tài khoản thụ hưởng và môi trường trước khi ghi cờ này.

Trigger khóa order trước seat. Các API/job ở giai đoạn tiếp phải thống nhất thứ tự khóa: order, rồi seat UUID tăng dần; đọc lại clock/trạng thái sau khi chờ khóa. Payment/expiry cạnh tranh trên cùng order. Không giữ transaction trong lúc gọi provider. Các test hiện tại xác minh ràng buộc trên một connection; chưa chứng minh deadlock, contention hoặc race nhiều connection.

Phiên vote mở/chốt theo VOTE_MANAGER; người thực hiện mở lại phải chính là SUPER_ADMIN được ghi trong `updated_by` và `reopen_approved_by`, có lý do. Không chỉ gửi UUID của admin khác để xin mở lại. Phiên đã finalize không mở lại; reopen giữ phiếu và quota. Hạng mục, eligibility và round entries khóa chỉnh sửa từ lần mở đầu tiên. Backend phải lấy actor từ principal đã xác minh và kiểm tra MFA `aal2`; không tin actor do client gửi.

## Dữ liệu cũ và tương thích

Migration không tạo seed event, payment hoặc phiên giả. Vé cũ giữ ID/owner/seat label/status/QR hash/check-in và được đánh nguồn LEGACY, mapping mới để trống. Phiếu cũ giữ mọi facts và mang format LEGACY. Test seed dữ liệu trước migration thứ tư rồi đối chiếu sau khi áp.

Trước publish event, phải map toàn bộ vé legacy của vòng vào event/hạng/seat thực, xử lý trùng và kiểm chứng sức chứa. Mapping vé đã check-in tạo history LEGACY; nếu không biết nhân viên cũ thì actor để null, không bịa UUID. Không phát hành vé thủ công mới vượt inventory của vòng đã cấu hình.

Phiếu LEGACY chỉ được phân loại thành LEGACY_CLASSIFIED bởi VOTE_MANAGER/SUPER_ADMIN, có audit; facts gốc không đổi. Unique quota tiếp tục áp dụng sau phân loại. Chưa biết hạng mục thì giữ trạng thái chưa đối chiếu và chặn vé đó vote mới. BTC có thể phân loại trước finalize; không sửa dữ liệu finalized.

RPC `cast_vote` bốn tham số và `open_voting` ba tham số giữ hành vi cũ cho vòng chưa có cấu hình mới. Khi vòng có categories/sessions, chúng trả `VOTING_CATEGORY_REQUIRED`/`VOTING_SESSION_REQUIRED`, không âm thầm bỏ qua contract mới. API/frontend baseline vẫn dùng RPC cũ: cấu hình mới chưa sẵn sàng cho người dùng đến khi giai đoạn 08 hoàn tất. Check-in HTTP chọn sự kiện, QR delivery, outbox vé và admin UI chưa được xây ở giai đoạn này.

## RLS và quyền

RLS bật trên tất cả bảng mới; GRANT explicit, client không có direct write. Public chỉ đọc catalog/phiên đã công bố và cột an toàn. Authenticated đọc orders/items/reservations/payments của chính mình; các cột nhạy cảm của payment không được grant. Policy owner tickets/votes baseline được giữ, grants bổ sung chỉ cột an toàn.

Holds, payment events, checkins, delivery secrets, snapshots, incidents và inventory dành cho service server. `service_role` có select/insert/update cần thiết, không được grant DELETE trên bảng mới. Helper trigger functions/schema không cho anon/authenticated gọi, PUBLIC execute bị thu hồi. Backend service vẫn phải kiểm tra role và ownership trên từng endpoint vì service role có quyền vượt RLS.

`ticket_delivery_secrets` chỉ định nghĩa ciphertext và key version. Chưa có thuật toán mã hóa, tạo token hoặc gửi QR; đó là phần giai đoạn 06. Metadata webhook chỉ được ghi thông tin đã lọc; không lưu raw payload, header xác thực, token QR hoặc secret vào JSON/log.

## Preflight cho database local hoặc test

Không sử dụng `skill/database.md` để chạy kiểm chứng này. Harness PGlite là database ephemeral local, dữ liệu giả, không có email/thanh toán hoặc request tới Supabase. Migration CLI chỉ tạo tên file, không chạy `db push` hay remote migration.

Trước khi áp lên một môi trường local/test khác: xác định URL/database/role, xác nhận PostgreSQL 15+, backup và chạy ba migration baseline theo thứ tự rồi migration thứ tư. Không dùng `db reset` với database không xác định. Review đặc quyền service và schema private sau áp. Không áp staging/production trong phạm vi lượt này.

Các query đọc sau migration để chuẩn bị mapping, chỉ báo UUID và trạng thái cần xử lý, không lấy email/QR hash:

```sql
select id, round_id, status from public.tickets
where source = 'LEGACY' and event_id is null;

select id, round_id, ticket_id from public.votes
where vote_format = 'LEGACY' and category_id is null;

select v.id, v.round_id, v.ticket_id from public.votes v
join public.tickets t on t.id = v.ticket_id
where v.user_id <> t.user_id or v.round_id <> t.round_id
   or v.edition_id <> t.edition_id;
```

BTC đối chiếu từng vé/phiếu; không tự mapping bằng thứ tự hàng hoặc đoán hạng mục. Tên hai hạng, seats/capacity, lịch mở bán/sự kiện, venue và vote categories phải điền trước test tích hợp/mở bán.

## Rollback

Rollback chỉ chấp nhận rollout rỗng: tất cả 16 bảng mới rỗng, không có vé đã map hoặc phiếu category/đã phân loại. Có bất kỳ dữ liệu mới thì abort toàn transaction; không dùng DELETE để vượt guard. Không có `CASCADE`; dependency ngoài scope làm rollback dừng. Có lock timeout 5 giây.

Khi đủ guard, rollback bỏ đúng objects giai đoạn 02, khôi phục unique constraints/RPC/grants cũ và giữ dữ liệu legacy. Test áp lên database rỗng, down rồi up lại; đối chiếu facts và function definitions cũ. Test rollout đã có dữ liệu xác minh down từ chối mà dữ liệu vẫn còn. Test lỗi SQL được chèn trước commit xác minh migration thất bại không để lại schema một phần.

Sau khi có dữ liệu mới, cần backup và forward/compensating migration được review. Rollback code/UI có thể thực hiện riêng để dừng luồng mới; không cố gỡ schema làm mất lịch sử.

## Bằng chứng kiểm tra và giới hạn

- `npm ci`: cài từ lockfile hiện có; không đổi dependencies/major versions.
- `npm test`: **69/69 test, 5/5 files**, ngày 13/10/2026; trong đó **52 test database** gồm 14 hồi quy chung và 38 schema mới. Có kiểm tra allow/deny RLS với SET ROLE anon/authenticated/service_role, FK/unique/check/deferred constraints, history, snapshot giá, TTL/tiền muộn, quota và rollback.
- `npm run lint`, `npm run typecheck`, `npm run build`: đạt. Build không thay frontend và không chứng minh luồng bán vé đã tích hợp.
- Secret scanner và kiểm tra whitespace/format cho file thay đổi: đạt. Không đọc/in/copy secret.

Harness dựng auth.users và auth.uid giả phục vụ principal, nhưng thực thi roles, grants, RLS, SQL và triggers PostgreSQL thật trong PGlite. Không phải Supabase Auth/MFA/Data API thật. `CREATE EXTENSION pgcrypto` được bỏ trong harness; UUID dùng hàm built-in. Chưa kiểm thử installation extension trên Supabase instance.

Chưa chạy E2E ứng dụng mới, xác thực chữ ký SePay, camera/mobile, job expiry, nhiều DB connections, EXPLAIN/pool/lock measurements hoặc tải 500–1.000 người dùng. Không gửi email, tạo giao dịch, deploy hay push Git. Các checks này thuộc giai đoạn tiếp và không được coi đã đạt qua test schema.

## Tiến độ và điểm dừng

Sản phẩm schema, kiểm thử quyền/ràng buộc/history và rollback đã đạt điều kiện giai đoạn 02 trong Word theo scope D06/D14/D18. Bằng chứng cập nhật checkbox và render Word được ghi tại mục 9 của kế hoạch người thứ hai. Dừng sau giai đoạn 02; giai đoạn 03 chỉ bắt đầu khi người dùng yêu cầu tiếp tục.

Word đã đánh X 01–02, tổng **2/12**, tiếp theo **03**; chỉ đổi checkbox 02 và dòng tổng, giữ nội dung khác. Bản đã kiểm tra 4 trang và bàn giao có SHA-256 `50A53470C9AE18EA7D5A7B2403E0B5530DB145B15402AB31F030D988A3CC2B77`.
