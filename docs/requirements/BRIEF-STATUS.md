# Chú thích cho bản yêu cầu gốc

`ORIGINAL-BRIEF.md` là bản sao **từng byte** của bản yêu cầu gốc (`c:\Users\HawkDev\Desktop\CLAUDE.md`, 924 dòng, SHA-256 `7aefabd96192650d6665ad2c76c1f97f3acf726de4e147de350e94da369a9c82`). Không bao giờ sửa file đó. **File này là nơi duy nhất** ghi mục nào của bản gốc đã bị thay.

Cách đọc:
- **CURRENT**: vẫn áp dụng như bản gốc.
- **CURRENT + bổ sung**: vẫn áp dụng, có quyết định thêm chi tiết (không thay nghĩa).
- **MỘT PHẦN SUPERSEDED**: một số ý đã bị thay; các ý còn lại vẫn áp dụng.
- **SUPERSEDED**: cả mục đã bị thay.
- **NOT SCHEDULED**: vẫn là yêu cầu, chưa xếp vào giai đoạn nào (xem `docs/ROADMAP.md`).
- **REVIEW**: hiện trạng dự án khác bản gốc nhưng chưa có quyết định đã xác nhận; chưa được coi là đã thay bản gốc, chờ người dùng quyết.

Căn cứ dạng `#n` là số thứ tự trong bảng trạng thái của `docs/DECISIONS.md`.

**Quan hệ giữa bản gốc và quyết định** (người dùng xác nhận 2026-11-15):
- `ORIGINAL-BRIEF.md` luôn giữ nguyên văn; không sửa bản gốc để khớp với quyết định.
- Chỉ quyết định người dùng **đã xác nhận** mới có hiệu lực: hàng trong bảng "Nguyên văn" của `docs/DECISIONS.md` có trạng thái CURRENT (đã xác nhận, đang áp dụng) hoặc DEFERRED (đã xác nhận nhưng chủ động hoãn thực hiện; chỉ khi có căn cứ rõ ràng người dùng đã đồng ý hoãn). REVIEW / PENDING: chưa có quyết định cuối cùng. Hàng SUPERSEDED không còn hiệu lực.
- Quyết định đã xác nhận có thể thay đổi một yêu cầu của bản gốc, nhưng bảng dưới đây phải ghi rõ ý nào bị thay, thay bằng gì và căn cứ.
- Đề xuất, mục REVIEW và PENDING (mục "Chờ xác nhận" của `docs/DECISIONS.md`) **không** phải quyết định có hiệu lực và không thay được yêu cầu của bản gốc.
- Không có quy tắc chung kiểu "mọi nội dung trong `docs/DECISIONS.md` đều thắng bản gốc". Ý nào của bản gốc không được bảng dưới đây ghi là bị thay thì vẫn áp dụng như bản gốc.

**Lưu ý đánh số giai đoạn:** bản gốc §13 chia 5 giai đoạn (1 Phân tích · 2 UI/UX · 3 Frontend · 4 Backend · 5 Kiểm thử). Dự án đang dùng cách chia GĐ0–GĐ7 trong `docs/ROADMAP.md` làm **kế hoạch vận hành**; người dùng đã chấp thuận kế hoạch này (2026-11-14, khi cho phép bắt đầu Giai đoạn 0). Việc **thay chính thức** cách chia của bản gốc bằng GĐ0–GĐ7 **chưa được xác nhận là quyết định** (REVIEW, xem hàng §13 bên dưới). "Giai đoạn 5" ở hai nơi là hai việc khác nhau (bản gốc: Kiểm thử; dự án: Admin).

| Mục bản gốc | Dòng | Trạng thái | Ý đã bị thay → thay bởi | Căn cứ |
|---|---|---|---|---|
| Tiêu đề "EASTERN FANTASY ASSET MARKETPLACE" | 1 | SUPERSEDED | Tên thương hiệu là "Asset Game MMORPG 2D" | #12 |
| Tiêu đề phụ "Website thương mại điện tử chuyên bán tài nguyên đồ họa game 2D" | 2 | CURRENT | — | — |
| 1. Tổng quan dự án | 4–30 | CURRENT | — (Marketplace đầy đủ, không phải Landing Page vẫn đúng) | — |
| 2.1 Phong cách đồ họa | 33–45 | CURRENT | — | — |
| 2.2 Phong cách giao diện | 46–70 | CURRENT + bổ sung | Thêm giao diện sáng (tối vẫn mặc định); khung dashboard | #24, #18, #19 |
| 2.3 Typography | 71–92 | CURRENT + bổ sung | Font đã chốt: Charm / Noto Serif Display / Be Vietnam Pro; Ma Shan Zheng chỉ cho chữ Hán trang trí | #14 |
| 3. 21 nhóm Assets (danh sách 01–21) | 93–348 | CURRENT | — (đủ 21 nhóm, slug ở `docs/PRODUCT.md`) | — |
| 3. Câu cuối: "Mỗi danh mục cần có hình ảnh đại diện, mô tả, số lượng sản phẩm và **trang hiển thị** các bộ Assets liên quan" | 350 | MỘT PHẦN SUPERSEDED | Danh mục là **các phần bên trong mỗi bộ**; không còn trang danh mục riêng. Icon và mô tả VI/EN/ZH vẫn có | #15 |
| 4. Mô hình kinh doanh (Freemium + bán lẻ) | 352–357 | CURRENT | — | #8 |
| 4.1 Free Assets | 358–370 | CURRENT + bổ sung | Phải đăng nhập để tải; 2 lượt/bộ/tài khoản, mua thêm +2 lượt / 10.000 ₫. "Theo giấy phép" → "Lợi ích" của gói Free | #28, #23 |
| 4.2 Premium Assets | 371–385 | CURRENT + bổ sung | Tải không giới hạn, chốt chống bot 100 lượt/giờ | #28 |
| 4.3 Bundle Assets | 386–403 | SUPERSEDED | Bỏ Bundle; mỗi sản phẩm là một bộ trọn gói A→Z | #5, #15 |
| 4.4 Quy tắc kinh doanh — dòng "Bundle Assets: thanh toán theo giá Bundle" | 404–415 | MỘT PHẦN SUPERSEDED | Dòng Bundle bị thay; mọi dòng khác (không Membership/Subscription, mua 1 bộ không sở hữu bộ khác, không lộ link file trả phí…) CURRENT | #15, #8, #27 |
| 5.1 Trang chủ (Home) | 418–442 | SUPERSEDED | Không có trang chủ; `/` vào thẳng Cửa hàng. Các khối (nổi bật, mới, bán chạy, Bundle, đánh giá…) không còn trang để đặt | #18, #11 |
| 5.2 Trang cửa hàng (Shop) | 443–461 | MỘT PHẦN SUPERSEDED | Bỏ "Lọc theo danh mục"; bỏ "Lọc theo định dạng file"; "Lọc Free/Premium/Bundle" → Free/Premium; lọc giá ở thanh công cụ | #15, #16, #17 |
| 5.3 Trang danh mục (Category) | 462–472 | SUPERSEDED | Bỏ trang danh mục | #15 |
| 5.4 Trang chi tiết sản phẩm | 473–496 | MỘT PHẦN SUPERSEDED | "License" → mục "Lợi ích"; "Loại FREE / PREMIUM / BUNDLE" → FREE / PREMIUM. "Đánh giá", "Nhận xét": có khung trống, chức năng NOT SCHEDULED | #23, #15; ROADMAP |
| 5.5 Trang giỏ hàng | 497–510 | CURRENT | — | — |
| 5.6 Trang thanh toán | 511–524 | CURRENT + bổ sung | Hiện chỉ có Demo Payment, cấm ở production; cổng thật ở GĐ6 | #3 |
| 5.7 Thư viện cá nhân | 525–538 | MỘT PHẦN SUPERSEDED | "Bundle đã sở hữu" bị thay (không còn Bundle); "Giấy phép sử dụng" → "Lợi ích" | #15, #23 |
| 5.8 Tài khoản người dùng | 539–550 | CURRENT + bổ sung | "Quên mật khẩu" hoãn sang GĐ6; đã làm ở bước 6.2 (2026-11-20) | #26, #38 |
| 5.9 Các trang bổ sung — About, FAQ, License & Terms, Privacy, Refund | 551–560 | CURRENT (đã làm 2026-11-22) | Người dùng yêu cầu làm 2026-11-22: 5 trang (License & Terms gộp vào Điều khoản sử dụng; quyền dùng từng bộ là mục Lợi ích), link pháp lý dưới dòng bản quyền, không phải nhóm menu; nội dung mẫu chờ người dùng sửa | #20, #23, #57 |
| 5.9 — Contact | 551–560 | MỘT PHẦN SUPERSEDED | Liên hệ là nút chat nổi (danh sách kênh), không phải mục menu | #20 |
| 5.9 — 404 Not Found | 551–560 | CURRENT | — (đã có) | — |
| 6. Câu mở đầu: "Xây dựng hệ thống quản trị để chủ website có thể quản lý hoạt động kinh doanh." | 563 | CURRENT | — (khu Admin riêng `/admin`, đang làm ở GĐ5) | #29; ROADMAP (bảng GĐ5) |
| 6. Admin — Quản lý sản phẩm | 565–580 | MỘT PHẦN SUPERSEDED | "Chọn FREE / PREMIUM / BUNDLE" → FREE / PREMIUM; "Chọn danh mục" → các phần của bộ; "Quản lý License": NOT SCHEDULED. Phần còn lại đã làm ở bước 5.2–5.3 (5.3 chờ nghiệm thu) | #15, #23; ROADMAP |
| 6. Admin — Quản lý danh mục | 581–588 | NOT SCHEDULED | Vẫn là yêu cầu, chưa xếp giai đoạn | ROADMAP |
| 6. Admin — Quản lý đơn hàng | 589–596 | CURRENT | Kế hoạch bước 5.4 | ROADMAP (bảng GĐ5) |
| 6. Admin — Quản lý người dùng | 597–603 | CURRENT | Kế hoạch bước 5.5 | ROADMAP (bảng GĐ5) |
| 6. Admin — Dashboard thống kê | 604–613 | CURRENT | Ô tổng quan ở bước 5.1; biểu đồ doanh thu ở bước 5.7 | ROADMAP (bảng GĐ5) |
| 7. Hệ thống ngôn ngữ (VI, EN) | 614–705 | CURRENT + bổ sung | Thêm tiếng Trung giản thể (ZH): mọi quy tắc VI/EN áp cho cả ZH; có thêm `zh.json`. Câu "Nếu nội dung tiếng Anh chưa được nhập, sử dụng bản dịch dự phòng hợp lý" (dòng 693): với nội dung bộ asset, thay bằng #39 (2026-11-20): bộ chưa viết ở ngôn ngữ nào thì bị ẩn ở ngôn ngữ đó, không dùng bản dự phòng | #13, #39 |
| 8. UX/UI | 706–723 | CURRENT + bổ sung | Khung dashboard thay header/footer kiểu website | #18, #19 |
| 9. Quy chuẩn sản phẩm và file download | 724–763 | CURRENT + bổ sung | File bán chỉ ở bucket private, link ký hạn ngắn; kiểm tra quyền trước khi tải | #27 |
| 10. License — giấy phép sử dụng | 764–785 | MỘT PHẦN SUPERSEDED | Không dùng chữ "Giấy phép" và không nêu tên mức Personal / Commercial / Extended; thay bằng "Lợi ích" theo gói. **Các câu hỏi phải trả lời rõ** (game thương mại? chỉnh sửa? nhiều dự án? phân phối lại? bán lại?) vẫn CURRENT | #4, #21, #22, #23 |
| 11. Yêu cầu kỹ thuật | 786–811 | CURRENT + bổ sung | Next.js + PostgreSQL (Neon) + Prisma + R2 | #1, #7 |
| 12. Dữ liệu demo — số lượng (≥ 25 sản phẩm, 4 Character, 4 Map…, Bundle) | 812–839 | REVIEW | **Chưa xác nhận:** thay "tối thiểu 25 sản phẩm" và các con số tối thiểu theo từng nhóm bằng hiện trạng 10 bộ A→Z demo (8 Premium, 2 Free), mỗi bộ 6–21 phần, mọi danh mục đều có mặt. Nguồn của hiện trạng: `CLAUDE.md` cũ §11 (ghi "thay bằng (2026-11-14)"); không có quyết định trong `docs/DECISIONS.md`. **Đã có căn cứ:** không Bundle (#15); ảnh và thông số demo phải ghi rõ DEMO (#6, CURRENT) | #15, #6 (phần đã có căn cứ); `CLAUDE.md` cũ §11 (nguồn hiện trạng, chưa xác nhận) |
| 13. Quy trình triển khai (5 giai đoạn) | 840–894 | REVIEW | Nguyên tắc "làm theo giai đoạn, kiểm tra trước khi qua giai đoạn sau" vẫn áp dụng như bản gốc. Dự án vận hành theo cách chia GĐ0–GĐ7 trong `docs/ROADMAP.md`, là kế hoạch vận hành người dùng đã chấp thuận (2026-11-14, khi cho phép bắt đầu Giai đoạn 0). **Chưa xác nhận:** việc thay chính thức 5 giai đoạn của bản gốc bằng cách chia này (chưa có quyết định trong `docs/DECISIONS.md`); nội dung cụ thể trong từng ô của bảng GĐ cũng không vì thế mà thành quyết định | `docs/ROADMAP.md`; `CLAUDE.md` cũ §12 (nguồn hiện trạng); tin nhắn người dùng 2026-11-14 (chấp thuận kế hoạch, không phải quyết định thay bản gốc) |
| 14. Yêu cầu đầu ra | 895–924 | MỘT PHẦN SUPERSEDED | Ý 3 "Free, Premium và Bundle" → Free, Premium; ý 8 "VI/EN" → VI/EN/ZH; ý 7 "Admin quản lý sản phẩm và đơn hàng" đang làm ở GĐ5. Các ý còn lại CURRENT | #15, #13, #29 |
