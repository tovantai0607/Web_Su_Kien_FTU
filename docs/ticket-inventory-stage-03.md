# Tồn kho và trang vé giai đoạn 03

## Rà soát lỗi và dọn cache sau cập nhật sơ đồ

Ngày 13/10/2026, theo yêu cầu kiểm tra bug/dọn file rác: `npm run check` đạt typecheck, **82/82 tests** và production build; lint đạt; full E2E **20/20** desktop/mobile đạt sau bản sơ đồ mới. Chưa phát hiện lỗi trong các ca đã chạy. Không chạy lại benchmark hoặc kết nối database từ xa trong lượt này.

Đã xóa đúng **5 file sinh tự động, 25.967 bytes** trong `tools/sepay-sandbox/__pycache__/`, `supabase/.temp/` (chỉ có cli-latest) và `node_modules/.vite/vitest/`. Trước xóa đã xác minh absolute paths nằm trong workspace, không có reparse point và không có nội dung ngoài whitelist. Hash SHA-256 của **96 file source/tài liệu** giống nhau trước/sau thao tác dọn. Word đang bị tiến trình khác giữ nên không đọc/hash hoặc sửa tài liệu; giữ nguyên file khóa của nó. Bổ sung ignore `/~$*.docx` để khóa Word không lẫn vào Git.

Giữ source/migrations chưa commit, secrets/config, node_modules, build preview đang dùng và ảnh PNG gốc được scripts/optimize-assets.mjs tham chiếu. Production build đã được tạo lại từ source hiện tại. Nhật ký cleanup chi tiết/ảnh/kết quả E2E ở QA ngoài repository. Không dùng git clean để xóa, không thay đổi tiến độ hoặc chuyển sang 04.

## Cập nhật sơ đồ minh họa theo phản hồi

Sau nghiệm thu 03, người dùng cung cấp ảnh sơ đồ rạp và xác nhận chưa có sơ đồ BTC, làm mẫu trước. Đã thêm `components/SeatMap.tsx`: sân khấu dạng thang nhìn từ trên xuống, hàng/số ghế, 4 khối/lối đi, màu hạng và trạng thái, SVG ghế tương tác, zoom 100–175%, vùng cuộn ngang có keyboard/focus. Các lối đi/lối ra minh họa chỉ xuất hiện trong preview; không áp layout địa điểm giả lên dữ liệu live.

Fixture preview có 8 hàng A–H, 16 ghế/hàng, hai hạng mỗi hạng 64 ghế, gồm ghế giữ/bán mẫu; giá vẫn 100.000đ. Đây là 128 ghế minh họa, không phải sức chứa thật. Dữ liệu và API/schema/TTL/quota thật giữ nguyên. Trang ghi rõ chưa phải sơ đồ chính thức. Không cập nhật thêm checkbox Word hoặc triển khai giai đoạn 04.

Sau sửa: lint/typecheck/preview build đạt; **6/6 E2E** được chạy cho ticket và automated WCAG AA trên desktop/mobile, 31,8 giây. Một lỗi contrast phần tồn kho đã được sửa và kiểm tra lại đạt. Smoke browser ở 1440/390/320px xác minh chọn ghế nhiều hạng, cuộn tới H16, zoom/reset, không tràn ngang trang; chỉ vùng sơ đồ cuộn. Đã xem ảnh desktop và mobile cuối trong QA ngoài repo. Các con số 82 tests/20 E2E bên dưới là nghiệm thu trước refinement, không phải lần chạy lại toàn suite trong lượt này.

Ngày kiểm chứng: 13/10/2026. Trang `/ve` và `/ve/:eventSlug` đã đọc dữ liệu API, hiển thị giá/hạng/tồn kho và sơ đồ ghế; sự kiện chưa mở bán vẫn xem chi tiết được. Đã có giữ ghế nguyên tử, giải phóng khi hủy/hết hạn và kiểm thử cạnh tranh PostgreSQL local. Checkout/thanh toán thuộc giai đoạn 04–05.

## Bản mới nhất và phạm vi

Local bắt đầu ở `6cf6aef`; `git ls-remote` xác nhận GitHub main mới hơn tại `15153171671f1edd9420cf997381d92be52d0d4b`. Đã clone main mới vào `D:\WED_sk_FTU-latest-20261013`, kiểm chứng HEAD, fetch và fast-forward workspace chính `D:\WED_sk_FTU` lên cùng commit. Giữ nguyên AGENTS.md local và skill/tools có sẵn; triển khai trên nhánh local `codex/stage-03-ticket-inventory`.

Giữ luminous theme và cập nhật đăng ký/thẻ sinh viên của người thứ nhất. Trang vé dùng tokens lavender/hồng/ngọc trai, Playfair Display/Be Vietnam Pro và packages/ui hiện có. Detail có sân khấu/sơ đồ ở trái, lựa chọn ở phải; mobile một cột. Button ghế tối thiểu 44px, fieldset/label thật, keyboard, trạng thái bằng chữ và reduced motion. Không đổi dependencies/lockfile.

Upstream đã đổi tên migration và đặt schema bán vé ở `20261013143000_ftucharm_sales_voting.sql`. README upstream báo năm migration được áp trên Supabase thử nghiệm; lượt này không kiểm tra hoặc thay đổi database đó. Migration bán vé thứ sáu và operations thứ bảy chỉ được áp vào database test local.

## Sản phẩm và contract

| Phần              | Thực hiện                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Catalog           | `GET /api/events`, `GET /api/events/:identifier`; UUID hoặc slug, có `?edition=UUID`                                   |
| Giữ ghế           | `POST /api/events/:id/holds`, `{ seat_ids: UUID[] }`, `Idempotency-Key: UUID`; Auth email xác minh và rate limit chung |
| Lượt giữ riêng tư | `GET /api/me/holds/:id`, `POST /api/me/holds/:id/release` với `{}`; chỉ owner                                          |
| SQL               | `20261013150000_ticket_inventory_operations.sql`: catalog, reserve/read/release/expiry RPCs; chỉ service_role execute  |
| UI                | `pages/Tickets.tsx`, `tickets.css`, routes trong App; bỏ trang vé tĩnh cũ khỏi PublicPages                             |
| Dùng chung        | `packages/shared/src/sales.ts`: DTO, strict Zod input, state theo server clock và fixture preview                      |
| Tests             | HTTP/PGlite, fixture SQL fake, script PostgreSQL nhiều connections và E2E                                              |

Catalog trả `{ server_time, events }`. Event gồm lịch/venue, sale_state, TTL, giới hạn 10, categories với giá nguyên VND và capacity/held/sold/available; detail thêm seats AVAILABLE/HELD/SOLD/UNAVAILABLE. Chỉ event có mùa/vòng published xuất hiện. Không trả holder/user ID, QR hash, idempotency key hoặc payment metadata. Mặc định đọc mùa published mới nhất; edition query dùng khi cần scope khác.

UPCOMING vẫn có “Xem chi tiết”, giá, sơ đồ và countdown; ghế chưa giữ được. OPEN cho chọn; SOLD_OUT/CLOSED khóa lựa chọn. Countdown dùng snapshot clock database cộng thời gian đơn điệu trong browser. Catalog polling 15 giây, hold polling 5 giây; loading/empty/error/retry, nút cập nhật và xóa lựa chọn stale.

Giữ ghế tạo order nền cùng items/reservations/holds trong một transaction để đáp ứng constraints giai đoạn 02. Đây là primitive tồn kho cho giai đoạn 04 tái sử dụng; chưa có public `/api/orders`, checkout, provider, payment QR hoặc phát hành vé. UI có giữ/giải phóng, snapshot tổng tiền và hạn gốc. Preview chỉ chọn thử, không POST hoặc báo giữ thành công giả.

## Invariants

- Chỉ nhận 1–10 seat IDs distinct; không nhận giá/owner/trạng thái. Worker lấy user từ principal và giá/labels từ DB. Service-only RPC, search_path rỗng, PUBLIC/anon/authenticated execute bị thu hồi; helper private không gọi trực tiếp được.
- Cùng user/key có advisory transaction lock. Retry cùng event/seats/hash trả đúng order và TTL; khác payload conflict. Đơn hết hạn giữ lịch sử, không hồi sinh. UI đặt lại dùng key mới và giữ key cũ khi retry cùng request chưa rõ kết quả.
- Expiry/release khóa order hiện hữu rồi seat UUID tăng dần; reserve khóa các claims hết hạn trước, rồi seats/categories theo thứ tự. Order mới chưa thấy bên ngoài tạo sau khi có toàn bộ ghế. Clock kiểm tra lại sau khi chờ khóa. Không gọi provider trong transaction.
- Dọn claim hết hạn chạm ghế muốn lấy trước reserve. Cron hiện có chạy expiry batch 100 mỗi phút, SKIP LOCKED; owner đọc hold cũng xử lý expiry của mình. Inventory công khai bảo toàn trạng thái vật lý: HELD quá hạn còn tính đến khi server RELEASED, tránh bán trùng. Không tin browser timer để trả kho.
- Cancel/expiry chỉ chuyển PENDING_PAYMENT sang CANCELLED/EXPIRED, reservations/holds sang RELEASED một lần. PAID/CONSUMED không bị hạ trạng thái. Unique/FK/check/deferred constraints giai đoạn 02 giữ nguyên; sai một ghế rollback cả lượt.

## Bằng chứng kiểm tra

Đạt lint, typecheck, production build, preview build, Prettier các file thay đổi, secret scan và whitespace check.

`npm test`: **82/82, 6 files**, gồm **65 tests database** (52 hồi quy + 13 HTTP/inventory). Hono handlers thật gọi RPC chạy migrations/triggers PostgreSQL trong PGlite; boundary xác minh principal và transport Supabase dùng fixture. Kiểm tra catalog/draft, trước/sau mở bán, snapshot/TTL, idempotency, owner, quantity/giá giả/ghế trùng, Origin/Auth, release hai lần, expiry, privileges và rollback functions giữ dữ liệu. Không thử Supabase Auth/Data API thật.

`npm run test:e2e`: **20/20**, desktop/mobile Chromium, 48,8 giây. Bao gồm xem detail trước mở bán, keyboard/tối đa 10, preview không ghi, routes 320px, hồi quy ứng dụng và automated WCAG AA trên list/detail vé. Automated accessibility không thay thế review thủ công toàn bộ.

PostgreSQL **16.15** từ archive EDB đặt ngoài repo, cluster fake `127.0.0.1:55433`, user test riêng; không Windows service. Script từ chối hostname/port/user/database khác cấu hình này, tạo database `ftu_stage03_<timestamp>`, áp toàn bộ migrations với pgcrypto thật và fixture local. Không dùng skill/database.md hoặc credentials thật.

Các kiểm tra nhiều connections đã đạt:

1. **20 backend PIDs khác nhau** tranh ghế cuối: một thành công, 19 SEAT_UNAVAILABLE; tồn kho 0, không vượt capacity.
2. 20 retries cùng key: một order và một TTL, không giữ thêm.
3. Hai request đảo thứ tự hai ghế: một thành công, một conflict, không deadlock.
4. Expiry rồi tranh lấy lại và cancel/expiry đồng thời: old order EXPIRED, không hồi sinh; kho trả một lần.
5. Request đợi row lock qua giờ đóng bán nhận SALE_CLOSED, không tạo order.

Với `--browser`, production build chạy qua bridge HTTP local lấy JSON từ RPC của DB test thật. Mobile 390px đã kiểm tra list/detail, chọn ghế, availability thay đổi từ transaction khác, xóa stale selection, UPCOMING/SOLD_OUT/CLOSED, lỗi mạng và retry; không tràn ngang/pageerror. Bridge chỉ nằm trong test script, không đưa Auth bypass vào ứng dụng. Đây là UI với dữ liệu DB local, không phải Supabase staging. Đã xem ảnh desktop và mobile; ảnh native mobile dùng reduced motion để tránh chụp giữa animation. Database lần kiểm tra cuối: `ftu_stage03_1791903732576`.

## Chạy lại và rollback

Các suite thông thường dùng scripts hiện có. Kiểm tra nhiều connections cần provision PostgreSQL test riêng đúng cấu hình được bảo vệ:

```powershell
$env:FTU_TEST_DATABASE_URL = 'postgresql://codex_test@127.0.0.1:55433/postgres'
npm run build
node scripts/test-inventory-postgres.mjs --browser
```

Script giữ DB test làm bằng chứng, không drop bảng/dữ liệu đã có. Binaries/archive/pgdata/logs và ảnh QA giữ ngoài repo. Server PostgreSQL test được dừng sau nghiệm thu; preview 5173 giữ chạy để người dùng xem.

Rollback `supabase/rollbacks/20261013150000_ticket_inventory_operations.sql` chỉ bỏ RPC/helper mới, giữ mọi order/items/holds/history. Dừng HTTP/cron consumers trước rollback. Muốn rollback schema 02 phải bỏ functions 03 trước và đáp ứng guard không có dữ liệu của rollback 02; không force/CASCADE.

## Giới hạn và điểm dừng

Nghiệm thu giai đoạn 03 trên local/test đã xác định. Chưa có lịch/venue/sơ đồ BTC thật, chưa thử Auth/MFA/Supabase thật hoặc đo tải 500–1.000. 20 connections là kiểm tra cạnh tranh, không phải benchmark mục tiêu. Không email/thanh toán, remote migration hoặc deploy. Không triển khai giai đoạn 04.

Word đã đổi riêng ô 03, tổng **3/12**, tiếp theo **04** sau checks/QA. Bản trước/sau 4 trang, ảnh 2–4 trùng pixel; hash bàn giao `23FA412C981E2070F0871D2912297D5725CA55297248A5C8843D212206A1F877`. Bằng chứng tại mục 10 của kế hoạch người thứ hai. PostgreSQL test đã dừng, preview 5173 giữ chạy. Dừng sau 03.

Nguồn chính thức: [Supabase functions và quyền execute](https://supabase.com/docs/guides/database/functions), [PostgreSQL row/advisory locks](https://www.postgresql.org/docs/15/explicit-locking.html), [PostgreSQL Windows archives](https://www.postgresql.org/download/windows/) và [EDB binaries](https://www.enterprisedb.com/download-postgresql-binaries). Dùng để chọn RPC/locking/runtime test, không chứng minh throughput.
