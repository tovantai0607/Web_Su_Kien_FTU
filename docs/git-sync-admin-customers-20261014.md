# Gộp Git và trang khách mua vé — 14/10/2026

Đã fetch và fast-forward nhánh `web_ftu` tới `origin/main` tại `8115e0f27d051872d4e3f30eda38f3cbc3c999ff`, sau đó khôi phục và gộp công việc local trong cùng thư mục `D:\WED_sk_FTU`. Bốn conflict đã giải quyết; không còn đường dẫn unmerged. Không tạo clone khác, reset, clean, push hoặc deploy. Lần fetch cuối bị lỗi DNS GitHub; bản remote đã tải thành công và gộp là commit trên, không xác nhận được có commit mới hơn sau đó.

Bản sao 59 đường dẫn trước gộp ở `output/git-sync-20261014/before/`; stash `ad23fb2f0e52e9f9564210efc53832af47ecc15d` vẫn được giữ. Nhánh local `main` còn ở `ad30504`; nhánh làm việc hiện tại là `web_ftu`. Word tiến độ giữ nguyên so với trước gộp, không đánh thêm nghiệm thu.

## Quyết định mới đã được người dùng xác nhận

- Dùng Auth của Git mới: SUPER_ADMIN không bắt buộc MFA; các vai trò nhân viên khác tiếp tục theo kiểm tra quyền/MFA của ứng dụng.
- Dùng quy tắc vote của Git/database mới: chỉ SUPER_ADMIN đóng sớm phiên đang mở, phải ghi lý do; phiên đã đóng không được mở lại. VOTE_MANAGER giữ các thao tác khác theo quyền hiện hành, gồm chốt/công bố. Quy tắc này thay đề xuất mở lại và cho VOTE_MANAGER đóng sớm cũ.
- Không thay luồng bổ sung: Hoàn tất lưu thông tin/minh chứng thành công cấp số vé và quyền vote ngay. COMPLETED không xác nhận thực nhận tiền. BTC đối chiếu và gửi email thủ công.

## Link đang chạy trên máy

- [Khách đã mua vé](http://127.0.0.1:5173/admin/ve): sáu cột theo bổ sung, bảy thông tin người mua có nhãn, ảnh riêng tư, phân trang, tổng số đơn, tải lại và CSV của trang hiện tại.
- [Cấu hình vé/combo](http://127.0.0.1:5173/admin?muc=purchase-data).
- [Vé DEMO](http://127.0.0.1:5173/ve/test-giao-dich-demo).
- [Supabase Table Editor](https://supabase.com/dashboard/project/ifgtyslifgegwcguysbb/editor): xem `purchase_requests`, `purchase_allocations`, `purchase_evidence`, `tickets`, `purchase_offers` và `purchase_products`. Dashboard cần tài khoản được cấp quyền project riêng; SUPER_ADMIN website không tự cấp quyền Dashboard.

Tài khoản `huuthinh2k5t1@gmail.com` có email đã xác minh, liên kết Google và SUPER_ADMIN theo truy vấn chỉ đọc trên Supabase. Có thể đăng nhập Google bằng email này rồi dùng menu quản trị mở danh sách khách. Không thay tài khoản, mật khẩu hoặc role; chưa đăng nhập thay người dùng để xác nhận OAuth của tài khoản thật.

Frontend Vite5173 hiện nối backend local8787, không còn là preview tĩnh. Backend xác minh Auth thật, dữ liệu đơn/vé và metadata minh chứng ở Supabase; ảnh thử ở R2 local `.wrangler/state/demo-test`. Giữ thư mục này để xem ảnh sau restart. LIVE2027 vẫn chưa công bố; link thử chỉ cho phép ghi trong scope DEMO đã được duyệt.

## Kiểm tra và giới hạn

- Sau gộp: 180 tests đạt, một native PostgreSQL test skip; 10 E2E Auth/admin đạt trên desktop/mobile. E2E dùng mock Auth/API, kiểm tra admin AAL1 xem danh sách/ảnh/CSV, tải lại, accessibility và tài khoản thường không gọi API dữ liệu khách.
- Typecheck, lint và build đạt; build vẫn có cảnh báo chunk Three lớn. Không suy ra khả năng tải hoặc production readiness từ các kiểm tra này.
- Chạy lại HTTP/browser DEMO với Auth và Supabase thật bằng tài khoản/đơn thử đã có: retry không thêm vé, ảnh private xem được; không tạo thêm đơn bởi các script trong lượt gộp.
- Truy vấn chỉ đọc cuối lượt: 3 đơn COMPLETED, 9 vé SUPPLEMENT; số có thể thay đổi khi người dùng tiếp tục thử. Không sao chép thông tin khách vào báo cáo.
- Local và Supabase có cùng 11 tên/version migration, gồm `reconciled_admin_event_settings` và `admin_optional_mfa`. Không áp migration, đổi schema hoặc tạo role trong lượt này. So tên migration không chứng minh mọi cấu hình runtime đều đã online.

Chạy hai terminal: `npm run dev:demo-db` và `npm run dev -- --strictPort`. File môi trường ignored dùng origin `http://127.0.0.1:5173`; không in khóa. Token Auth giữ trong bộ nhớ theo thiết kế Git mới; tải lại toàn trang có thể cần đăng nhập lại.
