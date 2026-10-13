# Thêm logo nhà tài trợ

Trang chủ và trang Đồng hành dùng chung `SponsorWall`. Khi chưa có nhà tài trợ, bốn ô ghi rõ “Sắp công bố”.

1. Đặt logo đã được duyệt trong `apps/web/public/images/sponsors/`. Tên file dùng chữ, số, dấu gạch ngang/gạch dưới; hỗ trợ WebP, PNG, JPG, JPEG, AVIF. Ưu tiên nền trong suốt và chiều ngang khoảng 480px.
2. Thêm nhà tài trợ qua trang quản trị (cần backend và tài khoản có quyền), điền đường dẫn logo như `/images/sponsors/ten-doi-tac.webp`, website HTTPS, hạng tài trợ và bật công bố. Liên kết đúng mùa thi đang dùng.
3. Với bản preview hoặc logo cố định, có thể thêm vào `sponsorLogos` tại `apps/web/src/config/site-content.ts`:

```ts
{
  id: 'doi-tac-01',
  name: 'Tên nhà tài trợ đã xác nhận',
  tier: 'gold', // diamond | gold | silver | partner
  url: 'https://example.com', // thay bằng website chính thức
  logo_url: '/images/sponsors/ten-doi-tac.webp',
  published: true,
}
```

Chọn một cách nhập cho mỗi nhà tài trợ để tránh trùng. Đưa file logo vào bản build tiếp theo; CMS lưu đường dẫn, chưa có tính năng upload logo. Không dùng SVG hoặc đường dẫn ảnh ngoài domain. Khi không có ảnh, website hiển thị tên nhà tài trợ.
