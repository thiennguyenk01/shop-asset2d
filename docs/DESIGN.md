# Thiết kế giao diện

Skill evon:ui-ux đọc file này trước khi dựng. Sửa tay được. Khi file này khác code: code chỉ là **bằng chứng về hiện trạng**, không phải quyết định. Nếu phần khác nhau thuộc một quyết định đã xác nhận (`docs/DECISIONS.md`) thì **quyết định thắng**: báo người dùng, sửa code theo quyết định sau khi người dùng đồng ý. Nếu không thuộc quyết định nào: cập nhật file này theo code và ghi rõ là hiện trạng. Nếu không chắc, hỏi người dùng.
File này là **nguồn chính thức về UI/UX** của dự án: phần "Nền tảng thiết kế" bên dưới chuyển nguyên văn từ `CLAUDE.md` §9 cũ (2026-11-15). Quy tắc đa ngôn ngữ (định dạng tiền, ngày, 3 ngôn ngữ): `docs/ARCHITECTURE.md` §6.

## Sản phẩm
- Sản phẩm: chợ bán bộ asset HD Pixel Art trọn gói A→Z (tới 21 phần) cho game MMORPG 2D tiên hiệp / kiếm hiệp
- Người dùng: người làm game indie, studio nhỏ, người làm game bằng AI
- Việc chính: tìm bộ hợp thể loại game trong ngân sách; kiểm bộ có đủ phần + lợi ích của gói; mua hoặc tải bộ miễn phí
- Nền tảng: máy tính trước, điện thoại để lướt
- Điểm khác biệt: một bộ đủ dựng cả game, cùng nét vẽ; không thuê bao

## Giao diện
- Khung: dashboard — sidebar trái `w-64` thu về dải icon `w-16` (nút ở đầu thanh trên, nhớ theo trình duyệt), thanh trên `h-16` mang tên trang (`<h1>`); mobile: thanh tab dưới (Cửa hàng, Premium, Miễn phí, Thư viện, Giỏ hàng, Thêm; Premium thêm theo #40)
- **Khung dashboard & thanh dưới đáy:** biến CSS `--tabbar-h` (globals.css) = chiều cao thanh tab mobile, `0px` từ `lg`. `<main>` có `pb-(--tabbar-h)`; thanh danh mục sản phẩm đặt `bottom-(--tabbar-h)` (mobile nằm ngay trên thanh tab, desktop `lg:left-64` để không đè sidebar); toast ở `bottom: --tabbar-h + --bottom-bar-height`. Không còn header/footer kiểu website; bản quyền nằm cuối sidebar (desktop) và trong sheet "Thêm" (mobile).
- Phong cách: tối là mặc định (P10), có giao diện sáng (nút theme bên trái nút ngôn ngữ; nền trắng ngà #F5F0E5, sidebar kem nhạt #EAE1D0, vàng cổ #B58A35, chữ nâu mực #352B20, viền #D9CBB2 — chỉ đổi giá trị token trong `globals.css`), cổ phong; gradient chỉ ở nút chính, nhãn Premium, nút chat, chữ thương hiệu
- Màu nhấn: vàng kim `gold-*` (`app/globals.css` `@theme`); mục đang chọn = nền `gold-500/10` + chữ `gold-300`
- Vai màu: Mua ngay gradient vàng · Thêm vào giỏ viền vàng · Tải miễn phí ngọc bích đặc · Miễn phí/Premium = ngọc bích/vàng · giá chữ vàng
- Đường kẻ: một token `bronze-700` cho mọi viền card, vạch chia, khung lớp nổi; ô nhập/nút lọc `bronze-600`
- Lớp nổi: `components/ui/overlay-styles.ts` (khung bo 16px, mục 40px, khe 4px, chuyển động `animate-overlay`)
- Vòng focus: giữ vòng vàng toàn cục của dự án (đè luật khoá 16 của skill)

## Người dùng dặn
Nhãn: **[#n]** = quyết định đã xác nhận (`docs/DECISIONS.md` #n) · **[REVIEW]** / **[PENDING]** = đã có trong code nhưng chưa phải quyết định (mục "Chờ xác nhận" của `docs/DECISIONS.md`) · **[Hiện trạng code]** = đang có trong code, chưa có quyết định hay yêu cầu được ghi nhận.
- **[#18]** Không có trang chủ; `/` vào thẳng Cửa hàng
- **[#20]** Liên hệ là nút chat nổi góc dưới phải (danh sách kênh), không phải mục menu; kênh ở `lib/contact-channels.ts`
- **[#20]** Không có nhóm "Pháp lý" trong menu
- **[#32]** Nút chuông Thông báo ở thanh trên, ngay bên trái nút tài khoản (`layout/notifications-button.tsx`); ảnh mẫu của người dùng là căn cứ tham khảo giao diện. **[Hiện trạng code]** Khung "Thông báo" dạng popover, mỗi dòng: icon tròn, nội dung, "loại · thời gian". Chưa có tài khoản → hiện "Chưa có thông báo", không dựng thông báo giả
- **[Hiện trạng code]** Bản quyền chỉ ghi "© năm Asset Game MMORPG 2D", không có "Bảo lưu mọi quyền"
- **[#23]** Trang bộ asset có mục "Lợi ích" (không phải "Giấy phép"/"Điều khoản"), chỉ hiện cột của gói Free hoặc Premium
- **[#15]** Thanh danh mục dưới đáy trang bộ asset: cuộn ngang, gạch chân vàng phần đang xem
- **[#17, #16, #15]** Lọc giá là thanh trượt 2 đầu ở thanh công cụ; không lọc định dạng file, không lọc danh mục
- Trang bộ asset: **[REVIEW]** nút "← Quay lại Cửa hàng" đưa về đúng danh sách đã lọc (2026-11-14); **[REVIEW]** nút "Lên đầu trang" nằm ngay trên nút chat (2026-11-14); **[REVIEW]** cột mua ngắn, dính khi cuộn, "Tổng số asset" nổi bật (2026-11-15); **[PENDING]** ảnh mỗi phần tối đa 4 ô + "+N", dải ảnh một hàng, trình xem toàn màn hình (2026-11-15). Chi tiết: `docs/PROGRESS.md`. Trạng thái quyết định: REVIEW / PENDING ở `docs/DECISIONS.md`.
- **[REVIEW]** Trang Thống kê của khách: không có biểu đồ, chỉ ô số và danh sách (2026-11-14; trạng thái REVIEW ở `docs/DECISIONS.md`).
- **[#40]** Khu khách: Thống kê chỉ liệt kê 3 đơn gần đây; Đơn hàng phân trang, tối đa 5 đơn mỗi trang; thanh tab mobile có Premium cạnh Miễn phí. **[PENDING]** Thứ tự tab, chữ nhãn 11px dưới 360px và các chi tiết khác: `docs/DECISIONS.md` mục "Chờ xác nhận".
- **[#37]** Admin: Thống kê nằm trong trang Tổng quan, không có trang Thống kê riêng; "Cần chú ý" là nút chuông trên thanh trên khu Admin, bên trái nút tài khoản (`components/admin/admin-attention.tsx`, dùng chung `layout/notifications-button.tsx` với #32); Đơn hàng gần đây / Bán chạy / Free tải nhiều là ba khung đều nhau trên một hàng ngang. **[PENDING]** Các chi tiết do Claude chọn (5 đơn gần đây, số cột theo màn hình, thứ tự trang): `docs/DECISIONS.md` mục "Chờ xác nhận".
- **[#46]** Admin Đơn hàng: khung Tài chính chỉ có ô số (không biểu đồ); tab "Chuyển khoản chưa khớp" cạnh tab "Đơn hàng"; 7 đơn mỗi trang. Trang một khách: khung "Đơn tay" với ô chọn Loại đơn (Tặng bộ / Chuyển khoản riêng), chỉ chuyển khoản riêng mới có ô số tiền đã nhận, số tiền tự thêm dấu chấm; Thư viện và Lịch sử mua hàng 5 dòng mỗi trang. **[PENDING]** Các chi tiết do Claude chọn: `docs/DECISIONS.md` mục "Chờ xác nhận".
- **[#47]** Điện thoại: lưới bộ asset 2 bộ một hàng; Tổng quan Admin 2 ô một hàng. **[PENDING]** Điểm chuyển cột, ô Doanh thu chiếm trọn hàng, nút lọc mở khi chạm-nhấc: `docs/DECISIONS.md` mục "Chờ xác nhận".
- **[#49]** Admin: kích thước / độ phân giải, phần mềm tương thích, định dạng file chọn bằng nút như Thể loại / Phong cách, từ danh sách soạn sẵn; "Có gì mới" của phiên bản chỉ cần 1 ngôn ngữ. **[PENDING]** Nội dung danh sách, khung chọn gập lại: `docs/DECISIONS.md` mục "Chờ xác nhận".
- **[#50]** Admin trang sửa bộ: các mục chia thành thẻ, mỗi lúc một thẻ; khung "Sẵn sàng đăng bán" cho biết còn thiếu gì; Ảnh, Các phần, File tải dùng được ngay, không phải lưu trước. **[#51]** "Xóa bộ" ở dưới khung "Sẵn sàng đăng bán", "Lưu thay đổi" ngay bên trái. **[PENDING]** 5 thẻ, bộ nháp tạo ngay khi bấm "Thêm bộ asset", nút Lưu hiện ở mọi thẻ: `docs/DECISIONS.md` mục "Chờ xác nhận".
- **[#51]** Admin Tổng quan: nhãn tháng của biểu đồ không chồng nhau; không có bảng số liệu, ấn vào một cột thì hiện doanh thu của ngày / tháng đó. Ô chọn (danh sách lựa chọn) của khu Admin theo giao diện của web, không dùng ô chọn của trình duyệt. **[PENDING]** Chưa chọn cột thì chỉ hiện gợi ý; áp ô chọn mới cho mọi ô chọn của Admin: `docs/DECISIONS.md` mục "Chờ xác nhận".
- **[#52]** Admin trang sửa một phần: chia thành thẻ, "Ảnh của phần" là thẻ riêng. **[PENDING]** 3 thẻ, nút Lưu / Xóa phần cạnh tiêu đề: `docs/DECISIONS.md` mục "Chờ xác nhận".

## Màn đã dựng
- `/shop` Cửa hàng: lưới thực thể (entity-grid; 2 cột tới dưới 1024px, 3 cột, 4 cột từ 1536px), thanh công cụ 2 hàng (tìm / lọc dạng menu + Sắp xếp), 12 bộ/trang
- `/product/[slug]` Chi tiết bộ: trang chi tiết bản ghi, cột mua 22rem dính bên phải từ khung 70rem, các phần trong một khung
- `/cart`, `/checkout` (+ `/checkout/demo/[txn]`, `/checkout/result/[code]`): giỏ hàng, thanh toán Demo, trang kết quả
- Tài khoản (nhóm `(account)`): `/login`, `/register`, `/account`, `/library` (Thư viện), `/orders` (5 đơn mỗi trang) + `/orders/[code]`, `/stats` (Thống kê, không biểu đồ, 3 đơn gần đây)
- Trang bộ asset: trình xem ảnh toàn màn hình (`components/product/media-lightbox.tsx`), ảnh mỗi phần tối đa 4 ô (`section-media.tsx`)
- Khu Admin `/admin` (khung riêng `components/admin/admin-shell.tsx`, chuông "Cần chú ý" trên thanh trên): Tổng quan (5 ô tổng: điện thoại và tablet 2 ô một hàng, ô Doanh thu chiếm trọn hàng; Doanh thu theo thời gian 7 ngày / 30 ngày / 12 tháng với biểu đồ cột SVG `components/admin/revenue-chart.tsx`, ấn vào cột thì khung dưới biểu đồ hiện doanh thu của mốc đó, không có bảng số liệu; ba khung Đơn hàng gần đây · Bán chạy · Free tải nhiều); Bộ asset (danh sách; "Thêm bộ asset" tạo bộ nháp rồi mở trang sửa; trang sửa: đầu trang có ảnh bìa, trạng thái, nút Đăng bán / Ẩn, 5 thẻ Thông tin · Nội dung · Ảnh · Các phần · File tải (`components/admin/pack-editor.tsx`), khung "Sẵn sàng đăng bán" bên phải với "Lưu thay đổi" · "Xóa bộ"); trang sửa một phần: 3 thẻ Thông tin · Nội dung · Ảnh, "Lưu thay đổi" · "Xóa phần" cạnh tiêu đề; ô chọn của mọi bộ lọc là `components/ui/select-menu.tsx`; Đơn hàng (khung Tài chính 6 ô, 7 đơn mỗi trang, + chi tiết, hoàn tiền; tab Chuyển khoản chưa khớp); Người dùng (+ chi tiết: Thư viện và Lịch sử mua hàng 5 dòng mỗi trang, khoá, Đơn tay: tặng bộ / chuyển khoản riêng); Mã giảm giá (+ tạo / sửa); Nhật ký; Cài đặt

## Nền tảng thiết kế (chuyển nguyên văn từ `CLAUDE.md` §9 cũ)

- Phong cách cao cấp, có bản sắc cổ phong phương Đông, **không giống web TMĐT thông thường**, nhưng không lạm dụng hiệu ứng hay làm giảm khả năng đọc.
- Màu (tokens trong khối `@theme` của `src/app/globals.css`): vàng kim `gold-*`, đen huyền `ink-*`, nâu cổ `bronze-*`, đỏ son `cinnabar-*`, xanh ngọc `jade-*`, trắng ngà `ivory-*`. **Tối là mặc định, có thêm giao diện sáng** (nút mặt trời/mặt trăng `layout/theme-toggle.tsx` bên trái nút ngôn ngữ; `<html data-theme="light">`, nhớ trong localStorage, áp trước khi vẽ bằng `layout/init-scripts.ts`). Giao diện sáng **chỉ khai báo lại giá trị token** trong `globals.css` (khối `html[data-theme="light"]`): nền `ink-950` #F5F0E5 (trắng ngà), sidebar/thẻ `ink-900` #EAE1D0 (kem nhạt), vàng cổ `gold-500` #B58A35, chữ `ivory-100` #352B20 (nâu mực), viền `bronze-700` #D9CBB2 — component giữ nguyên class. Chữ trên nền màu dùng token cố định: `text-soot` trên nền vàng, `text-paper` trên ngọc bích/đỏ son/con dấu. Biến thể CSS `light:` có sẵn khi cần. Hằng số dùng trong script inline **không được** export từ file `"use client"` (server nhận client reference → chèn hàm báo lỗi). Đỏ son chỉ dùng làm nền (con dấu, nhãn) với chữ trắng ngà, không dùng làm màu chữ trên nền tối.
  - **Không tách `@theme` ra file `@import` riêng**: loader Tailwind của Turbopack biên dịch file đó riêng, token không tới được Tailwind (đã gặp lỗi này).
- Component nền ở `src/components/ui/` (Button, Badge, Seal, OrnateFrame, CloudDivider, Container/SectionHeading, Input, Spinner/Empty/Error/SuccessState, Modal, Toast/`useToast`, Tooltip). Component **không chứa chữ cứng** — chữ truyền vào từ bản dịch (kể cả `aria-label`, `closeLabel`). Ghép class bằng `cn()` (`src/lib/cn.ts`).
- Trang xem trước Design System: `/vi/design-system`, `/en/design-system` (trả 404 trên production).
- Không dùng `truncate`/`overflow-hidden` + `leading-none` trên chữ tiếng Việt: dấu phía trên bị cắt mất (đã gặp ở logo).
- Trang trí: hoa văn phương Đông, phù văn, con dấu đỏ, mây/núi/rồng/phượng, ánh sáng linh khí, khung viền cổ.
- **Ảnh pixel art:** dùng `image-rendering: pixelated`, phóng to theo bội số nguyên, không để Next Image làm mờ (dùng `unoptimized` hoặc loader phù hợp cho ảnh pixel).
- **Font:**
  - Ma Shan Zheng / Liu Jian Mao Cao / Zhi Mang Xing **không hỗ trợ đầy đủ tiếng Việt** → chỉ dùng cho **chữ Hán trang trí** (con dấu, họa tiết).
  - Tiêu đề/logo/banner tiếng Việt: font thư pháp/serif cổ **có subset `vietnamese`**, phải kiểm tra render chuỗi `Tiên Hiệp Đạo Môn – ă â ê ô ơ ư đ ỹ ặ ợ` trước khi dùng.
  - Nội dung, giá, nút, giao dịch: font dễ đọc (Be Vietnam Pro).
  - **Đã chốt (GĐ1, đã test render dấu):** `font-display` = **Charm** (logo, hero, banner, tên bộ sưu tập) · `font-heading` = **Noto Serif Display** (tiêu đề mục, h1–h3) · `font-sans` = **Be Vietnam Pro** (mặc định) · `font-han` = **Ma Shan Zheng** subset tự host `src/fonts/ma-shan-zheng-decor.woff2` (chỉ 23 chữ Hán trang trí, danh sách trong `src/fonts/README.md`). Cấu hình ở `src/styles/fonts.ts`.
  - **Tiếng Trung (`zh`):** các font trên không có chữ Hán → trình duyệt tự rơi xuống font kế tiếp trong stack: `font-display` → Ma Shan Zheng đầy đủ (`fontHanText`, tự host, không preload); `font-heading` → Noto Serif SC/Songti/SimSun; `font-sans` → PingFang SC/Microsoft YaHei/Noto Sans SC. Không dùng dấu "——" trong bản dịch zh (Be Vietnam Pro vẽ thành "– –"); dùng dấu câu Trung "，。·".
- Responsive Desktop/Tablet/Mobile; card sản phẩm đồng nhất; hover tinh tế; chuyển trang mượt; nút mua nổi bật; luôn có trạng thái Loading/Empty/Error/Success và thông báo sau mỗi thao tác.
