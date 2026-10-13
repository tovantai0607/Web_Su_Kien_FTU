# Giao diện và tài khoản, 13/10/2026

Giữ React/Vite, Hono Workers và Supabase. Không deploy, thay secrets, sửa database hay gửi email thật trong lần sửa này.

## Giao diện

Manrope Variable hỗ trợ tiếng Việt, self-hosted; Playfair chỉ giữ ở wordmark. Nền pearl #FAF8FF, ink #332644, plum #724081. Button pill, card/input radius theo hệ thống hiện hữu. Tiêu đề và hành động dùng từ ngắn, bỏ slogan, wordmark trang trí khổng lồ, dải giá trị và lời mời trùng. Giữ thể lệ, quyền riêng tư, hướng dẫn cần thiết và trạng thái nghiệp vụ.

Hero có vương miện bạc/ngọc trai WebP nền trong suốt (385 KB), tạo bằng ImageGen. Reference mở đầu được tạo trước khi code; khoảng trống, bố cục hai cột, tiêu đề hai dòng và quỹ đạo được dùng để dựng giao diện thật. Ảnh chỉ là vật trang trí, không chứa nút hoặc chữ cần tương tác.

Desktop có một cảnh sticky với vương miện nghiêng/phóng nhẹ và quỹ đạo mở theo tiến độ cuộn. Mobile cuộn tự nhiên với chuyển động nhẹ hơn. CSS view timeline không dùng scroll listener/React state theo từng frame. Browser thiếu view timeline vẫn có bố cục đầy đủ và hiệu ứng trôi nhẹ. Reduced-motion và nút dừng tắt toàn bộ chuyển động; phần sticky trở lại chiều cao bình thường. Không chặn lăn chuột hay phím điều hướng.

## Skill

Đã cài ở `C:/Users/ADMIN/.codex/skills/`: `taste-skill`, `image-to-code-skill`, `web-design-guidelines`, `playwright-cli`. Awesome Design upstream là thư viện DESIGN.md, nên tạo adapter `awesome-design` và kiểm tra bằng quick_validate. Không ghi đè các skill cũ ở `.agents/skills`.

Nguồn: [Taste / Image to Code](https://github.com/Leonxlnx/taste-skill), [Vercel Guidelines](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines), [Playwright CLI](https://github.com/microsoft/playwright-cli), [Awesome Design](https://github.com/VoltAgent/awesome-design-md). Tham khảo phân cấp và khoảng trống từ [Apple DESIGN.md](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/apple/DESIGN.md); dùng palette/font riêng của FTUCharm.

## Tài khoản và trust boundary

| Trạng thái           | Chuyển tiếp                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| Chưa đăng nhập       | Đăng nhập bằng email/mật khẩu và CAPTCHA                                                                       |
| Đăng ký chờ xác minh | Gửi email xác minh, có gửi lại; không tự vào hồ sơ                                                             |
| Đã đăng nhập, có MFA | Nhập TOTP rồi vào hồ sơ; quản trị luôn kiểm tra aal2 và role ở Worker                                          |
| Khôi phục            | Chỉ mở đổi mật khẩu khi SDK phát PASSWORD_RECOVERY                                                             |
| Đổi mật khẩu         | Kiểm tra mật khẩu cũ bằng phiên riêng, kiểm tra MFA, gửi nonce nếu provider yêu cầu, đổi và đăng xuất toàn cục |
| Đăng xuất            | Thu hồi refresh token theo scope, xóa cache truy vấn riêng tư                                                  |

Supabase Auth băm mật khẩu bằng bcrypt với salt ngẫu nhiên trên server; không thêm bảng mật khẩu hoặc hash ở frontend. UI kiểm tra ít nhất 12 ký tự và tối đa 72 byte UTF-8 để tránh giới hạn bcrypt. Mật khẩu xác nhận phải khớp. Không trim mật khẩu, không chặn paste hoặc password manager. Lỗi nhà cung cấp được chuyển thành thông báo an toàn, không xác nhận email đã tồn tại.

Token phiên chỉ ở memory. Custom Supabase storage lưu tạm PKCE verifier/index (15 phút) vào localStorage để liên kết email hoạt động sau redirect trong cùng trình duyệt; không ghi access/refresh token vào đó. Reload yêu cầu đăng nhập lại. Mã đã dùng được SDK xóa. Backend vẫn xác minh JWT (issuer/audience/ES256/RS256), getUser, email xác minh, quyền tài nguyên và role/MFA; không lấy quyền từ user_metadata. Global signout thu hồi refresh token; JWT đã cấp có thể tồn tại đến expiry, nên cần TTL ngắn cho thao tác nhạy cảm.

## Cấu hình dịch vụ còn cần kiểm tra trước khi dùng thật

Kiểm tra read-only ngày 13/10: Auth settings HTTP 200, email login bật, signup bật, `mailer_autoconfirm=false`; JWKS/schema HTTP 200. `.env.local` hiện `VITE_PREVIEW_MODE=true`, chưa có Turnstile site key thật. Các test không gửi email hay tạo người dùng remote.

Trước khi bật live, cấu hình đúng project/môi trường: Turnstile site key phía web và CAPTCHA secret tại Supabase Auth; bật CAPTCHA ở provider (client check không thay server enforcement); password minimum 12 tại Auth settings; email confirmation; redirect allowlist chính xác cho `/tai-khoan/ho-so` và `/tai-khoan/dat-lai-mat-khau`; SMTP/domain; MFA TOTP; JWT signing key bất đối xứng và expiry ngắn. Bật secure password change/current-password enforcement; leaked-password protection nếu gói hiện tại hỗ trợ. API cần ALLOWED_ORIGIN chính xác và các binding/keys theo README. Chưa xác minh password policy/rate-limit/SMTP bằng Management API vì không có cấu hình quản trị trong phạm vi lần sửa. Không coi validation UI là policy server.

Tài liệu: [password security và bcrypt](https://supabase.com/docs/guides/auth/password-security), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [MFA](https://supabase.com/docs/guides/auth/auth-mfa).

## Kiểm thử

Kết quả: typecheck, lint, build production, build preview và secret scan đã qua; 85 test unit/database và 20 test E2E desktop/mobile đã qua. Axe kiểm tra các trang chính và bốn trang tài khoản theo WCAG 2/2.1 AA. Ảnh QA được lưu tại `output/qa/refined-desktop.png` và `output/qa/refined-mobile.png`. Không suy ra chứng nhận accessibility hoặc tải production từ các kiểm tra này.

Unit tests mock provider cho signup, CAPTCHA, email lỗi, MFA sai/đúng, recovery guard, nonce, kiểm tra mật khẩu cũ, đăng xuất và memory/PKCE storage. E2E trên Chromium desktop/mobile kiểm tra điều hướng, form, profile riêng tư, menu/dialog, layout 320px, WCAG AA bằng axe, hiệu ứng cuộn và chế độ dừng. Kiểm thử production Auth với email test/Turnstile và session revocation thực tế còn cần môi trường staging hoàn chỉnh.

Rollback: hoàn nguyên các file trong diff, `npm ci` để khôi phục dependency theo lockfile, build lại. Không có migration hoặc thay đổi tài khoản remote cần rollback.
