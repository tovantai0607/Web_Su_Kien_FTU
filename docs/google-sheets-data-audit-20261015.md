# Kiểm tra dữ liệu Sheet — 15/10/2026

Đã đối chiếu bảng Data, source Apps Script và truy vấn chỉ đọc project Supabase hiện tại; không chạy migration, sửa đơn hay sao chép thông tin khách thật vào Sheet.

## Kết quả

- Sheet trước sửa có nhãn Combo nhưng thiếu số combo. Đã thêm M **Số lượng combo** ở cả `Khách mua vé` và `Database hiện hành`, giữ dữ liệu/validation hiện có; metadata dời sang P:S. Tổng19 cột.
- K là tổng vé của dòng; L là Đơn/Combo2/Combo3; M là số combo: `ticket_quantity / bundle_size` nếu combo,0 nếu vé Đơn. Ví dụ4 vé Combo2 là2 combo. Đây là giá trị suy ra từ K:L, không phải trường nhập số lượng độc lập.
- Có đủ các trường bắt buộc theo bổ sung: mã, bảy thông tin người mua, tham chiếu minh chứng, loại/hạng vé, tổng vé của dòng, nhãn combo và số combo. Mỗi dòng là một loại/combo; một đơn có thể nhiều dòng, không cộng số đơn bằng số dòng.
- Apps Script đã cập nhật đủ vị trí đọc/ghi, trạng thái N, ngày đồng bộ O, UUID/revision/proof/product ở P:S. Installer chặn header không khớp; không đổi schema Supabase để thêm dữ liệu đã suy ra được.

## Supabase tại thời điểm đọc

| Kiểm tra                                                    | Kết quả       |
| ----------------------------------------------------------- | ------------- |
| Tổng yêu cầu                                                | 7             |
| Đã Hoàn tất                                                 | 5             |
| Thiếu một trong7 trường người mua                           | 0             |
| Hoàn tất thiếu tham chiếu ảnh / thiếu metadata ảnh cùng đơn | 0 /0          |
| Số vé cấp không khớp quantity đơn                           | 0             |
| Dòng sai công thức quantity × bundle_size = ticket_quantity | 0             |
| Vé đơn trong các đơn Hoàn tất                               | 4 vé          |
| Combo2 trong các đơn Hoàn tất                               | 2 combo =4 vé |
| Combo3 trong các đơn Hoàn tất                               | 1 combo =3 vé |

Các số trên là snapshot truy vấn, không tự thay đổi theo thời gian. Kiểm tra metadata ảnh không chứng minh blob ảnh đã có online hoặc nội dung minh chứng là thanh toán hợp lệ; team vẫn kiểm tay.

Kiểm tra thêm đều0 lỗi: mã trùng; đơn Hoàn tất thiếu vòng/đợt/mã/thời điểm; dòng thiếu tên hạng/tier/product; tổng vé theo dòng lệch quantity đơn; ảnh gắn sai tài khoản sở hữu.

## Chưa đầy đủ ở môi trường online

Sheet vẫn chỉ có mẫu DEMO, không phải bản sao5 đơn Hoàn tất. Chưa có API HTTPS, Apps Script OAuth/trigger hoặc migration Sheets mới trên Supabase; vì vậy chưa có đồng bộ khách/ảnh online mỗi phút. Đọc docs/google-sheets-sync-plan-20261014.md cho điều kiện kích hoạt. Không gọi bản mẫu là dữ liệu thật đầy đủ.

## Bằng chứng kiểm tra bản sửa

Apps Script unit12/12 đạt, gồm Đơn/Combo2/Combo3, encode/decode số combo và vị trí buyer/proof/UUID/revision sau khi chèn cột. Lint, typecheck và `git diff --check` đạt. Google read-back xác minh header/count/validation/note ở M, nhãn Combo ở L và trạng thái vẫn được giữ ở N; export/render QA vùng K:O của cả hai tab. Không kiểm thử đồng bộ Google–Supabase online vì chưa kích hoạt.
