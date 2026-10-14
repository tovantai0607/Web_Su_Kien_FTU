# FTUCharm — sân khấu 3D

## Triển khai

- Giữ màu đỏ `#a7090e`, nền đỏ đen và toàn bộ nội dung/nghiệp vụ hiện hữu.
- Logo: ảnh thương hiệu gốc được chia bằng CSS clip-path thành hai ngôi sao, hai cánh và trụ giữa. Mỗi phần có trục xoay/nhịp nâng riêng; cả nhóm xoay theo tiến độ cuộn xuống/lên. Đây là các lớp ảnh trong không gian CSS 3D, **không phải mô hình logo điêu khắc đầy đủ**; không vẽ lại nhận diện.
- Hero: Three.js dùng camera perspective, mesh lụa xoắn có biến dạng sóng và ánh sáng, mesh cánh hoa cong xoay ba trục, ngọc trai hình cầu, hoa GLB và hai mặt phẳng khói ở độ sâu khác nhau. Khói là VFX texture trong không gian 3D, không phải mô phỏng thể tích/chất lưu.
- Toàn bộ route dùng chuyển cảnh perspective 650ms. Tiêu đề, timeline, bài viết và thẻ xuất hiện theo chiều sâu khi cuộn. Thẻ thí sinh/bài viết/nhà tài trợ nghiêng nhẹ theo con trỏ chính xác; không áp dụng tilt lên form hoặc bảng quản trị.
- Không thay đổi API, schema, dữ liệu hay triển khai production. Các thay đổi chưa commit trước đó được giữ lại.

## Tài nguyên miễn phí và giấy phép

| Tài nguyên                     | Nguồn                                                                   | Sử dụng                                                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hoa đơn / cụm hoa              | [Kenney Nature Kit](https://kenney.nl/assets/nature-kit), CC0           | `flower_redA.glb` và `flower_redB.glb`, giữ nguyên file, đổi tên thành `flower-red.glb` / `flower-red-cluster.glb`. Hạ độ sáng vật liệu lúc render. Tổng 15.2 KB. |
| Khói                           | [Kenney Smoke Particles](https://kenney.nl/assets/smoke-particles), CC0 | `PNG/White puff/whitePuff00.png`, giữ nguyên pixel, đổi tên thành `smoke.png` (57.6 KB). Nhuộm đỏ xám bằng vật liệu.                                              |
| Dải lụa / cánh hoa / ngọc trai | Hình học do dự án tạo trong `stageScene.ts`                             | Không tải model trả phí; không cần tài khoản hoặc dịch vụ bên ngoài.                                                                                              |

Bản giấy phép gốc: `docs/licenses/kenney-nature.txt`, `docs/licenses/kenney-smoke.txt`. Asset được phục vụ cùng website ở `/models/stage/`, không hotlink. Three.js dùng giấy phép MIT trong package.

## Giới hạn tài nguyên và accessibility

Cập nhật chẩn đoán trình duyệt trong ứng dụng: môi trường thực tế báo `prefers-reduced-motion: reduce`, nên hiệu ứng mặc định tắt. Nút cuối trang nay hiển thị đúng “Bật chuyển động”. Khi người dùng chủ động bật, lựa chọn cho phép motion ghi nhớ trong `localStorage` của cùng trình duyệt và đồng bộ giữa các tab, vượt tùy chọn giảm chuyển động riêng cho website; bấm dừng xóa lựa chọn này. Không thay cài đặt hệ điều hành. Mặc định vẫn tuân theo reduced motion. Regression E2E kiểm tra bật thủ công, tải lại và dừng trong môi trường reduced motion.

Three.js tách chunk tải sau nội dung ban đầu (1.2 giây), không tải khi reduced motion/bấm dừng trước thời điểm đó. Canvas không nhận tương tác, `aria-hidden`; nội dung và nút luôn nằm trên các lớp trang trí. Desktop: 12 cánh hoa, 3 ngọc, 2 khói, 2 mẫu hoa; <=900px: 5 cánh hoa, 2 ngọc, 1 khói, 1 mẫu hoa hiển thị. Giới hạn render 30fps và DPR tối đa 1.25 (mobile 1). Không cập nhật React state mỗi frame.

IntersectionObserver và Page Visibility dừng render khi hero ngoài màn hình/tab bị ẩn. Nút dừng và `prefers-reduced-motion` hủy scene, trả logo nguyên bản. Thiếu WebGL2, mất context hoặc tải chunk lỗi sẽ giữ lớp CSS dự phòng. Khi unmount giải phóng geometry/material/texture/renderer/context và listener. Mobile không xử lý pointer tilt.

## Kiểm chứng local

Ảnh ở `output/qa/3d-390.png`, `3d-768.png`, `3d-1440.png`; script tái tạo: `node scripts/capture-stage3d.mjs` với preview port 5173 đang chạy. Đã sửa lỗi transparent plane cắt mất logo bằng cách flatten giữa các lớp, và chặn tràn ngang do perspective trong `main` bằng `overflow-x: clip`.

E2E bổ sung kiểm tra pixel canvas thay đổi, từng phần logo chuyển động, dừng ngoài màn hình, mất context khi đang chạy, dừng/bật và thay đổi reduced motion. Bộ có sẵn kiểm tra cuộn xuống/lên, fallback WebGL bị khóa, điều hướng, bàn phím, form và axe accessibility.

Kết quả: lint, TypeScript, production build đạt; 112 unit tests và 44 E2E desktop/mobile đạt. Sau tinh chỉnh sóng lụa và giải phóng context, chạy lại riêng bốn E2E 3D đạt. Chưa chạy load test, không tác động database.

### Đo bằng `scripts/measure-frontend.mjs`

Chromium local, cache tắt, CPU chậm 4x, mạng local không throttle, một lượt trước/sau. Đây không phải số liệu thiết bị thật hay chứng nhận Core Web Vitals. Khác biệt tải máy/khởi động khiến kết quả thời gian dao động; không suy ra rằng thêm 3D làm trang nhanh hơn.

| Viewport  | LCP trước → sau | CLS trước → sau     | Long task lớn nhất trước → sau |
| --------- | --------------- | ------------------- | ------------------------------ |
| 1440×1000 | 4836 → 2328 ms  | 0.000130 → 0.000130 | 2081 → 443 ms                  |
| 390×844   | 2232 → 1624 ms  | 0.000207 → 0.000207 | 925 → 634 ms                   |

Tổng resource được script ghi nhận: 801,711 → 1,339,313 byte. Chunk 3D ~640 KB minified / 162 KB gzip, tải riêng; Vite vẫn cảnh báo chunk >500 KB. Long task còn đáng kể ở CPU 4x; giới hạn mật độ/mobile, DPR và render rate đã áp dụng nhưng chưa đo GPU/FPS trên điện thoại thật. JSON gốc: `output/qa/before-3d-performance.json`, `output/qa/after-3d-performance.json`.

## Chỉnh sửa / hoàn tác riêng hiệu ứng

- Cường độ/tốc độ và hình học: `components/interface/stageScene.ts`.
- Logo, route, reveal và tilt: `stage3d.css` và `components/Motion.tsx`.
- Tải scene/fallback: `components/interface/RibbonField.tsx`.
- Có thể gỡ import `stage3d.css`, phần `logo-pieces` và scene Three để quay lại hiệu ứng cũ; không reset các file chứa công việc khác. Không cần migration.
