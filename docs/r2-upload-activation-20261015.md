# Kích hoạt upload R2 online ngày 15/10/2026

## Phạm vi và thay đổi

Người dùng xác nhận đã tự kích hoạt R2 và yêu cầu hoàn tất upload trên website online. Tài khoản Cloudflare được xác minh bằng Wrangler: `1e730a0a106e462bd46facfb9486d1d6`; Worker `ftucharm-test`, environment `online-test`, URL `https://ftucharm-test.bancotaima1235.workers.dev`.

- Tạo bucket Standard `ftucharm-media-private`, location hint APAC. Managed public domain tắt; không bật r2.dev/CORS/public bucket.
- Gắn `MEDIA` và `IMAGES` vào Worker. API settings kế thừa toàn bộ binding/secret/assets đang có, không thay nội dung website hoặc secrets. Sao lưu trước/sau trong thư mục ignored `output/r2-activation/`.
- Bản online đã có luồng Storage minh chứng vé mới: tiếp tục giữ `PURCHASE_PROOF_BUCKET=ftu-demo-proof-private` để đọc/ghi minh chứng Supabase private và không mất ảnh cũ. Images binding xử lý ảnh cho cả luồng đó; R2 MEDIA dùng cho hồ sơ/ảnh chương trình. Không chuyển/xóa ảnh cũ hoặc thay provider toàn bộ.
- Tìm thấy hàng rào DEMO chặn `POST /api/admin/public-images`. Cho phép đúng endpoint chuẩn bị ảnh này đi tiếp qua kiểm tra quyền hiện hữu; không cho phép ghi/công bố hồ sơ LIVE, publication, vote hoặc đợt bán khác. `requireDemoAdmin`, Auth và quyền CONTENT_EDITOR/SUPER_ADMIN vẫn được giữ.
- Cấu hình binding và bản sửa được lưu ở commit `e4125d1cdb6c2e82730670b80d106cd0ac1db5d1`, nhánh `codex/r2-uploads-20261015` và `main`. Thực hiện trên worktree từ main mới nhất để giữ phần quản trị vé/Sheet/DEMO của các lượt khác. Không đẩy các thay đổi UI local đang dở trong workspace chính.

## Kiểm chứng

- 26 unit/database tests liên quan ảnh, codec, quyền và hàng rào DEMO đạt; fixtures chỉ trong PGlite local.
- Typecheck, lint, build và Wrangler dry-run đạt. Kiểu binding được sinh lại trong output ignored để đối chiếu.
- Worker chẩn đoán tạm có xác thực riêng kiểm tra trên Cloudflare thật: PNG 1800 × 900 → WebP 2360 bytes; ghi R2, đọc lại từng byte và content-type `image/webp` khớp. Object chẩn đoán và Worker tạm đã được xóa; không ghi database hoặc công bố ảnh.
- Bucket đã xác nhận không có public domain bật. Health/program online trả 200 sau thay binding, mode `demo-test` theo cấu hình hiện hữu.
- Kiểm tra browser phát hiện lỗi hết thời gian chờ ở lần đầu; lần kế tiếp trả thông báo hàng rào DEMO, dẫn tới bản sửa endpoint ở trên. Kết quả browser sau deploy được bổ sung ở phần bàn giao.

## Kết quả bàn giao online

Cloudflare Builds của commit `e4125d1` thành công, version `b95a4773-2531-491c-aa27-ea62648efbdd` triển khai 100% lúc 21:16 ngày 15/10/2026 (UTC+7). Các check GitHub đều success, gồm hai lượt Verify FTUCharm, build/deploy Pages và Workers Builds.

Qua phiên Google thật của tài khoản quản trị sở hữu dịch vụ: form Ảnh và vinh danh → Thêm ảnh theo vòng → chọn PNG thử 1800 × 900 thành công. Form nhận `/api/public-images/1e7e7b7b-cc0a-4be8-a871-6457214fd6f8.webp`; ảnh xem trước tải thành công qua private blob với natural size 1600 × 800. R2 xác nhận object WebP 2360 bytes; truy cập URL này không có phiên nhận 401. Không bấm Lưu bản nháp hoặc Công bố, không tạo publication/hồ sơ/đơn/vé/vote trên database thật.

Đã xóa đúng object thử trên R2 sau kiểm tra và xác minh bucket không còn object. Worker/object chẩn đoán trước đó cũng đã dọn. Ảnh bằng chứng trước khi dọn ở `output/r2-activation/upload-success.png`. Không xóa ảnh/dữ liệu có sẵn của khách.

Upload hồ sơ thí sinh chưa được chạy end-to-end trên dữ liệu thật vì lịch đăng ký chưa mở và môi trường online vẫn có fence DEMO. Luồng minh chứng vé giữ Supabase Storage private hiện hữu; không tạo giao dịch thử để nghiệm thu một đơn mới. Khả năng xử lý Images/R2 đã kiểm tra thật như trên, nhưng không suy ra mọi luồng ghi nghiệp vụ đã nghiệm thu online.

## Giới hạn và rollback

Đăng ký/upload hồ sơ thí sinh vẫn theo lịch 07–21/03/2027 và yêu cầu đăng nhập. Không mở cửa sổ đăng ký, tạo đơn/vé/vote/hồ sơ thử hoặc gửi email trên Supabase thật. Chuẩn bị ảnh không có nghĩa đã lưu publication hay công bố kết quả.

Phiên bản trước thay binding: `34323bf0-5568-4f4c-b891-9c00d1a52938`; bản chỉ thêm binding: `bd30885a-43d3-42ef-8968-cee85d9f7d4f`. Rollback Worker không rollback dữ liệu R2/Supabase; giữ bucket và ảnh thật. Có thể revert commit cấu hình/scope nếu cần sau khi kiểm tra deployment. Không xóa bucket hoặc ảnh khách để rollback.

Tài liệu đối chiếu: [R2 binding](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/), [Images binding](https://developers.cloudflare.com/images/optimization/binding/), [Images pricing](https://developers.cloudflare.com/images/pricing/). Không đăng ký Images Paid trong lượt này.
