# Đồng bộ bộ QA và tối ưu mobile — 15/10/2026

Người dùng yêu cầu đẩy toàn bộ thay đổi, tạo nhánh mới, gộp main, đồng bộ các nhánh GitHub và kiểm tra website tự cập nhật.

## Nội dung bàn giao

- Nhánh làm việc: `codex/mobile-scroll-qa-sync-20261015`.
- Gốc trước thay đổi: main `3bbb82c7e216e1f764c01e9cfbef5a8aab7587bf`.
- Bộ 110 test case, 256 khai báo kiểm thử tự động, generator dữ liệu giả local và teardown; không tạo demo hoặc gửi email trên dữ liệu thật.
- Tối ưu cuộn mobile: giữ khung hình 3D trong khi vuốt, tiếp tục khi dừng; bỏ parallax và giảm hiệu ứng nặng trên mobile. Desktop giữ chuyển động cũ.
- GitHub Actions cài Chromium trước `npm test`, vì browser journey trong Vitest cần browser. Không đổi secrets, migration hoặc nhà cung cấp.
- Script `scripts/verify-online-release.mjs` kiểm tra website công khai bằng GET và thao tác cuộn/điều hướng, chặn các request ghi. Script không đăng nhập hoặc tạo tài khoản/đơn/vé/vote.

## Kiểm tra trước gộp

`npm run test:full`, run `2026-10-15T04-42-06-413Z`:

- Typecheck/lint/build: đạt.
- Unit/database/browser journey: 223 đạt, 1 native PostgreSQL skip do chưa có DB test nhiều kết nối.
- E2E preview: 53 đạt, 3 skip theo platform.
- E2E official/Auth: 24 đạt.
- Dữ liệu tạm đã xóa; DB bộ nhớ và media test đã dọn; không tạo fixture LIVE.

## Quy trình đồng bộ và triển khai

Kiểm tra tất cả remote branch đã được bao gồm trong main; tạo commit trên nhánh mới, merge có giữ lịch sử vào main. Đưa các nhánh remote về cùng merge commit bằng fast-forward và atomic push; không force-push hoặc xóa nhánh. Đọc lại refs từ GitHub để xác nhận.

Cloudflare Builds hiện nối main với Worker `ftucharm-test`, environment `online-test`. Việc push main là trigger triển khai; không chạy Wrangler deploy thủ công để thay thế phép kiểm tra tự động.

Baseline website trước push: HTTP 200, stylesheet `/assets/index-C_aruxXX.css`, chưa có `data-mobile-scrolling`. Version Worker trước push: `2364f7c7-04aa-4e3a-8b4b-74c47a360809`.

Sau push, kiểm tra version mới, stylesheet mới, `GET /api/health`, `GET /api/program` phải là `ftucharm-2027`; trên mobile vuốt phải tạm dừng decoration rồi tiếp tục cùng canvas, menu đăng ký phải dùng được. Bằng chứng kết quả thực tế được lưu ở `output/git-sync-20261015/` và báo lại khi hoàn tất; tài liệu này mô tả quy trình, không tự xác nhận deploy thành công trước khi kiểm tra.

## Hoàn tác

Version trước push ở trên dùng làm mốc rollback nếu bản mới lỗi. Revert commit ứng dụng rồi push main theo quy trình Git để giữ lịch sử; không reset/force-push và không hoàn tác database vì lượt này không đổi schema/dữ liệu. Chỉ rollback Worker khi đã xác nhận sự cố và các giới hạn về tài nguyên liên kết. R2/Images online vẫn chưa được kích hoạt trong phạm vi này.
