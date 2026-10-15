# Kết quả QA chức năng — 15/10/2026

Lệnh: `npm run test:full`. Bộ case: `qa-functional-cases-20261015.md` (110 case).
Inventory: `qa-automated-inventory.json` (256 khai báo source sau bổ sung mobile scroll, không phải số lượt chạy).

| Kiểm tra                                 | Kết quả                                          |
| ---------------------------------------- | ------------------------------------------------ |
| TypeScript                               | PASS                                             |
| ESLint                                   | PASS                                             |
| Unit / HTTP / database / browser journey | 223 PASS, 1 SKIP, 0 FAIL                         |
| E2E preview desktop/mobile               | 53 PASS, 3 SKIP theo platform                    |
| E2E official/auth desktop/mobile         | 24 PASS                                          |
| Production build                         | PASS; cảnh báo chunk Three.js >500KB còn tồn tại |
| Whitespace diff                          | PASS                                             |

Hành trình browser mới thực hiện trên desktop và mobile: chọn vé, nhập người mua,
QR/TTL, chọn rồi đổi ảnh, một lần Hoàn tất giả lỗi 503, retry thành công, đọc ảnh
đã lưu kiểm tra pixel để xác nhận ảnh cuối, sang vote, gửi phiếu và quản trị xem
sáu cột/minh chứng. Backend Hono và SQL migration/RPC thật chạy với PGlite; Auth,
CAPTCHA và media dùng adapter test. Không gọi Google hoặc Supabase thật.

Bổ sung kiểm tra API ảnh công bố/kết quả: ấn phẩm nháp không lộ, publish thủ công,
rút eligibility thì ảnh không còn public, SUPER_ADMIN/editor/staff, missing
storage trả 503, ảnh hợp lệ được xử lý WebP, Origin/throttle/schema chặn lỗi.

## Dọn dữ liệu

- Mẫu JSON người mua và PNG/TXT trong thư mục tạm đã xóa.
- Database hành trình test đã đóng: `database_closed=true`.
- Map ảnh sau teardown: `media_objects_remaining=0`.
- Dữ liệu giả/đơn/vé/vote chỉ nằm trong DB bộ nhớ đã hủy; không có seed LIVE.
- Browser context và server HTTP/Vite của test đã đóng.
- Không xóa bất kỳ DEMO lịch sử nào trên Supabase hoặc R2 local dùng chung.
- Giữ mã fixture/generator để chạy lại, và báo cáo/ảnh giả làm bằng chứng.

Bằng chứng lần chạy lại trước đồng bộ Git: `output/full-qa/2026-10-15T04-42-06-413Z/summary.json`,
`cleanup-browser.json`, `vitest.json`, log E2E và ảnh checkout/admin.
`output/full-qa/latest.json` chỉ tới lần chạy mới nhất.

## Giới hạn nghiệm thu

Native PostgreSQL nhiều kết nối SKIP: chưa cấu hình kết nối loopback test;
Docker daemon không chạy. PGlite single-session không chứng minh lock contention
trên nhiều connection. Không chạy load 1.000 người vào Supabase thật.

Chưa nghiệm thu OAuth/CAPTCHA/email cloud thật, ảnh qua R2/Images online,
Apps Script/trigger Google Sheets, backup/restore production. R2 hiện chưa active.
Các hàng T trong bộ test case giữ trạng thái cần tích hợp, không báo PASS giả.

Không sửa source nghiệp vụ, migration, secrets hoặc dữ liệu production trong lượt
QA này. Người dùng đã yêu cầu commit/push, tạo nhánh mới, gộp main và kiểm tra tự deploy
trong lượt đồng bộ tiếp theo; xem `git-sync-mobile-qa-20261015.md`.
