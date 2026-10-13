# Bình chọn 300–400 người trong lượt 10 phút

Mục tiêu đúng dữ liệu: không mất phiếu đã xác nhận, không nhiều phiếu/vé/vòng, không user khác dùng vé, không phiếu sau giờ đóng, không thí sinh sai mùa/vòng. Invariants được kiểm tra bằng SQL PostgreSQL. Chưa xác nhận throughput production.

## Staging trước chung kết

Tách môi trường/key/dữ liệu/email, chuẩn bị 400 user và vé test đã check-in, eligible entries đúng season/final round. Không dùng fixture public preview thay dữ liệu test ở server. CAPTCHA dùng config test được provider cho phép; đo riêng JWT/getUser/Turnstile/DB latency.

1. Ramp 50→100→200→400 phiên trong 60s, browse/login/tickets/voting.
2. Burst 400 POST vote cùng lúc (mỗi user/vé riêng), 20% retry cùng lựa chọn, 5% retry đổi lựa chọn.
3. 10 phút duy trì đọc cửa sổ mỗi 15s, có read/cast vào giây cuối, queued requests qua giờ đóng.
4. Kịch bản vé chưa check-in, revoked, user khác, round khác, candidate bị loại, CAPTCHA invalid, token expired; mọi lỗi đúng403/409/401 không tạo vote.
5. Đối chiếu DB unique count với số success độc lập; kiểm tra audit/window clock sau kết thúc; không dùng UI timer làm nguồn.

Ngưỡng ban đầu để BTC duyệt: p95 vote <2s, p99 <5s, error server <0.5%, không mất/trùng/late vote. Ghi timestamp server, status, latency; không log token/email/phone. Kiểm tra Postgres active connections, row-lock wait/deadlocks, CPU, I/O, slow query plans, Auth/Turnstile limits, Worker errors/CPU và budget. Không hứa đạt 2.000–3.000 concurrent visitors khi chưa chạy workload đó.

Mỗi phiếu lock vé riêng, tránh lock chung theo round counter; read share lock round cho consistency với admin. Admin mở window 10 phút qua RPC DB clock. Group aggregate ở kết quả sau window, không poll toàn bộ votes hoặc lộ danh tính cử tri.

Đã chạy 400 local HTTP GET (0 lỗi) và 400 SQL casts queued trong PGlite single session. Hai phép đo này **không mô phỏng 400 connections/PostgREST/Workers/Auth thật**. Cần chạy staging end-to-end và soak/recovery trước sự kiện.
