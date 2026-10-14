# MASTER PROMPT — CÀI ĐẶT VÀ CẤU HÌNH AI SKILLS CHO OPENAI CODEX

## Quyết định bổ sung đã chốt ngày 14/10/2026

Lịch giữ ngày/tháng trong ảnh và dùng năm **2027**. Giữ quota **30 phút**, không gia hạn retry; không giới hạn mỗi đơn hoặc tổng vé/tài khoản ngoài quota còn lại. Hoàn tất lưu thành công cấp quyền vote ngay, không hủy/hoàn/thu hồi sau đó. BTC cấu hình giá/quota/combo/QR; nghiệm thu local bằng dữ liệu giả và DEMO, không chuyển tiền thật. Supabase có dữ liệu thật nên không migration/tạo fixture/đo tải online. Kịch bản tải local 500→1.000, 2 phút/mức, 70% xem/20% giữ-minh chứng-Hoàn tất/10% vote, p95<2s, lỗi<1%, không trùng/vượt quota đã được duyệt.

Người dùng yêu cầu hoàn tất tất cả các giai đoạn trong lượt này; yêu cầu đó thay giới hạn một giai đoạn/lượt của prompt cũ cho công việc đã được giao. Không tự deploy, push, gửi email hay thao tác database thật.

Luồng đã triển khai dùng chung Auth/tickets/votes và các bảng quota bổ sung; contract/bằng chứng tại [nghiệm thu](../docs/supplement-acceptance.md), cấu hình/bàn giao tại [runbook](../docs/supplement-runbook.md). Tiến độ chính thức xem `tiến độn.docx`, không suy từ nhật ký nghiệm thu cũ.


Bạn là Senior AI Development Engineer, Full-stack Architect, UI/UX Designer, Database Architect và DevOps Engineer.

Tôi muốn bạn thiết lập một môi trường AI-assisted development chuyên nghiệp cho OpenAI Codex để hỗ trợ phát triển website hiện tại và các dự án website về sau.

## 1. MỤC TIÊU

Tự động kiểm tra, cài đặt, cấu hình và tích hợp các AI Skills chất lượng cao vào Codex.

Các kỹ năng cần phục vụ:

- UI/UX Design
- Design System
- Frontend Development
- React / Next.js
- Responsive Design
- Accessibility
- Backend Architecture
- API Development
- Database Architecture
- PostgreSQL
- Supabase
- Database Security
- Web Application Security
- Automated Testing
- Performance Optimization
- Deployment và DevOps

Ưu tiên kỹ năng có nguồn gốc chính thức, mã nguồn mở, được duy trì và tương thích với OpenAI Codex.

## 2. KIỂM TRA MÔI TRƯỜNG

Trước khi cài đặt:

1. Xác định hệ điều hành và shell hiện tại.
2. Kiểm tra phiên bản Codex, Node.js, npm, npx và Git.
3. Kiểm tra thư mục làm việc hiện tại.
4. Kiểm tra thư mục ~/.codex/ và .agents/skills/.
5. Liệt kê toàn bộ skills và custom agents đã có.
6. Phát hiện những skill đã tồn tại để tránh cài trùng.
7. Kiểm tra các công cụ hỗ trợ lệnh `npx skills`.
8. Xác định cách cài skill tương thích với phiên bản Codex hiện tại.

Không ghi đè bất kỳ file cấu hình hiện có nào nếu chưa kiểm tra nội dung.

## 3. CÀI ĐẶT BỘ SKILLS

### Nhóm A — UI/UX & Design System

Cài đặt:

**1. UI/UX Pro Max**

Repository:
https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

Lệnh tham khảo:

npx ui-ux-pro-max-cli init --ai codex

**2. Frontend Design**

Repository:
https://github.com/anthropics/skills

Lệnh tham khảo:

npx skills add anthropics/skills --skill frontend-design

**3. Web Design Guidelines**

Repository:
https://github.com/vercel-labs/agent-skills

Lệnh tham khảo:

npx skills add vercel-labs/agent-skills --skill web-design-guidelines

**4. Building Components**

Repository:
https://github.com/vercel/components.build

Lệnh tham khảo:

npx skills add vercel/components.build --skill building-components

### Nhóm B — Frontend Engineering

**5. React Best Practices**

Repository:
https://github.com/vercel-labs/agent-skills

Lệnh tham khảo:

npx skills add vercel-labs/agent-skills --skill react-best-practices

### Nhóm C — Database Engineering

**6. Supabase Skills**

Repository:
https://github.com/supabase/agent-skills

Lệnh tham khảo:

npx skills add supabase/agent-skills --skill supabase

**7. Supabase PostgreSQL Best Practices**

Repository:
https://github.com/supabase/agent-skills

Lệnh tham khảo:

npx skills add supabase/agent-skills --skill supabase-postgres-best-practices

**8. Prisma CLI Skill**

Repository:
https://github.com/prisma/skills

Lệnh tham khảo:

npx skills add prisma/skills --skill prisma-cli

### Nhóm D — Testing

**9. Webapp Testing**

Repository:
https://github.com/anthropics/skills

Lệnh tham khảo:

npx skills add anthropics/skills --skill webapp-testing

### Nhóm E — Bảo mật, kiến trúc và triển khai

Tìm kiếm thêm những skill đáng tin cậy, tương thích với Codex cho:

- Web Security
- OWASP Top 10
- API Security
- Authentication & Authorization
- Database Schema Design
- PostgreSQL Query Optimization
- Next.js Architecture
- TypeScript Best Practices
- Playwright Testing
- Load Testing
- Performance Optimization
- Cloudflare Deployment
- Vercel Deployment
- CI/CD

Chỉ lựa chọn nguồn đáng tin cậy và có tài liệu cài đặt rõ ràng.

Không tự tạo tên repository, URL hoặc lệnh cài đặt không tồn tại.

## 4. NGUYÊN TẮC CÀI ĐẶT

Đối với mỗi skill:

1. Kiểm tra repository có tồn tại và truy cập được.
2. Đọc README và SKILL.md.
3. Kiểm tra hướng dẫn hỗ trợ Codex.
4. Xác định lệnh cài đặt hiện hành.
5. Kiểm tra nguồn script và các thao tác mà script yêu cầu.
6. Cài đặt skill bằng phương thức phù hợp.
7. Kiểm tra các file sau khi cài.
8. Kiểm tra Codex có thể nhận diện skill.
9. Ghi nhận kết quả thành công hoặc lỗi.

Các lệnh trong prompt là lệnh tham khảo, không được mặc định rằng chúng còn chính xác.

Nếu một skill không tồn tại, không tương thích hoặc không thể xác minh, hãy bỏ qua và giải thích nguyên nhân.

Nếu một skill đã có sẵn, không cài trùng.

Không sử dụng các lệnh cài đặt không rõ nguồn gốc hoặc yêu cầu quyền quản trị không cần thiết.

## 5. PHẠM VI CÀI ĐẶT

Ưu tiên cài các skill dùng chung vào phạm vi người dùng để có thể sử dụng trong nhiều dự án Codex.

Đối với các quy tắc riêng của website hiện tại, hãy đặt trong thư mục dự án.

Không đưa toàn bộ skills vào source code nếu không cần thiết.

Không xóa, thay đổi hoặc ghi đè cấu hình Codex hiện có mà chưa xác minh.

## 6. TÍCH HỢP VỚI AGENTS.MD

Kiểm tra file AGENTS.md hiện tại.

Nếu chưa tồn tại, tạo file cấu hình phù hợp.

Nếu đã tồn tại, bổ sung quy tắc mà không xóa hướng dẫn cũ.

Thiết lập các quy tắc:

### Khi thiết kế UI

- Ưu tiên UI/UX Pro Max và Frontend Design.
- Xây dựng design system trước khi triển khai giao diện lớn.
- Đảm bảo responsive và accessibility.
- Không tạo giao diện thiếu nhất quán giữa các trang.

### Khi viết frontend

- Ưu tiên React Best Practices.
- Tổ chức component có thể tái sử dụng.
- Kiểm tra TypeScript.
- Tối ưu performance.
- Tránh code trùng lặp.

### Khi thiết kế database

- Ưu tiên Supabase PostgreSQL Best Practices.
- Thiết kế schema có primary key, foreign key và constraints phù hợp.
- Đề xuất indexes theo truy vấn thực tế.
- Thiết lập RLS khi cần.
- Phân tích transaction và race condition.
- Viết migration thay vì thay đổi production database trực tiếp.

### Khi kiểm thử

- Sử dụng Webapp Testing.
- Kiểm tra các luồng nghiệp vụ chính.
- Viết test cho trường hợp thành công và thất bại.
- Kiểm tra responsive.
- Kiểm tra bảo mật trước khi triển khai.

### Khi triển khai

- Không đưa secrets vào source code.
- Không tự ý deploy production.
- Kiểm tra môi trường và biến cấu hình.
- Đảm bảo có khả năng rollback.
- Ưu tiên những phương án vận hành tiết kiệm và ổn định.

## 7. NGỮ CẢNH WEBSITE HIỆN TẠI

## Skill nghiệp vụ bắt buộc cho phần bán vé

Đọc `.agents/skills/ftu-ticket-sales/SKILL.md` và `references/requirements.md` của skill trước khi lập kế hoạch hoặc sửa luồng vé/QR/minh chứng/database/vote. Đây là skill từ bosung.docx và các xác nhận mới nhất; mã R01–R14 dùng để kiểm tra từng mục. Không dùng mô tả payment/check-in/email/hủy đơn cũ để mở rộng phạm vi. File bổ sung và ảnh được giữ làm nguồn; không sửa nguồn để hợp thức hóa phương án.

Dự án hiện tại là website tổ chức cuộc thi hoa khôi sinh viên, gồm:

Giai đoạn 1:

- Website giới thiệu cuộc thi.
- Đăng ký thí sinh.
- Xác nhận đăng ký qua email.
- Quản lý thông tin thí sinh.

Giai đoạn 2 (nghiệp vụ cập nhật 14/10/2026):

- Bán theo loại/cụm vé, số lượng và combo; không chọn số ghế.
- Không giới hạn tổng số vé/tài khoản; hết quota vé sớm thì chuyển sang vé thường đang mở.
- Nhập thông tin người mua, xem QR chuyển khoản, gửi ảnh minh chứng, bấm Hoàn tất.
- Khi server lưu Hoàn tất thành công, ghi nhận số vé để vote ngay; không chờ BTC duyệt/email.
- Không tích hợp payOS/SePay/webhook trong luồng hiện hành.
- Email vé do bên khác gửi thủ công; người thứ hai bàn giao dữ liệu, không xây email vé tự động.
- Không có nhiệm vụ check-in; chỉ QR chuyển khoản, nhận minh chứng và lưu database đúng mẫu.

Giai đoạn 3:

- Vote theo vòng/hạng mục: mỗi vé ghi nhận từ đơn Hoàn tất một lượt/hạng mục; N vé có N lượt.
- Quản lý phiên, thời gian server và tính toàn vẹn phiếu bầu.
- Mục tiêu 500–1.000 đồng thời phải chốt workload và đo, không tự tuyên bố đạt.

Đọc `NGHIEP_VU_HIEN_HANH.md`, `Nhiemvu.md`, `bosung.docx`, `tiến độn.docx` và nghiệm thu mới. Không dùng tiến độ2/11 trước triển khai làm trạng thái hiện tại; không yêu cầu cài lại các SKILL.md dùng chung trên máy.

Phạm vi mới nhất: Không có nhiệm vụ check-in, camera quét vé, QR vào cửa, mapping QR/check-in hoặc email vé tự động. Không dùng payOS/SePay/webhook; chỉ hiển thị QR chuyển khoản rồi nhận minh chứng/lưu dữ liệu. Không xóa code/schema/check-in cũ của phần dùng chung trong lượt sửa tài liệu.

Mẫu lưu database: Mã vé, Thông tin, Minh chứng chuyển khoản, Loại vé, Số lượng, Combo.

| Ngày năm 2027  | Nội dung đúng ảnh bổ sung                                                  |
| -------------- | -------------------------------------------------------------------------- |
| 15/2–6/3       | Người dùng chỉ xem                                                         |
| 7/3            | Mở đơn đăng ký thí sinh                                                    |
| 21/3           | Đóng đơn đăng ký thí sinh                                                  |
| 29/3           | Mở bán sớm 2 ngày; khoảng 100 vé, dự kiến khoảng 2 giờ hết thì khóa vé sớm |
| Sau đợt vé sớm | Cập nhật giá, bán vé thường                                                |
| Đến 24/4       | Bán vé thường                                                              |
| 25/4           | Bán kết; mở và đóng vote trong ngày, cửa sổ 10 phút                        |
| 26/4           | Mở vé sớm chung kết khoảng 2 giờ, số vé theo BTC quy định                  |
| 10/5–11/5      | Cập nhật ảnh những người vào bán kết, đúng chữ trong ảnh                   |

Năm 2027 theo xác nhận mới nhất; thay quyết định 2026 trước đó. 26/4 là ngày mở vé sớm chung kết, không được tự đổi thành ngày tổ chức chung kết. Ảnh chưa ghi ngày tổ chức chung kết hay giờ cụ thể; chỉ các phần phụ thuộc thông tin này cần chốt. Lịch đã có phải ghi đúng, không được nói toàn bộ lịch chưa có.

Website cần ưu tiên bảo mật, trải nghiệm trên điện thoại và chi phí vận hành thấp.

Không mặc định framework hoặc kiến trúc hiện tại. Hãy kiểm tra codebase trước khi đề xuất công nghệ hay thay đổi cấu trúc.

## 8. TẠO BÁO CÁO SAU CÀI ĐẶT

Sau khi hoàn tất, tạo file:

CODEX_SKILLS_SETUP_REPORT.md

Báo cáo gồm:

1. Thông tin môi trường.
2. Danh sách skills đã có trước khi cài.
3. Danh sách skills cài đặt thành công.
4. Danh sách skills không thể cài và lý do.
5. Vị trí lưu trữ từng skill.
6. Kết quả kiểm tra tương thích.
7. Những thay đổi đã thực hiện với AGENTS.md.
8. Hướng dẫn sử dụng từng nhóm skill.
9. Prompt mẫu để gọi các skill khi lập trình.
10. Những điểm cần xử lý thủ công, nếu có.

## 9. KIỂM TRA CUỐI CÙNG

Sau khi cài đặt:

- Liệt kê các skill Codex nhận diện được.
- Xác minh không có skill trùng tên gây xung đột.
- Kiểm tra đường dẫn và các file SKILL.md.
- Kiểm tra AGENTS.md.
- Xác định các skill thích hợp nhất cho dự án.
- Thử một tác vụ phân tích không chỉnh sửa code để xác nhận các hướng dẫn có thể được áp dụng.

Không được báo cài đặt thành công nếu chưa xác minh được.

## 10. QUY TẮC AN TOÀN

Được phép thực hiện các bước kiểm tra và cài đặt các skill đã liệt kê khi đã xác minh nguồn và nội dung script.

Không được:

- Xóa source code dự án.
- Xóa database.
- Thay đổi production.
- Deploy website.
- Thay đổi secrets.
- Ghi đè cấu hình quan trọng.
- Chạy lệnh nguy hiểm.
- Cài skill không rõ nguồn gốc.

Nếu một thao tác có thể gây thay đổi lớn hoặc rủi ro, phải yêu cầu tôi xác nhận trước.

## 11. BẮT ĐẦU THỰC HIỆN

Hãy bắt đầu ngay theo thứ tự:

1. Kiểm tra môi trường và các skill hiện có.
2. Xác minh repository, tài liệu và lệnh cài đặt.
3. Cài các skill đã được liệt kê và tương thích.
4. Thiết lập cấu hình dùng chung và AGENTS.md.
5. Kiểm tra kết quả cài đặt.
6. Tạo báo cáo hoàn chỉnh.

Không dừng ở việc giải thích lý thuyết hoặc chỉ cung cấp lệnh.

Hãy thực sự thực hiện các bước cài đặt trong môi trường được cấp quyền, báo cáo trung thực kết quả và chỉ hỏi tôi khi cần xác nhận thao tác có rủi ro.
