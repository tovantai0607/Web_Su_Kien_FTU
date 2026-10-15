# Nguồn logo thay thế ngày 15/10/2026

Theo yêu cầu người dùng, hai biểu trưng FTU/Hội Sinh viên được thay bằng ảnh rõ từ website của đơn vị. File được tải về dự án để không phụ thuộc hotlink.

| File                                      | Kích thước  | Nguồn                                                                                  |
| ----------------------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| `apps/web/public/images/ftu-official.png` | 354 × 354   | https://thongtintuyensinh.ftu.edu.vn/FTU-logo.png — cổng tuyển sinh FTU                |
| `apps/web/public/images/hsv-official.png` | 1000 × 1000 | https://hoisinhvien.com.vn/images/hsv-logo.png — cổng thông tin Hội Sinh viên Việt Nam |

Giữ nguyên file ảnh tải về, không tái tạo biểu trưng. Đoàn Thanh niên, LiS, COSMO và UNI tiếp tục lấy từ dãy logo người dùng cung cấp.

Người dùng yêu cầu thêm viền và làm rõ chữ FTUCHARM. Chữ FTUCHARM được dựng bằng SVG text với font Playfair Display hiện có, màu chuyển sắc và stroke mảnh; dòng DUYÊN DÁNG NGOẠI THƯƠNG dùng Manrope có stroke mảnh. Biểu tượng FTUCHARM dùng ảnh nền trong suốt 900 × 734 sẵn có. Đây là bản hiển thị web theo yêu cầu, không phải file nhận diện vector gốc của BTC.

Desktop giữ thứ tự một hàng; điện thoại giữ ba hàng không ô nền, không cuộn ngang. E2E hai project desktop/mobile kiểm tra ở 320, 390, 768, 1440px đạt. Lint/typecheck đạt. Không thay database; chưa push/deploy các thay đổi local.

## Cập nhật Đoàn Thanh niên và FTUYours

- `apps/web/public/images/youth-union-emblem.svg`: lấy nguyên nhóm đường nét huy hiệu từ [Flag of HCM Communist Youth Union.svg trên Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Flag_of_HCM_Communist_Youth_Union.svg), tác giả Hwi.padam, dựa theo tác phẩm Huỳnh Văn Thuận; trang nguồn ghi public domain. Bỏ nền cờ đỏ và phép biến đổi thu nhỏ của bản cờ; giữ nguyên các đường nét, chữ và màu của huy hiệu, đặt viewBox riêng 450 × 490 để hiển thị rõ ở mọi mật độ điểm ảnh. Đối chiếu hình thức với thông báo mẫu huy hiệu của Trung ương Đoàn: https://doanthanhnien.vn/chi-tiet/thong-bao-trung-uong-doan-tncs-ho-chi-minh-thong-nhat-mau-huy-hieu-doan-5412.
- `apps/web/public/images/ftuyours-original.png`: sao chép nguyên file người dùng cung cấp `D:/download/FTUYours Logo (1).png`, 826 × 826 có alpha; không vẽ lại hoặc thay màu, không dùng bản crop nhỏ từ dãy logo cũ.
- Bốn huy hiệu FTU / Đoàn / Hội / FTUYours dùng cùng vùng 140 × 140 trong SVG, căn giữa cùng hàng, cùng khoảng cách 25 đơn vị; giữ tỷ lệ bằng `xMidYMid meet`, không kéo méo hình. Giữ bố cục responsive hiện tại và không thêm ô nền.
