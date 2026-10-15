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

## Kết quả triển khai lần đồng bộ này

- Atomic push 12 nhánh GitHub về merge commit `42a7290c7b93498c0f17a3d67da14436183c1070` đã được đọc lại từ remote và xác nhận.
- Cloudflare Builds tự triển khai từ main thành công trong 54 giây, build `f5ddca9f-bd04-440c-8c32-e1825afd6f24`, version `f92ea2a1-f038-4579-81fd-2e83e43f79cc` nhận 100% traffic lúc 04:46:47 UTC.
- Website tải stylesheet mới `/assets/index-LRjF4qC9.css`. Trình duyệt 390px xác nhận không tràn ngang, không preview, logo bỏ parallax/filter, scene render được và dừng khi ngoài màn hình, nút về đầu trang hoạt động. Menu mở được form đăng ký ba bước với lịch server vẫn khóa gửi sớm; không nhập hoặc gửi dữ liệu.
- Health/program trả HTTP 200, mùa `ftucharm-2027`. Script kiểm tra đã chỉnh đúng envelope `{data: ...}` của `/api/program`.
- Nhánh local `local-build-87315c8` là bản lưu lịch sử riêng, không có trên GitHub và không phải ancestor của main; giữ nguyên, không ghi đè hoặc đưa code cũ vào main.
- Commit bổ sung tài liệu/kịch bản kiểm tra sau deploy không đổi mã ứng dụng, được đẩy đồng bộ các nhánh theo cùng quy trình fast-forward. Version cuối cùng và trạng thái CI được lưu trong bằng chứng local và báo cáo bàn giao.

## Hoàn tác

Version trước push ở trên dùng làm mốc rollback nếu bản mới lỗi. Revert commit ứng dụng rồi push main theo quy trình Git để giữ lịch sử; không reset/force-push và không hoàn tác database vì lượt này không đổi schema/dữ liệu. Chỉ rollback Worker khi đã xác nhận sự cố và các giới hạn về tài nguyên liên kết. R2/Images online vẫn chưa được kích hoạt trong phạm vi này.
