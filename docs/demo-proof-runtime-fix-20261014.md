# Khôi phục upload minh chứng DEMO — 14/10/2026

Người dùng gặp `Lưu ảnh minh chứng chưa được cấu hình.` khi gửi ảnh cho đơn một vé. Log cho thấy POST tạo đơn thành công, nhưng POST evidence trả503. Endpoint chỉ trả đúng thông báo này khi thiếu `env.IMAGES` hoặc `env.MEDIA`; lỗi không do giới hạn một đơn/tài khoản hoặc số lượng một vé.

Server local đang chạy đúng lệnh `dev:demo-db`, nhưng log reload cấu hình trong lúc checkout/gộp nhánh cho thấy bindings Images/R2 đã biến mất. File Wrangler cuối cùng trên `main` vẫn có đủ bindings trong environment `demo-test`. Dừng phiên Wrangler cũ rồi chạy lại cùng lệnh, environment và persistence khôi phục cả hai. Không sửa schema, secret, dữ liệu khách hoặc source nghiệp vụ; không xóa ảnh/đơn và không deploy.

Kiểm tra sau restart qua frontend5173 proxy backend8787, Auth/Supabase thật:

- Đọc lại đơn DEMO Combo2 cũ và ảnh riêng tư đạt; retry vẫn giữ hai vé.
- Tạo thêm một đơn vé đơn100.000đ bằng tài khoản DEMO đã có hai đơn COMPLETED. Ảnh PNG mới được xử lý và lưu WebP, đọc lại ảnh đạt200.
- Đơn mới COMPLETED, đúng một vé; retry Hoàn tất không cấp thêm vé. Đơn thử `bd2d6cec-24e3-4188-b6ea-5dfc32fc88bb` được giữ để đối chiếu, không chứa thông tin khách thật.
- Bằng chứng ignored: `output/demo-test/single-order-verification.json`. Không có chuyển tiền hoặc email thật.

Với đơn khách còn trong30 phút, chọn ảnh và bấm Hoàn tất lại trên trang hiện tại. Nếu đơn đã hết hạn thì đặt lại; không gia hạn hoặc tự Hoàn tất thay khách. Sau đổi nhánh/cấu hình khi đang thử, restart backend và kiểm tra upload thực tế; HTTP200 của health hiện không kiểm tra đầy đủ khả năng lưu minh chứng.

Images/R2 thuộc environment `demo-test`; Cloudflare mô tả cách khai báo bindings theo từng environment trong [tài liệu Wrangler](https://developers.cloudflare.com/workers/wrangler/environments/) và [Images binding](https://developers.cloudflare.com/images/optimization/binding/). Báo cáo này ghi nhận sự cố reload thực tế; không kết luận mọi phiên bản Wrangler đều gặp lỗi này.
