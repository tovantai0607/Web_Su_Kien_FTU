# Hướng dẫn phát triển website sự kiện FTU

## Ngữ cảnh và phạm vi

Website cuộc thi hoa khôi sinh viên: giai đoạn 1 giới thiệu, đăng ký thí sinh, email xác nhận và quản trị; giai đoạn 2 bán vé, chọn/giữ ghế, thanh toán, webhook, QR và check-in; giai đoạn 3 bình chọn theo vòng và chống gian lận. Ưu tiên trải nghiệm điện thoại, bảo mật, chi phí vận hành thấp. Mục tiêu 2.000–3.000 người dùng đồng thời phải được kiểm chứng bằng đo tải, không suy ra từ lựa chọn công nghệ.

Thư mục dự án trống tại thời điểm thiết lập 13/10/2026. Trước khi đề xuất công nghệ hoặc sửa cấu trúc, kiểm tra code, manifest, lockfile, cấu hình, migration và hướng dẫn trong thư mục con. Không mặc định React, Next.js, Supabase hay Prisma. Giữ phiên bản và kiến trúc hiện hữu trừ khi nhiệm vụ yêu cầu thay đổi.

## Chọn skill theo nhiệm vụ

Đọc `SKILL.md` của skill phù hợp và chỉ tải references cần thiết. Skill dùng chung ở `C:/Users/ADMIN/.agents/skills/`; không sao chép chúng vào source code. Kiểm tra danh sách skill của phiên đang chạy trước khi gọi; nếu thiếu, báo rõ và dùng tài liệu chính thức.

- UI: ưu tiên `ui-ux-pro-max` và `frontend-design`. Với giao diện lớn, xây design system gồm token màu, typography, spacing, component và trạng thái trước khi triển khai. Dùng `building-components` cho composition, typing và accessibility; `web-design-guidelines` để review.
- Frontend React/Next.js khi đã xác định stack: dùng `vercel-react-best-practices` (thư mục `react-best-practices`). Component tái sử dụng, tránh code trùng, kiểm tra TypeScript bằng script dự án, tối ưu theo số liệu và kiểm tra API theo phiên bản đang cài.
- PostgreSQL: dùng `supabase-postgres-best-practices` cho schema, SQL, migration, RLS, indexes, pooling, transaction và locking. Dùng `supabase` khi dự án thực sự dùng Supabase. Dùng `prisma-cli` chỉ cho Prisma ORM 7; không áp dụng công thức đó cho Prisma 6/8.
- Kiểm thử: dùng `webapp-testing`; kiểm tra thành công/thất bại của luồng nghiệp vụ chính, keyboard, responsive, lỗi mạng, retry và quyền truy cập. Ưu tiên test hành vi và invariants có giá trị; không thêm test chỉ mô phỏng triển khai.
- Bảo mật và vận hành: dùng skill bảo mật/triển khai đã có và phù hợp với nền tảng; đọc tài liệu chính thức OWASP, provider và runtime khi thiếu hướng dẫn. Cài skill không đồng nghĩa đã cài CLI, browser, MCP hoặc đã đăng nhập dịch vụ.

Các skill bổ sung đã xác minh: `nextjs` cho App Router khi stack là Next.js; `vercel-composition-patterns` cho kiến trúc component; `prisma-orm-setup` để chọn đúng phiên bản Prisma; `sharp-edges` cho API/config và authentication dễ dùng sai; `differential-review` cho diff có baseline Git; `playwright-cli` cho browser/testing khi runtime đã cài; `web-perf` cho đo performance; `workers-best-practices`, `wrangler`, `cf-cli` cho Cloudflare theo cấu hình thực tế; `deployments-cicd` cho Vercel/CI/CD khi đã chọn nền tảng. Không áp dụng các ví dụ deploy, promote, provisioning hay gửi comment bên ngoài nếu nhiệm vụ chưa cho phép.

Các tên agent và slash command riêng của Claude/plugin được nhắc trong upstream không tự được đăng ký khi cài skill độc lập. Dùng quy trình trực tiếp và công cụ Codex tương đương; không gọi agent/command không có. Kiểm tra CLI help và tài liệu hiện hành thay vì chạy nguyên xi ví dụ CI.

## UI và accessibility

Giữ design system nhất quán giữa các trang. Thiết kế mobile-first, không tràn ngang, có label thật, thông báo lỗi liên kết với input, focus rõ, keyboard đầy đủ, semantic HTML, contrast phù hợp và reduced-motion. Nội dung tiếng Việt rõ ràng; font phải hỗ trợ dấu tiếng Việt. Bao gồm loading, empty, success và error states.

UI/UX Pro Max được cài ở phạm vi người dùng. Ví dụ `${CLAUDE_PLUGIN_ROOT}` trong bản upstream không áp dụng trong Codex; gọi script bằng đường dẫn tuyệt đối:

```powershell
python "C:/Users/ADMIN/.agents/skills/ui-ux-pro-max/scripts/search.py" "error summary validation" --domain ux
```

Không truyền dữ liệu riêng tư vào query. Chỉ `--persist` khi cần tạo design system, kèm `--output-dir` trỏ đúng root dự án; đọc MASTER hiện hữu và không dùng `--force` nếu chưa được cho phép.

## Backend, API và database

Định nghĩa trạng thái, trust boundary, quyền theo vai trò và invariants trước khi triển khai luồng quan trọng. Validate input ở server, kiểm tra ownership/quyền trên mỗi tài nguyên và endpoint, giới hạn request/upload, tránh SQL injection, XSS, CSRF và log dữ liệu nhạy cảm. Dùng rate limit theo nghiệp vụ; CAPTCHA không thay thế authorization.

Schema cần primary key, foreign key, unique/check constraints phù hợp; indexes dựa trên truy vấn thực tế và EXPLAIN. Bật và kiểm thử RLS với role thực tế khi cần; trong Supabase phải bảo vệ bảng thuộc exposed schema. Không đưa service-role key vào client. Dùng migration có review và rollback; không sửa production trực tiếp. Các hướng dẫn Supabase chạy SQL để lặp schema chỉ áp dụng cho database local/test đã xác định.

- Đăng ký: xác nhận email bằng token có hạn, dùng một lần; retry gửi email phải idempotent; bảo vệ thông tin cá nhân và ảnh thí sinh.
- Vé/ghế: giữ ghế có TTL do server quản lý; transaction và constraint ngăn bán trùng. Không giữ database transaction trong lúc gọi payment provider. Xử lý cạnh tranh giữa hết hạn giữ ghế và webhook bằng state machine rõ ràng.
- Thanh toán: xác minh chữ ký webhook trên payload đúng quy định provider; chống replay; idempotency theo event/payment ID; kiểm tra số tiền, tiền tệ và đơn hàng. Không tin trang redirect client là bằng chứng thanh toán.
- QR/check-in: mã khó đoán, không chứa thông tin nhạy cảm; check-in bằng cập nhật nguyên tử để hai thiết bị không chấp nhận cùng vé. Có audit trail và phân quyền nhân viên.
- Bình chọn: xác định điều kiện hợp lệ, thời gian vòng theo server, unique constraint theo chính sách phiếu, chống retry trùng và cập nhật nguyên tử. Kết quả công khai không làm lộ dữ liệu cá nhân.

## Kiểm thử, tải và triển khai

Kiểm thử luồng đăng ký/email, RLS, webhook trùng/sai chữ ký, hai người giữ cùng ghế, hai thiết bị quét cùng QR, vote retry và hết hạn vòng. Dùng dữ liệu giả, môi trường local/staging và tài khoản test; không tạo thanh toán hay gửi email thật trong test.

Kiểm tra package scripts rồi chạy lint/typecheck/build/test phù hợp. Báo rõ check chưa chạy hoặc không có, không tuyên bố website đạt chuẩn khi chưa đo. Load test phải có workload, tỷ lệ đọc/ghi, ramp-up, thời lượng, p95/p99 latency, error rate, connection pool, lock contention và ngân sách được xác định. Không chạy tải lên production hoặc dịch vụ ngoài khi chưa được cho phép.

Không commit secrets; dùng cấu hình môi trường và secret store. Kiểm tra đúng môi trường trước migration/deploy. Chuẩn bị rollback, backup phù hợp và quan sát lỗi. Không tự deploy production; preview/staging chỉ thực hiện khi nằm trong phạm vi yêu cầu. Không tự nâng cấp dependency major, đổi provider, xóa dữ liệu hoặc thay secrets. Ưu tiên giải pháp đơn giản, chi phí có căn cứ, tránh hứa khả năng chịu tải chưa kiểm chứng.
