# Xử lý minh chứng DEMO riêng tư

Chỉ dành cho `test-giao-dich-demo` trên project đã được người dùng duyệt. Function không lưu database/Storage, không nhận URL ảnh, không gửi email và không xử lý thanh toán. Worker kiểm tra Auth, vai trò, Origin, rate limit, scope rồi chuyển bytes; function kiểm tra lại chữ ký Worker, JWT/User, ownership hoặc TICKET_STAFF/MFA, trạng thái/hạn đơn và offer DEMO trước khi decode. SUPER_ADMIN giữ MFA tùy chọn theo quy tắc chung.

`verify_jwt=false` để handler xác minh JWT qua Auth/JWKS hiện hữu, phù hợp khóa API mới. Đây không phải endpoint công khai không xác thực. HMAC dùng khóa server sẵn có, ràng buộc JWT, mã đơn, intent, MIME, SHA-256 và timestamp30giây; khóa không được truyền cho trình duyệt/Sheet. Dùng `SUPABASE_SECRET_KEYS` mặc định của Edge để kiểm tra, không tạo/thay secret. Nếu runtime thiếu đúng khóa Worker thì từ chối, không hạ kiểm tra.

Chỉ JPEG/PNG thật ≤5MB, ≤12MP; force decoder, đọc một frame, giới hạn bộ nhớ/disk/list, auto-orient, resize chiều rộng1600 không phóng to, xóa metadata và xuất WebP. Có test ảnh thật tại biên12MP và trên biên; chưa đo CPU/RAM của Supabase runtime. Worker kiểm tra lại cấu trúc WebP và kích thước kết quả, chỉ sau đó lưu private bucket. Lỗi codec/storage không được báo Hoàn tất thành công.

## Chuẩn bị và kiểm tra local

```powershell
npm ci
node scripts/prepare-proof-function.mjs
npx --yes --package deno@2.9.6 deno check --config supabase/functions/ftu-proof-transform/deno.json supabase/functions/ftu-proof-transform/index.ts
npx vitest run tests/unit/proof-codec.test.ts tests/unit/proof-handler.test.ts tests/unit/proof-storage.test.ts
```

Binary được lấy từ dependency đã khóa phiên bản0.0.44 và không commit. `supabase/config.toml` liệt kê `static_files`; deploy bằng CLI có Docker bundler, không dùng API-only/MCP để bỏ mất WASM. Máy hiện chưa có Docker; `deno check` và tests đã chạy nhưng chưa chạy Edge Runtime thật. Cần xác nhận runtime/bundle trước deploy.

Sau khi có quyền deploy bản test đã review: dùng CLI2.121.0, xem `functions deploy --help`, triển khai riêng `ftu-proof-transform` vào đúng project. Không `db push` hoặc deploy tất cả function. Không ghi key vào lệnh, log hay Git. Xác minh function từ chối thiếu/sai chữ ký và thực hiện smoke với đơn DEMO trước bật lưu ảnh trên Worker. Nếu function chưa hoạt động, upload trả lỗi và giữ đơn chờ; không lưu raw ảnh thay thế.

Tham khảo: [Supabase image manipulation](https://supabase.com/docs/guides/functions/examples/image-manipulation), [bundle Wasm/static files](https://supabase.com/docs/guides/functions/wasm), [default server keys](https://supabase.com/docs/guides/functions/secrets).
