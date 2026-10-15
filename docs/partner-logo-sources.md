# Nguồn logo thay thế ngày 15/10/2026

Theo yêu cầu người dùng, hai biểu trưng FTU/Hội Sinh viên được thay bằng ảnh rõ từ website của đơn vị. File được tải về dự án để không phụ thuộc hotlink.

| File                                      | Kích thước  | Nguồn                                                                                  |
| ----------------------------------------- | ----------- | -------------------------------------------------------------------------------------- |
| `apps/web/public/images/ftu-official.png` | 354 × 354   | https://thongtintuyensinh.ftu.edu.vn/FTU-logo.png — cổng tuyển sinh FTU                |
| `apps/web/public/images/hsv-official.png` | 1000 × 1000 | https://hoisinhvien.com.vn/images/hsv-logo.png — cổng thông tin Hội Sinh viên Việt Nam |

Giữ nguyên file ảnh tải về, không tái tạo biểu trưng. Đoàn Thanh niên, LiS, COSMO và UNI tiếp tục lấy từ dãy logo người dùng cung cấp.

Người dùng yêu cầu thêm viền và làm rõ chữ FTUCHARM. Chữ FTUCHARM được dựng bằng SVG text với font Playfair Display hiện có, màu chuyển sắc và stroke mảnh; dòng DUYÊN DÁNG NGOẠI THƯƠNG dùng Manrope có stroke mảnh. Biểu tượng FTUCHARM dùng ảnh nền trong suốt 900 × 734 sẵn có. Đây là bản hiển thị web theo yêu cầu, không phải file nhận diện vector gốc của BTC.

Desktop giữ thứ tự một hàng; điện thoại giữ ba hàng không ô nền, không cuộn ngang. E2E hai project desktop/mobile kiểm tra ở 320, 390, 768, 1440px đạt. Lint/typecheck đạt. Không thay database; chưa push/deploy các thay đổi local.
