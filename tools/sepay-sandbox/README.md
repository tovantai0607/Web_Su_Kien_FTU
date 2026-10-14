# SePay Test mode trên máy — 13/10/2026

Bộ nhận webhook thử nghiệm độc lập, dùng Python 3.12 và SQLite. Đây chưa phải ứng dụng bán vé hoàn chỉnh, không chốt lựa chọn framework/database cho sản phẩm. Mã `TEST-TICKET-*` chỉ là bản ghi vé giả lập; chưa tạo QR vé, gửi email hoặc kiểm thử tiền thật.

## Cấu hình đã hoàn tất trên SePay

- Giữ phiên đăng nhập hiện có trên Cốc Cốc; mọi thao tác ở **Test mode**.
- Giữ tài khoản Vietcombank giả lập có sẵn; thêm **MBBank cá nhân giả lập**, số `0000000002`, nhãn `FTU TEST - MB CA NHAN`.
- Dùng cấu trúc mã thanh toán có sẵn: `FTU` + 6–8 chữ số.
- Tạo webhook `FTU Sandbox - xac nhan ve`: tiền vào, JSON, HMAC-SHA256, gửi lại khi server lỗi. Bộ lọc hiện nhận tất cả tài khoản **Test mode**; máy chủ chỉ chấp nhận `MBBank` / `0000000002`.
- URL tại thời điểm thử: `https://direct-paintball-theaters-highways.trycloudflare.com/hooks/sepay-payment`.
- Máy chủ chỉ nghe tại `127.0.0.1:8787`; Cloudflare Quick Tunnel nối URL công khai tới máy chủ này. URL tạm hết hiệu lực khi tiến trình tunnel dừng; khởi động tunnel mới có thể đổi URL và cần cập nhật trên SePay.

## Bằng chứng kiểm thử

| Trường hợp | Kết quả |
| --- | --- |
| Nút Gửi thử của SePay | HTTP 200, máy chủ xác thực HMAC; payload mẫu id=0 không cấp vé |
| Giao dịch SePay Test mode `38016`, `FTU123456`, 200.000đ | HTTP 200 (SePay hiển thị 807ms); đơn `paid`, một mã vé giả lập |
| Giao dịch SePay Test mode `38018`, `FTU123457`, 100.000đ; đơn cần 200.000đ | `amount_mismatch`; đơn vẫn `pending`, không có vé |
| Gửi lại cùng payload `38016` có chữ ký hợp lệ qua URL công khai bằng client kiểm thử | HTTP 200; `replay_count=1`; giữ nguyên mã vé, không cấp thêm |
| Gửi payload không có chữ ký qua URL công khai | HTTP 401 |
| 10 bài kiểm thử tự động | Đạt, gồm gửi đồng thời 12 lần cùng giao dịch, 2 giao dịch cùng đơn, sai tài khoản, tiền ra, sai mã, đơn hết hạn, HMAC sai/quá hạn |

Đã thử nút Gọi lại trên giao diện SePay nhưng chưa ghi nhận request mới từ thao tác đó; bằng chứng phát lại ở bảng trên đến từ client kiểm thử, không phải kết luận về nút Gọi lại.

## Chạy và xem dữ liệu

Python đã dùng:
`C:\Users\dell\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`

Từ thư mục dự án, chạy với executable trên:

```text
tools/sepay-sandbox/receiver.py init
tools/sepay-sandbox/receiver.py serve
tools/sepay-sandbox/receiver.py status
-m unittest discover -s tools/sepay-sandbox -v
```

`init` không ghi đè bí mật/cấu hình đã có, không reset đơn đã thanh toán. Hai đơn mẫu `FTU123456`, `FTU123457` đều cần 200.000đ; thời hạn ban đầu là 24 giờ. Muốn chạy thêm kịch bản cần tạo đơn mẫu mới có hạn còn hiệu lực.

Dữ liệu runtime nằm tại `%LOCALAPPDATA%\FTU-SePay-Test`, ngoài repository: `config.json`, `sandbox.sqlite3`, log, PID và `cloudflared.exe`. Secret webhook được mã hóa bằng **Windows DPAPI** trong `webhook.dpapi`, chỉ giải mã với tài khoản Windows đã tạo. Không in khóa vào log/source/chat. Cấu hình nhận tiền ở `config.json` chỉ dành cho tài khoản giả lập.

Tại thời điểm kết thúc thử, receiver và tunnel vẫn chạy nền. Khi muốn dừng, kiểm tra PID và CommandLine trong `receiver.pid`, `tunnel.pid` đúng tiến trình receiver/tunnel của bộ thử này rồi dừng riêng các tiến trình đó. Không đổi webhook này sang Live.

## Tài liệu đã đối chiếu

- [Xác thực HMAC SePay](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc)
- [Cấu trúc webhook và phản hồi](https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook)
- [Mô phỏng giao dịch](https://developer.sepay.vn/vi/tien-ich-khac/test-mode/mo-phong-giao-dich)
- [Cloudflare Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

Chưa kiểm chứng tải 1.000 hoặc 2.000–3.000 người đồng thời. Thử nghiệm này xác minh kết nối và một phần logic xử lý thanh toán, chưa đủ để vận hành bán vé thật.
