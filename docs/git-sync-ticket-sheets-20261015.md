# Đồng bộ Git cho kho mã vé và Sheet — 15/10/2026

Người dùng yêu cầu lấy Git mới nhất, gộp với phần vừa làm, kiểm tra rồi đẩy bản mới. Làm ngay tại `D:/WED_sk_FTU`, không tạo clone khác, không reset/clean hoặc xóa thay đổi.

## Nguồn và cách gộp

- Gốc local `3bbb82c`; fetch nhận main mới `5c39e54`, gồm tối ưu cuộn mobile, bộ QA cô lập và sửa đọc envelope API chương trình.
- Nhánh bàn giao `codex/ticket-code-sheets-sync-20261015`.
- Commit `c09fe8b` giữ toàn bộ47 file thay đổi trước gộp. Merge `714224c` giữ lịch sử hai nhánh.
- Một conflict trong `tests/helpers/purchase-runtime.ts`: giữ cả RPC đọc kho mã/chủ vé và RPC công bố chương trình, bảng timeline/publications. Không chọn bỏ một bên.
- Bản vá và file mới đã sao lưu dưới output bị ignore. Không stage `.secret`, `.dev.vars`, output hoặc binary WASM. Quét các file đưa vào commit không thấy mẫu khóa Supabase/GitHub hoặc private key.

## Nội dung giữ lại

- Supabase Storage private, xử lý minh chứng có Auth/ownership/chữ ký và kiểm tra ảnh; fence DEMO và tắt email cho môi trường thử.
- Kho700BK +700CK +50DM ban đầu; mỗi vé có mã/UUID riêng, không tái dùng. Ba tab riêng bán kết/chung kết/DEMO.
- Sheet gộp combo cùng đơn/loại, ví dụ2 Combo2/4 vé thành `cb2_4_<dải mã>`, giữ mã thành viên. Chặn nguồn thiếu/trùng hoặc nhóm sai; retry không nhân vé.
- Demo4 vé mới đã lưu:15 mã DEMO được cấp/35 chưa cấp, đơn và minh chứng thật trong scope DEMO; đây là dữ liệu thử, không phải tiền đã nhận.

## Kiểm tra sau gộp

`npm run test:full`, run `2026-10-15T04-59-46-347Z`, đã kết thúc exit0:

- Typecheck/lint/build đạt.
- Unit/database/browser journey:264 đạt,0 lỗi,1 native PostgreSQL skip do chưa có môi trường nhiều kết nối riêng.
- E2E preview desktop/mobile:53 đạt,3 skip; E2E official/Auth:24 đạt.
- Worker `online-test` dry-run đạt; không deploy. Build có cảnh báo kích thước chunk Three.js sẵn có, chưa là kết quả đo tải online.
- Teardown xác nhận database bộ nhớ đã đóng, media/tệp giả trong thư mục tạm riêng đã dọn; không tạo fixture LIVE hoặc xóa DEMO lịch sử.
- Fetch lại sau QA: main vẫn `5c39e54`, không còn commit main mới chưa gộp. Git diff check không lỗi khoảng trắng/conflict.

Báo cáo JSON/log/ảnh ở `output/full-qa/2026-10-15T04-59-46-347Z` và `output/git-sync-20261015-combos`, không đưa vào Git. Giữ riêng kết quả test thực qua Supabase ở tài liệu kho mã; bộ QA lần gộp dùng môi trường cô lập.

## Phạm vi vận hành

Chỉ push nhánh bàn giao. Không cập nhật main hoặc các nhánh khác vì main nối Cloudflare Builds và yêu cầu lần này chưa chỉ định gộp main/deploy. Không migration database, fixture mới, gửi email hoặc thay secrets trong lượt đồng bộ Git này.

Ba migration Sheets/deadline/quota còn pending remote; migration kho mã đã áp từ lượt trước. Edge Function/bundle runtime và Apps Script/OAuth/trigger còn cần kích hoạt/nghiệm thu riêng. Source được push không đồng nghĩa Sheet tự làm mới hoặc upload online đã hoạt động. Word11/11 local/DEMO là bằng chứng lịch sử, không đổi dấu X trong lượt này.
