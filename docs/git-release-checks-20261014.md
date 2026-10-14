# Kiểm tra trước đẩy nhánh bán vé — 14/10/2026

Theo yêu cầu người dùng: tạo nhánh mới `codex/ticket-purchases-admin-20261014`, đẩy bản hiện tại và gộp `main` khi kiểm tra đạt. Base đã fetch từ GitHub: `8115e0f`. Phạm vi gồm luồng mua theo bổ sung, trang khách `/admin/ve`, cấu hình giá/quota/combo, quyền vote và tài liệu/bằng chứng đã có; không deploy hoặc thay database.

Kiểm tra local trước commit:

- Lint và TypeScript đạt.
- Vitest: 180 tests đạt, một native PostgreSQL opt-in skipped; chạy một worker để phù hợp máy 8 GB RAM.
- Public E2E: 48/50 đạt lượt đầu; hai bài timeout (WCAG desktop và chuyển động 3D mobile) đạt khi chạy lại `--last-failed --workers=1`.
- Auth/admin E2E: cả 10 đạt khi chạy tuần tự một worker. Hai bài cấu hình Google ban đầu timeout sau khi đã lưu cấu hình thành công, trong lúc nhiều bộ kiểm tra chạy song song. Không sửa code hoặc tăng timeout để xử lý các lần timeout này.
- Build và Wrangler deploy **dry-run** đạt. Cảnh báo chunk Three lớn và chưa chỉ định environment cho dry-run; không deploy thực tế. Cấu hình production còn theo runbook, không coi kết quả này là nghiệm thu online.
- Kiểm tra 62 file ứng viên gồm nội dung XML của hai file Word: không phát hiện mẫu secret. Đối chiếu thêm private key đã có trong các file ignored với nội dung text được stage: không trùng. `.env.local`, `.dev.vars.demo-test`, `skill/database.md`, `.secret`, `output/` và persistence R2 không được stage.
- `git diff --cached --check` đạt; không xóa file và không còn conflict.

Ảnh DEMO vẫn trong R2 local; đơn/vé và metadata ảnh ở Supabase. LIVE chưa công bố; không chuyển tiền hoặc gửi email thật. Tiến độ Word và bằng chứng nghiệm thu cũ được giữ; các kết quả trong báo cáo này bổ sung cho trạng thái sau gộp Git.

Sau khi đẩy, kiểm tra CI GitHub trên đúng commit của nhánh trước khi merge; kết quả merge/URL báo ở cuối lượt. Không suy ra “không còn mọi lỗi” hoặc khả năng tải production từ bộ kiểm tra này.
