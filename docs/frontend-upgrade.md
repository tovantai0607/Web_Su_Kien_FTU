# FTUCharm — nâng cấp frontend pastel

Ngày 13/10/2026. Phạm vi lần này: giao diện, component trình bày và kiểm thử; giữ nguyên backend, endpoint, schema, quyền và quy tắc đăng ký/vé/bình chọn. Thay đổi auth trước đó được ghi riêng trong `ui-auth-refresh.md`.

## Audit và hướng thiết kế

Stack đang có: React 19.3.0, React Router 7.18.4, Vite 8.3.4, Tailwind 4.3.3, TypeScript 6.0.3; Radix Dialog/Slot/Toast, CVA, Lucide 1.56.0, React Query, React Hook Form. Không chuyển framework hay nâng major của dependency cũ.

Giao diện trước lần này đã có lazy routes, reveal bằng IntersectionObserver, vương miện WebP, focus và reduced-motion. Còn thiếu wordmark/nội dung hero theo ảnh, countdown, carousel và trạng thái vé trực quan. Các trang dùng nhiều màu tím cứng; dashboard hiển thị số 0 trong lúc chưa có dữ liệu. Giữ các pattern hoạt động tốt và thay đúng lớp trình bày.

Ưu tiên triển khai:

1. Token, typography, hero đúng ảnh và chữ mẫu.
2. Motion dùng chung, countdown dựa trên dữ liệu, marquee nhà tài trợ.
3. Thí sinh, gallery, bình chọn, trạng thái vé chưa mở bán.
4. Tài khoản, dashboard, keyboard/a11y và đo tải local.

Hero hai cột desktop: tiêu đề serif/CTA bên trái, ảnh vương miện lớn bên phải. Mobile xếp dọc. Giữ nguyên “Duyên dáng Ngoại thương”, “FTUCHARM”, hai câu mô tả và hai CTA trong ảnh thứ hai. Dải lavender–xanh nhạt–hồng lấy từ ảnh thứ nhất; banner Lê Phương Nghi được giữ ở mục Dấu ấn 2025, không gán nhầm cho mùa hiện tại.

| Token                | Giá trị / vai trò                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| Primary              | `#E88EAD`                                                                                              |
| Background / Surface | `#FFF9FC` / `#FFFFFF`                                                                                  |
| Accent / Border      | `#F8DDE8` / `#F0DCE5`                                                                                  |
| Text / Muted         | `#332631` / `#685563`                                                                                  |
| CTA / Link           | `#834565` — đủ đậm cho chữ trắng nhỏ                                                                   |
| Secondary atmosphere | `#D9D7F6`, `#CBD8FA`                                                                                   |
| Font                 | Playfair Display cho hero, tiêu đề biên tập; Manrope cho nội dung/form. Self-hosted, có dấu tiếng Việt |
| Radius               | Card 20px; input 12px; CTA pill                                                                        |
| Spacing              | 8/16/24/32/48; section 48–88px                                                                         |
| Responsive           | 600px mobile, 900px stack, 1100px navigation; kiểm tra đến 320px                                       |
| Motion               | 180–350ms phản hồi, 650ms tiêu đề; Aurora 24s, marquee 35s; crown dùng CSS view timeline               |

## Component và nguồn

Chỉ thêm dependency runtime `motion@14.2.0` và `embla-carousel-react@8.6.0`, đều MIT. Radix, CVA và Lucide hiện có được dùng lại. Không chạy CLI shadcn để ghi đè theme/config, không thêm GSAP, WebGL hoặc engine chuyển động thứ hai.

| Khu vực          | Component / cách tích hợp                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trang chủ        | Aceternity Aurora được điều chỉnh sang CSS transform; React Bits BlurText cho tiêu đề; Magic UI Marquee cho logo thật; EventCountdown cho mốc sắp tới; reveal/crown hiện hữu |
| Thí sinh         | Card dùng shared UI/Radix theo kiến trúc shadcn; Motion hover; giữ tìm kiếm/bộ lọc/phân trang; thêm số kết quả                                                               |
| Hồ sơ / thư viện | Carousel theo cấu trúc và keyboard pattern shadcn + Embla; next/prev, phím trái/phải, trạng thái slide; Radix lightbox                                                       |
| Bình chọn        | Shared card/dialog; Motion Primitives AnimatedGroup cho card và thành công; hiển thị loading/error và phiếu đã ghi nhận từ dữ liệu hiện hữu                                  |
| Vé               | Thẻ đêm thi, sơ đồ minh họa ghi rõ, tóm tắt vé và thanh toán disabled theo trạng thái chưa mở bán                                                                            |
| Authentication   | Cùng token/form/surface, nhấn màu pastel, giữ nguyên xác thực và quy trình bảo mật trước đó                                                                                  |
| Dashboard        | Metric cards và biểu đồ thanh CSS từ số liệu overview, trạng thái chưa có dữ liệu khác số 0; active navigation, bảng, thông báo                                              |

Nguồn đọc và điều chỉnh:

- [Aceternity Aurora](https://ui.aceternity.com/components/aurora-background), [registry](https://ui.aceternity.com/registry/aurora-background.json), [licence](https://ui.aceternity.com/licence). Dùng component tải miễn phí trong website end product; không dùng template Pro hay phân phối lại như bộ component. Bỏ nested main, repaint background liên tục và fixed background.
- [React Bits BlurText source](https://github.com/DavidHDev/react-bits/blob/main/src/ts-default/TextAnimations/BlurText/BlurText.tsx), [license](licenses/react-bits.txt). MIT + Commons Clause, cho phép dùng trong website; không bán/phân phối component riêng. Bản điều chỉnh giảm blur và không ẩn nội dung hero lúc tải.
- [Magic UI Marquee source](https://github.com/magicuidesign/magicui/blob/main/apps/www/registry/magicui/marquee.tsx), [MIT](licenses/magic-ui.txt). Hai track; duplicate `inert`/`aria-hidden`; pause khi hover, chuyển sang danh sách tĩnh khi focus/reduced-motion/dừng chuyển động.
- [Motion Primitives AnimatedGroup](https://github.com/ibelick/motion-primitives/blob/main/components/core/animated-group.tsx), [MIT](licenses/motion-primitives.txt). Giữ preset fade đơn giản, key theo child; tuân theo motion context.
- [shadcn Carousel](https://ui.shadcn.com/docs/components/carousel), [registry Radix](https://ui.shadcn.com/r/styles/new-york/carousel.json), [MIT](licenses/shadcn-ui.txt). Tái dùng Button/Modal hiện hữu; không cài thêm base-ui thay Radix.
- [Motion installation](https://motion.dev/docs/react-installation), [Embla React v8](https://www.embla-carousel.com/docs/v8/get-started/react).

## File chính

- `apps/web/src/refined.css`: token và giao diện chung, Aurora, marquee, countdown, gallery, vé, tài khoản, dashboard.
- `apps/web/src/components/interface/`: MotionSystem, Aurora, Marquee, PhotoCarousel.
- `apps/web/src/components/EventCountdown.tsx`, `AdminOverview.tsx`.
- `apps/web/src/pages/Home.tsx`, `PublicPages.tsx`, `Voting.tsx`, `Admin.tsx`.
- `apps/web/src/App.tsx`: motion context chung theo nút dừng và thiết lập hệ điều hành.
- `apps/web/src/components/Content.tsx`, `SponsorWall.tsx`, `Motion.tsx`: nối component và ảnh responsive.
- `apps/web/public/images/crown-pearl-700.webp`: 104,714 bytes; bản 1400px hiện hữu 385,478 bytes. `srcset` cho trình duyệt chọn theo viewport/DPR.
- `apps/web/index.html`: theme-color mới.
- `apps/web/vite.config.ts`: tách SDK hiện hữu thành vendor cacheable trong build thật; giữ automatic splitting ở preview để không kéo SDK vào lần tải đầu.
- `packages/ui/src/index.tsx`: bổ sung role hợp lệ cho skeleton loading, được phát hiện trong lượt axe với chunk tải trễ.
- `tests/unit/frontend-display.test.ts`, `tests/e2e/site.spec.ts`; `scripts/measure-frontend.mjs`.
- `package.json`, `package-lock.json`, `docs/licenses/`.

## Accessibility và hiệu năng

Motion được tải qua LazyMotion; carousel là chunk riêng chỉ được yêu cầu khi hồ sơ có ảnh hoặc vào thư viện. Không thêm scroll listener chạy mỗi frame. Hero có kích thước ảnh cố định và fetchPriority; ảnh phía dưới lazy-load. Font tự host. Nội dung heading đọc một lần với screen reader. Carousel không tự chạy, có nút 44px và keyboard; ảnh không hoạt động bị inert. Marquee không tạo link trùng trong cây accessibility.

Script đo chỉ truy cập `127.0.0.1:5173`, cache tắt, CPU slowdown 4×, mạng local không throttle, DPR 1, một mẫu desktop/mobile. Đo LCP, CLS session window, FCP, longest task và resource bytes bằng browser APIs/CDP. Không có Chrome DevTools MCP trong phiên; không có trace insight hoặc INP/field data. Đây không phải chứng nhận Core Web Vitals hay khả năng phục vụ 2.000–3.000 người đồng thời; [Google phân biệt số đo lab và field](https://web.dev/articles/vitals).

Kết quả mẫu cuối trên preview build (dao động theo tải máy):

| Viewport    | LCP     | FCP     | CLS      | Longest task | Resource encoded bytes |
| ----------- | ------- | ------- | -------- | ------------ | ---------------------- |
| 1440 × 1000 | 1592 ms | 1388 ms | 0.000700 | 537 ms       | 880,634                |
| 390 × 844   | 1148 ms | 944 ms  | 0.000563 | 389 ms       | 599,870                |

Không có JavaScript error trong hai mẫu. Resource bytes bao gồm những ảnh lazy mà trình duyệt tải trước gần viewport; không phải tổng kích thước website. Production build có SDK auth thật, nên số đo preview không thay thế phép đo production/staging.

## Giới hạn dữ liệu và nghiệp vụ

- Lịch hiện chưa có ngày công bố: countdown hiển thị thông báo, không tạo hạn chót giả. Khi có mốc tương lai, tự đếm theo ngày đó; countdown này chỉ để trình bày, không quyết định quyền đăng ký/bình chọn.
- Chưa có logo sponsor thật: giữ bốn ô chờ công bố. Marquee sẽ chạy khi có dữ liệu/config logo.
- API hồ sơ chỉ có một `photo_url`; carousel hồ sơ hiện có tối đa một ảnh và ẩn nút chuyển. Không đọc ảnh đăng ký riêng tư để lấp gallery. Thư viện hiện dùng banner 2025 và ảnh hoa có nhãn minh họa AI.
- Không có API bán vé/chọn/giữ ghế/giỏ hàng/checkout đang hoạt động. Chỉ triển khai phần trình bày trạng thái chưa mở bán, không tạo thanh toán hoặc sơ đồ ghế thật. Cần công việc backend riêng để mở quy trình này.
- Admin và các lượt bình chọn thật cần tài khoản/round/dữ liệu phù hợp. Preview vẫn khóa thao tác; không gửi email, tạo tài khoản, vote hay thay dữ liệu ngoài.

## Kiểm tra và rollback

- `npm run lint`, `npm run typecheck`, production build và preview build: pass.
- `npm test`: 90/90 (bao gồm các test auth/database hiện hữu và 5 test trình bày mới).
- `npm run test:e2e`: 24/24 desktop/mobile. Axe WCAG 2/2.1 AA trên 11 route; 320px không tràn ngang; carousel phím trái/phải/Escape; pause/reduced-motion; tìm kiếm; validation và guard admin/vote/preview.
- Smoke production bundle: 4 route (`/`, đăng nhập, thư viện, admin), chặn request ngoài và mô phỏng API lỗi local, không có JavaScript error.
- `git diff --check`: pass. Backend/shared contracts/database không có diff trong lần nâng cấp.
- Các artifact trình duyệt, production smoke và đo tải ở `output/qa/` (gitignored).

Phép đo phát hiện crown bị tải lặp do image và CSS mask khác request mode. Thêm anonymous CORS cho ảnh cùng origin giúp dùng chung tài nguyên; ảnh 700px dành cho màn hình nhỏ. Đã kiểm tra lại network và hiển thị sau sửa. Motion features là dynamic chunk riêng (~17.85 KB gzip), carousel ~8.53 KB gzip. Trong build thật SDK có chunk ~55.19 KB gzip; không che cảnh báo bằng cách tăng size limit. Vẫn có long task lúc khởi động trên CPU chậm; cần profile thiết bị/network thực trước kết luận INP hoặc phát hành quy mô lớn.

Rollback giao diện: giữ lại auth/security của lần trước; khôi phục riêng các file UI lần này từ bản sao/review và bỏ hai dependency mới nếu không còn import. Không chạy `git reset --hard` vì workspace đang chứa cả thay đổi auth chưa commit. Không có migration, deploy hoặc thay secrets cần rollback.
