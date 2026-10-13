# API contracts

Hono, `/api`. Thành công `{ data: ... }`, lỗi `{ error: message }`. JSON tối đa 64KiB; upload JPEG/PNG <=5MiB. Query `edition` phải UUID. List công khai tối đa 200/1000; frontend phân trang thí sinh 8/trang; admin hồ sơ 25/trang.

## Public (RLS / publishable key)

GET `/health` trạng thái app/time/mode; `/editions`, `/editions/current`; `/timeline?edition=UUID`; `/rounds?edition=UUID`; `/contestants?edition=UUID`, `/contestants/:slug`; `/news?edition=UUID`, `/news/:slug`; `/sponsors?edition=UUID`; `/voting/:roundId` chỉ contestants eligible và server_time.

Không trả email, phone, user_id, token_hash hay bảng riêng tư. Chỉ season/published content. Các dữ liệu vote/window không cache.

## User (Bearer Supabase access JWT)

- POST `/contestants/apply`: ApplicationInput trong packages/shared, `Idempotency-Key: UUID`, Turnstile `apply`. Email phải khớp email tài khoản đã xác minh. Không nhận user_id/role/status. Trả id/code/pending khi transaction đã commit.
- GET `/me/application`, PATCH `/me/application/:id`: update faculty/bio/talents chỉ owner + needs_changes.
- GET `/me/notifications`, `/me/tickets`, `/me/votes`: owner filter tại server. Không trả mã vé gốc hoặc hash.
- POST `/media/upload?edition=UUID`: raw JPEG/PNG có signature; Images decode kiểm tra <=12MP, resize 1600px/WebP/reencode và strip EXIF/XMP/ICC. Private R2; trả media UUID.
- GET `/media/:id`: owner hoặc reviewer aal2, private no-store.
- POST `/votes`: round_id, contestant_id, ticket_id, turnstile_token. JWT xác minh, action vote, rate limit; server-only RPC thực hiện transaction. Phiếu đầu mới, retry cùng candidate trả cùng id; candidate khác trả 409.

## Admin (DB role + MFA aal2)

- GET `/admin/overview`: applications/votes/check-in counts.
- GET `/admin/applications?page=0&status=pending`; PATCH `/admin/applications/:id/review`: approved/needs_changes/rejected + note. Transaction đồng bộ notification/outbox/audit. Approval không tự publish.
- GET/POST/PATCH `/admin/{editions,rounds,timeline,news,sponsors}[/:id]`. Chỉ trường Zod được phép; saved content + audit cùng transaction.
- POST `/admin/rounds/:id/publish`: contestant_ids, chỉ approved, đúng season, không vượt cutoff; khóa thay eligible khi đã có votes.
- POST `/admin/rounds/:id/open-voting`: mở đúng 10 phút theo DB clock, chỉ final published/eligible; chưa từng mở. Không tự mở qua client timer.
- POST `/admin/checkin`: token, hash SHA-256 và atomic one-time transition.
- POST `/admin/tickets`: user_id, round_id, seat_label; chỉ staff có MFA; token random trả một lần, database chỉ giữ hash. User_id ở endpoint staff này là đối tượng được staff cấp, không dùng làm danh tính caller.
- POST `/admin/roles`: user_id, role, enabled, SUPER_ADMIN MFA; không được xóa admin cuối cùng.
- GET `/admin/emails`, `/admin/audit`: quyền reviewer/superadmin tương ứng. Không trả địa chỉ recipient trong email status list.

Status 400 validation, 401 identity/session/email chưa xác minh, 403 origin/permission/MFA/ticket, 409 duplicates/closed windows, 413 oversized, 429 throttle, 503 unconfigured/dependency unavailable. Chưa có payment/webhook endpoint; không giả thành công.
