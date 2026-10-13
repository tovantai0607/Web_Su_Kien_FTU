# Security & trust boundaries

Browser là untrusted. Identity chỉ lấy từ JWT issuer/audience/signature/expiry và Supabase getUser. ES256/RS256 JWKS được cache theo URL cấu hình, URL bắt buộc cùng project. Request metadata không được tạo quyền; role lấy từ user_roles server-only, quản trị cần signed aal2. JWT deletion/session revocation: cần đánh giá policy session_id và thời hạn token với BTC; không tuyên bố JWT cũ tự bị vô hiệu khi user bị xóa.

RLS bật toàn bộ bảng. Public select theo publish state/edition và column grants cho contestant không lộ user_id. Private select theo auth.uid; user không có direct write. Privileged RPC chỉ service_role execute. Worker server-only secret cần least privilege và rotate; không đưa VITE secret. `has_role` không cho public user truy vấn vai trò của UUID khác.

Registration commit cùng consent/outbox; idempotency hash không gồm CAPTCHA dùng một lần. Avatar/raw upload không public; signature/size/decode/dimension/reencode/metadata checks; SVG bị từ chối. Cần TTL cleanup ảnh đã upload nhưng hồ sơ chưa nộp, quota tổng theo user và storage monitoring trước rollout lớn. Server giới hạn 20 mutation/action/user/60s qua Workers rate-limit; Turnstile action/hostname xác minh server. Rate limit edge không thay unique constraints, có thể eventually consistent; cần rate policy toàn cục theo ngân sách khi đánh giá spam nghiêm trọng.

Vote chỉ từ vé owner/issued/checked-in, final published, eligible contestant cùng edition. Vé lock bằng SELECT FOR UPDATE; unique(round_id,ticket_id). Kiểm tra DB clock sau wait. Không cập nhật counter dùng chung mỗi phiếu; index round/candidate để aggregate. Admin edit/open windows audit; schema không thay thế quy trình kiểm soát gian lận BTC. Cần quyền vote-manager tối thiểu và giám sát audit trong sự kiện.

API write yêu cầu exact Origin, bearer auth (không cookie ambient), JSON strict/schema/body bound; output text React escaped, không innerHTML CMS. Upload private không cache. Header CSP, nosniff, DENY/frame-ancestors, referrer-policy. XSS vẫn cần bảo vệ supply chain và tránh inline script; style-src unsafe-inline phục vụ Radix/React style, không cho script inline. HTTPS/HSTS phải review ở domain deployment thực.

Admin CMS/review/checkin/tickets/RBAC dùng transaction và audit; audit không lưu PII nguyên bản. Endpoint staff ticket chỉ cấp sau xác nhận quyền bên ngoài, không phải payment receipt. Không có payment provider nên không nhận tiền/webhook.

## Trước sử dụng thật

Ảnh thẻ sinh viên bắt buộc trong hồ sơ mới, riêng biệt với ba ảnh portfolio. RPC kiểm tra mục đích ảnh, ownership và edition trước khi gắn vào hồ sơ; composite FK giữ ownership/edition nhất quán. ID thẻ chỉ lưu trong `contestant_private`, không có trong `contestant_media` hoặc public profile. Reviewer có MFA tải ảnh qua API no-store bằng Bearer; UI chỉ tải khi bấm xem và thu hồi object URL khi đóng. Việc là sinh viên FTU cần BTC xác minh từ hồ sơ, không tự suy ra chỉ bằng một ảnh upload.

Logo nhà tài trợ chỉ nhận đường dẫn cùng origin dưới `/images/sponsors/` với đuôi ảnh được cho phép; không nhận URL ảnh bên ngoài hoặc SVG. Upload thẻ thật và Auth/MFA thực tế vẫn cần kiểm thử staging sau khi cấu hình R2/Images.

- [ ] Thay secret đã lộ; cấu hình server-only key, đúng origin, đúng issuer/signing key và session policy.
- [ ] Apply/review migrations local/test rồi staging, kiểm tra Data API grants/RLS bằng token anon/user/admin thật.
- [ ] Email confirmation/captcha/password policy và MFA cho mọi staff/admin; bootstrap admin qua UUID đã xác minh.
- [ ] R2 private, Images, Turnstile hostname/action, Resend + SPF/DKIM/DMARC, gửi email test không dữ liệu thật.
- [ ] Privacy/retention/đầu mối chỉnh sửa/xóa dữ liệu do BTC/pháp lý rà soát; chưa mở đơn khi dự thảo chưa được duyệt.
- [ ] Load staging nhiều DB connections, latency/error metrics, pool/locks và burst 400; WAF/budget/alert và backup restore drill.
- [ ] Ảnh, dates, theme, sponsors, rules và eligibility chính thức; không seed fixture vào production.
- [ ] Quy trình incident, phân tách environment, rollback code và migration/backup riêng.

Không tuyên bố đã chứng minh toàn bộ OWASP hay an toàn production. Các kiểm tra tự động có phạm vi nêu trong verification report.
