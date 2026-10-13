# Kế hoạch FTUCharm

Workspace chỉ có tài liệu; repository GitHub không có ref khi kiểm tra ngày 13/10/2026. Tạo npm monorepo, giữ AGENTS.md. Brief 1.md là tài liệu yêu cầu; các chỉ dẫn nhập vai/làm song song không được dùng để tự đăng ký agent hoặc hạn chế yêu cầu trực tiếp về vote.

Stack theo brief: React/Vite/TypeScript, Tailwind, Radix/shadcn-style components, React Router, React Hook Form/Zod, TanStack Query; Hono/Workers; Supabase Auth/Postgres; R2 riêng tư; Resend outbox. Không dùng Prisma/Next.js/Vercel vì không phù hợp stack.

## Thực hiện

1. Design system và tài nguyên trang trí riêng, responsive 320px, reduced motion.
2. Trang chủ, giới thiệu, timeline, thí sinh, hồ sơ, đăng ký, thư viện, tin tức, tài trợ, tài khoản, vé/vote và quản trị.
3. Contracts và validation dùng chung; API auth, quyền/MFA, chống spam, upload, registration transaction/outbox, CMS.
4. Migration nhiều mùa, RLS/private data, unique vote theo vé/round, time window server; vé đã check-in là điều kiện.
5. Kiểm tra type/build/unit/API/browser/a11y; fixture development được đánh dấu và tuyệt đối không chấp nhận write giả.
6. CI, hướng dẫn staging/production, rollback, gaps, secret scan; commit và push GitHub khi checks đạt.

## Phạm vi và cấu hình còn thiếu

Chưa biết ngày, chủ đề, ảnh thí sinh, nhà tài trợ chính thức; không bịa dữ liệu production. 50 thí sinh là dự kiến; vòng và cutoff cấu hình theo mùa. User xác nhận 1 phiếu/vé đã check-in/lượt 10 phút. Không dùng key secret đã lộ vào frontend/Git. Không áp migration vào Supabase từ xa khi chưa xác định đó là local/test; bàn giao migration và kiểm tra local khi có Postgres. Payment provider, Resend domain/API key, R2 binding, Turnstile và quyền admin/MFA phải được cấu hình trước vận hành thật. Không deploy hosting trong yêu cầu này; bàn giao source và local preview, push repo đã được cho phép.
