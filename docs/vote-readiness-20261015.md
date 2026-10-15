# Rà soát vote và phần còn cần xử lý — 15/10/2026

Kết luận: core vote có kiểm thử local, nhưng chưa đủ điều kiện vận hành thật. Đây là kiểm tra và sửa lỗi local, không phải nghiệm thu Supabase/Cloudflare production.

## Cơ sở đối chiếu

- GitHub đã có bản mới `c5b7201`; local fast-forward đến bản này, bảo toàn các chỉnh sửa combo Sheet đang có, không reset/clean/xóa file.
- Đọc tiến độ Word:11/11 là nghiệm thu local/DEMO, không phải production. Giữ nguyên Word trong lượt rà soát.
- Truy vấn Supabase chỉ đọc:13 migration đã áp; chưa có `20261014160311_google_sheets_purchase_edits` hoặc bản sửa deadline mới. Không chạy migration hay tạo phiên/phiếu/vé thử trên project thật.

## Dữ liệu vote đã xác minh

| Mục                                                           | Hiện trạng                                          |
| ------------------------------------------------------------- | --------------------------------------------------- |
| Phiên bình chọn                                               | 0                                                   |
| Phiếu đã ghi                                                  | 0                                                   |
| Hạng mục                                                      | 2, đều ở vòng chung kết chính thức; bán kết chưa có |
| Thí sinh công khai đủ điều kiện trong các vòng đang công khai | 0                                                   |
| Thí sinh được gán vào phiên                                   | 0                                                   |
| Giờ vote                                                      | Cả bán kết/chung kết chính thức chưa có open/close  |
| Vé issued                                                     | 11, đều thuộc vòng DEMO; hai vòng chính thức có0 vé |
| RPC tổng tài khoản/phiếu và cron đóng hết hạn                 | Chưa có trên Supabase thật                          |

11 vé DEMO không được dùng cho vòng chính thức: ownership và round phải khớp. Không lấy số vé DEMO để kết luận đã sẵn sàng vote thật.

## Lỗi phát hiện và sửa ở local

1. `GET /api/voting/:id` gọi `read_vote_participation` bằng public client, trong khi hàm chỉ được cấp EXECUTE cho service_role. Khi migration này được áp, cách gọi cũ bị từ chối quyền, làm API vote lỗi. Đã chuyển riêng aggregate này sang client server; bảng công khai vẫn dùng read client và RPC vẫn không được mở quyền cho anon/authenticated. HTTP test mô phỏng public client bị từ chối và xác minh endpoint vẫn trả tổng đúng.
2. Cron cũ chỉ đóng trạng thái OPEN. Hệ thống cho vote theo giờ ở trạng thái SCHEDULED mà không cần chuyển OPEN, nên phiên đã lên lịch có thể không chuyển CLOSED sau hết giờ. Đã thêm migration `20261015024905_vote_deadline_closure.sql`: đóng cả OPEN/SCHEDULED đúng hạn, khóa SKIP LOCKED, không finalize/publish/mở lại hay cấp thêm lượt; giữ audit. Có rollback chỉ khôi phục bộ lọc, giữ các phiên CLOSED và lịch sử. Migration chưa áp remote.

## Kiểm chứng và giới hạn

- Trước cập nhật Git:53 test mục tiêu về đơn/vote/quyền HTTP đạt. Sau tích hợp Git và sửa:42 test mục tiêu gồm chương trình chính thức, vote, quyền aggregate và rollback đạt. Full suite cuối **215 test đạt, một native test skip**,24 files đạt. Lint, typecheck, production build và whitespace check đạt. Build còn cảnh báo chunk Three.js lớn như bundle hiện hữu; không dùng kết quả này để kết luận tải online đạt.
- Test bao gồm vé đã Hoàn tất không cần check-in, đúng tài khoản/vòng/hạng mục, retry không nhân phiếu, một vé nhiều hạng mục vẫn được giữ UUID, giảm vé không thấp hơn số vé đã vote, phiên lên lịch tự đóng và không tự công bố.
- API local8787 hiện không lắng nghe; máy có `.dev.vars.demo-test`, chưa có `.dev.vars` hoặc `.dev.vars.official-local` cho bản chính thức. Không đọc/in khóa, không sao chép hoặc thay secrets. Cần cấu hình backend/Auth/Turnstile thật rồi mới nghiệm thu trình duyệt→API→Supabase bằng môi trường được phép.
- Không gửi vote hoặc tạo dữ liệu thử vào LIVE. Chưa chạy lại concurrency PostgreSQL native, tải online hoặc Google Apps Script end-to-end; PGlite không chứng minh nhiều kết nối thật.

## Việc cần làm trước mở thật

1. BTC chuẩn bị thí sinh đủ điều kiện, hạng mục của từng vòng và giờ mở/đóng vote; cấu hình qua quản trị theo quyền đã chốt. Cấp vé chính thức theo luồng Hoàn tất; không chuyển vé DEMO sang LIVE.
2. Review/backup và áp hai migration đang chờ đúng thứ tự, sau khi được phép. Kiểm tra backend/Auth/Turnstile/rate limit, chạy tích hợp với dữ liệu giả đúng môi trường. Không bypass CAPTCHA.
3. Deploy HTTPS, private Storage/Images và chuyển/bảo toàn minh chứng cũ đang local. Bật cron, kiểm tra hết hạn và quan sát lỗi; sau đó cấu hình Apps Script/trigger để Sheet đồng bộ mỗi phút.
4. BTC hoàn thiện giá/quota từng loại/QR nhận tiền và nội dung thật. Tiếp tục bàn giao dữ liệu cho team đối soát/gửi email thủ công; không thêm payment webhook/check-in/email vé tự động ngoài phạm vi.

## Bàn giao Git tiếp theo

Sau lượt kiểm tra, người dùng yêu cầu kiểm tra Git mới, gộp các bản sửa và đẩy/gộp main. Fetch xác minh GitHub vẫn ở `c5b7201`, local khớp bản nền; giữ một thư mục và bảo toàn thay đổi đang có. Nhánh bàn giao: `codex/vote-sheet-fixes-20261015`; commit/merge đối chiếu lịch sử Git.

Kiểm tra trước bàn giao:215 unit/database test đạt (một native test skip);24 Auth/admin/official-program E2E đạt desktop/mobile; lint/typecheck/build/diff check đạt và Wrangler dry-run đạt. Quét12 file thay đổi không phát hiện mẫu secret Supabase/private key; không đưa file môi trường hoặc dữ liệu khách vào Git. Bàn giao code không áp migration, deploy Worker hoặc bật trigger Sheets; các điều kiện vận hành phía trên vẫn còn.
