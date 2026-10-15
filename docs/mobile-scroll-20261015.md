# Tối ưu cuộn trên điện thoại — 15/10/2026

## Thay đổi

- Khi trang đang cuộn trên màn hình ≤900px hoặc thiết bị có con trỏ cảm ứng, tạm dừng vòng render sân khấu WebGL và các animation trang trí. Giữ canvas và khung hình cuối; tiếp tục sau `scrollend`, dự phòng 180ms không có sự kiện cuộn cho trình duyệt chưa hỗ trợ.
- Một listener cuộn passive dùng chung toàn trang; chỉ phát thông báo khi bắt đầu/kết thúc, không gọi setState hoặc đọc layout theo từng sự kiện.
- Bỏ parallax của logo trên mobile/cảm ứng. Desktop vẫn giữ parallax; điều kiện dừng khi ngoài màn hình, tab ẩn và reduced motion vẫn áp dụng.
- Bỏ drop-shadow lớn của logo và chuyển reveal sang fade 250ms trên mobile, tránh xoay phối cảnh khi đang đọc.
- Không chặn touch, không thay cuộn tự nhiên bằng thư viện cuộn, không thay luồng đăng nhập/đăng ký/vé/vote hoặc dữ liệu Supabase.

## Đo trước/sau

Chạy `node scripts/measure-mobile-scroll.mjs <nhãn>` khi bản fixture local đang chạy tại `127.0.0.1:4173`. Script chặn request ra ngoài loopback. Các bản build trước/sau có cùng fixture và workload: Chromium headless, iPhone 13 390×664, CPU slowdown 4×, sáu thao tác touchStart/touchMove/touchEnd (ba cặp cuộn xuống/lên). Quan sát scrollY tối đa 385px, bảo đảm thao tác thực sự cuộn trang.

| Chỉ số                          | Trước, lần 1 / lần 2 | Sau, lần 1 / lần 2 |
| ------------------------------- | -------------------- | ------------------ |
| Main-thread TaskDuration (giây) | 3,3737 / 4,2600      | 1,0879 / 1,0885    |
| ScriptDuration (giây)           | 0,5583 / 0,7697      | 0,2092 / 0,2019    |
| RecalcStyleDuration (giây)      | 0,3256 / 0,4150      | 0,2208 / 0,2311    |
| LayoutDuration (giây)           | 0,0042 / 0,0043      | 0,0060 / 0,0059    |
| Khoảng cách rAF p95 (ms)        | 33,3 / 33,4          | 33,4 / 33,4        |
| Long task >50ms                 | 0 / 0                | 0 / 0              |

Trung bình TaskDuration giảm khoảng 71,5%; thời gian script giảm khoảng 69%. Khoảng cách rAF p95 chưa cải thiện trong môi trường giả lập này; không suy ra FPS trên điện thoại thật hoặc cam kết hết khựng trên mọi thiết bị. Layout tăng dưới 2ms trong toàn workload, không phải nguồn tiết kiệm.

Bằng chứng ở `output/mobile-scroll/before-native.json`, `before-native-2.json`, `after-native.json`, `after-native-2.json` và ảnh cùng tên. Hai phép đo thăm dò `before`/`before-2` dùng synthesizeScrollGesture không tạo cuộn thực đã bị loại khỏi so sánh; script hiện kiểm tra maxScrollY để từ chối phép đo không cuộn.

Tham khảo phương pháp: [web.dev — hiệu năng animation](https://web.dev/articles/animations-guide), [Chrome — runtime performance](https://developer.chrome.com/docs/devtools/performance). Ưu tiên giảm công việc trang trí, transform/opacity và tránh đọc layout liên tục.

## Kiểm tra

- TypeScript, ESLint và build chính thức: đạt. Vite vẫn cảnh báo chunk Three.js >500kB như trước; không đổi dependency hoặc kiến trúc tải Three trong lượt này.
- E2E cấu hình chính thức/Auth: 24 đạt; Auth/API được giả lập trong test, không gửi email hoặc tạo dữ liệu thật.
- E2E giao diện: 53 đạt, 3 bỏ qua có chủ đích theo platform (hai case touch không chạy ở desktop và một case desktop không chạy ở mobile), 0 lỗi trong lần chạy cuối. Một kỳ vọng cũ yêu cầu parallax mobile đã được cập nhật theo hành vi mới.
- Test touch thực qua CDP kiểm tra: nội dung vẫn cuộn, canvas không bị tạo lại, animation dừng/tiếp tục, không lỗi JavaScript, nút về đầu trang hoạt động. Kiểm tra 320/390/768px không tràn ngang và menu đăng ký truy cập được. Desktop vẫn chạy hiệu ứng khi cuộn.

## Trạng thái bàn giao và hoàn tác

Thay đổi hiện ở working tree local; chưa commit/push hoặc deploy. Nhánh main đang nối Cloudflare Builds nên push sẽ kích hoạt triển khai; báo cáo này không xác nhận website online đã nhận bản sửa.

Hoàn tác riêng tối ưu này: bỏ `trackMobileScroll` trong App, bỏ file `mobileScroll.ts` và các hook/guard/listener mới trong MotionSystem, StageParallax, stageScene; bỏ block CSS mobile mới và hoàn lại các kỳ vọng parallax mobile trong test. Không reset toàn bộ working tree vì có bộ QA chưa commit từ lượt trước. Không thay môi trường, secret hoặc database khi hoàn tác.
