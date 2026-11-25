# Lộ trình

Chỉ kế hoạch: các giai đoạn, trạng thái hiện tại, việc chưa làm. Lịch sử đã làm: `docs/PROGRESS.md`. Quyết định: `docs/DECISIONS.md`.

Cách làm (CLAUDE.md §0): từng bước nhỏ; xong bước nào kiểm tra bước đó, mở web cho người dùng xem, chờ "tiếp tục" rồi mới qua bước sau.

## Các giai đoạn (nguyên văn từ `CLAUDE.md` §12 cũ)

| GĐ | Nội dung | Tiêu chí hoàn thành |
|---|---|---|
| 0 | Khởi tạo: Next.js + TS + Tailwind + next-intl + Prisma (Neon dev branch) + Auth.js skeleton + ESLint/Prettier + Vitest + Playwright + `env.ts` | `dev`/`build`/`lint`/`test` chạy; `/vi` & `/en` hoạt động; cập nhật mục 1 |
| 1 | Design System & Layout: tokens, font (đã test dấu), component UI nền, Header, Footer, nút đổi ngôn ngữ, toast/modal | VI/EN/ZH đầy đủ, responsive, i18n:check pass |
| 2 | Catalog: schema đầy đủ + migration, seed 21 danh mục + ≥25 sản phẩm demo, Home, Shop, Product Detail (bộ A→Z) | Lọc/sắp xếp đúng; nhãn DEMO hiển thị; không chuỗi hardcode |
| 3 | Tài khoản & Giỏ hàng: đăng ký/nhập/hồ sơ/đổi mật khẩu, cart, coupon, gộp giỏ (quên mật khẩu → GĐ6) | Chặn sản phẩm đã sở hữu |
| 4 | Đơn hàng + Demo Payment + Entitlement + Download + Library + Free claim (đăng nhập mới tải; Free 2 lượt/bộ/tài khoản + mua thêm lượt; hộp mời đăng nhập) | Toàn bộ test bảo mật mục 7 pass; demo bị chặn ở production |
| 5 | Admin Dashboard (khu riêng `/admin`). Bước: 5.1 quyền Admin + khung + Tổng quan · 5.2 Sản phẩm (CRUD, bản dịch VI/EN/ZH, các phần, giá, ẩn/hiện, nổi bật) · 5.3 Ảnh & file (upload) · 5.4 Đơn hàng + hoàn tiền (thu hồi Entitlement / trừ DownloadCredit) · 5.5 Người dùng (khóa → tăng sessionVersion, tặng bộ) · 5.6 Mã giảm giá + cài đặt (giá mua thêm lượt) · 5.7 Thống kê doanh thu (biểu đồ) + nhật ký thao tác | USER không truy cập được bất kỳ route/action admin |
| 6 | Email giao dịch VI/EN/ZH, **quên/đặt lại mật khẩu** (bảng `PasswordResetToken` đã có), cron đối soát; tích hợp PayOS/VNPay/MoMo **khi người dùng xác nhận có tài khoản** | Luồng sandbox end-to-end |
| 7 | Kiểm thử tổng thể, bảo mật, hiệu năng, SEO, triển khai Vercel + Neon + R2 | Checklist toàn bộ đạt |

Ghi chú khi chuyển file (2026-11-15), không sửa bảng trên:
- GĐ1: "Header, Footer" sau đó được thay bằng khung dashboard (DECISIONS #18).
- GĐ2: "Home" đã được thay: không còn trang chủ (DECISIONS #18). "≥25 sản phẩm demo": dữ liệu seed hiện có 10 bộ A→Z demo (`docs/PRODUCT.md`), nhưng việc thay con số này **chưa được người dùng xác nhận** (sửa khi nghiệm thu 2026-11-15; REVIEW, xem `docs/requirements/BRIEF-STATUS.md` hàng §12).
- GĐ4 (thêm khi nghiệm thu 2026-11-15): "test bảo mật mục 7" là §7 của `CLAUDE.md` cũ, nay là `docs/ARCHITECTURE.md` §5 (đoạn "Test bắt buộc").
- Cách chia GĐ0–GĐ7 (thêm 2026-11-15): là **kế hoạch vận hành** đã được người dùng chấp thuận (2026-11-14, khi cho phép bắt đầu Giai đoạn 0). Việc thay chính thức 5 giai đoạn của bản gốc vẫn REVIEW (`docs/requirements/BRIEF-STATUS.md` hàng §13). Nội dung cụ thể trong từng ô của bảng trên (vd. GĐ2 "≥25 sản phẩm demo") không vì thế mà thành quyết định.

## Trạng thái hiện tại

| GĐ | Trạng thái |
|---|---|
| 0 | Hoàn thành (2026-11-14) |
| 1 | Hoàn thành (2026-11-14). Chưa có dòng ghi người dùng xác nhận (REVIEW) |
| 2 | Hoàn thành (2026-11-14). Chưa có dòng ghi người dùng xác nhận (REVIEW) |
| 3 | Hoàn thành (2026-11-14), người dùng đã xác nhận |
| 4 | Hoàn thành (2026-11-15), người dùng đã xác nhận 4.1–4.6 |
| 5 | Hoàn thành (2026-11-20). 5.1–5.7 người dùng đã xác nhận (5.3–5.7 ngày 2026-11-19); kiểm tra cuối GĐ5 chạy 2026-11-19; người dùng chọn đóng giai đoạn, các mục còn treo giữ ở "Việc chờ người dùng" · ảnh gọn trên trang bộ (yêu cầu thêm) xong, **chờ xác nhận** |
| 6 | Hoàn thành (2026-11-20). 6.1–6.3 người dùng đã xác nhận; 6.4 cổng thanh toán MoMo (môi trường thử): người dùng đã duyệt tài liệu, trả thử trên app MoMo còn chờ; kiểm tra cuối GĐ6 chạy 2026-11-20; người dùng chọn đóng giai đoạn, các mục còn treo giữ ở "Việc chờ người dùng" |
| 7 | **Đang làm** (từ 2026-11-20; lựa chọn của người dùng: DECISIONS #43) · 7.1 giới hạn số lần đăng nhập sai / thử mã giảm giá: xong, người dùng xác nhận 2026-11-20 · 7.2 rà soát bảo mật: xong, người dùng xác nhận 2026-11-20 · 7.3 hiệu năng + SEO: xong, người dùng xác nhận 2026-11-20 · 7.4 quy trình đưa thay đổi database lên Neon production: xong, người dùng xác nhận 2026-11-21 (lựa chọn: DECISIONS #44) · thanh toán SePay (người dùng yêu cầu làm trước 7.5; DECISIONS #45): cổng chuyển khoản VietQR xong, người dùng xác nhận 2026-11-21 · Admin Đơn hàng (Tài chính, chuyển khoản chưa khớp, đơn tay, phân trang; DECISIONS #46) + giao diện điện thoại 2 cột (#47): xong, người dùng xác nhận 2026-11-21 · xếp lại thư mục `frontend/` · `backend/` · `docs/` (DECISIONS #48): xong, người dùng xác nhận 2026-11-21 · trang sửa bộ asset dạng thẻ, chọn thông số bằng nút, biểu đồ Tổng quan ấn cột, ô chọn mới, trang sửa phần dạng thẻ (DECISIONS #49–#52): xong, người dùng xác nhận 2026-11-21 · 7.5 lưu file trên Cloudflare R2 (DECISIONS #53): xong, người dùng xác nhận 2026-11-21 · 7.6 bản xem trước trên Vercel (DECISIONS #54): xong, đang chạy trên mạng, người dùng xác nhận 2026-11-21 · **7.7** production: đã chuẩn bị phần không cần tài khoản (DECISIONS #55: Admin production, lịch việc định kỳ, kiểm cấu hình; `docs/OPERATIONS.md` §9), người dùng xác nhận 2026-11-22 · email thật qua Resend (DECISIONS #56): code xong, người dùng xác nhận 2026-11-22, chưa gửi thử (chờ tên miền) · 5 trang thông tin (chen vào, người dùng yêu cầu; DECISIONS #57): xong, người dùng xác nhận 2026-11-22 · trang Admin "Dung lượng" (chen vào, người dùng chọn; DECISIONS #58): xong, người dùng xác nhận 2026-11-22 · chế độ "Chỉ dùng gói miễn phí" (chen vào, người dùng yêu cầu; DECISIONS #59): xong, chờ người dùng xác nhận · dòng bản quyền dưới cùng (người dùng yêu cầu; DECISIONS #60): xong, chờ người dùng xác nhận · **còn lại của 7.7:** tên miền (đã mua 2026-11-26, chờ đổi nameserver sang Cloudflare), cổng thanh toán thật, chọn gói Vercel |

## Việc còn lại theo giai đoạn

Chỉ gồm việc mà tài liệu cũ đã ghi rõ giai đoạn (nguồn trong ngoặc).

### GĐ5 — Admin (xong 2026-11-20; chi tiết ở `docs/PROGRESS.md`)
- **5.4** Đơn hàng + hoàn tiền: hoàn tiền thu hồi Entitlement **và trừ lại `DownloadCredit`**; test tích hợp gọi service hoàn tiền thật thay cho bước mô phỏng (bảng GĐ; PROGRESS 4.6; ARCHITECTURE §4 bước 8, §5 "Test bắt buộc").
- **5.5** Người dùng: khoá tài khoản → tăng `sessionVersion`; tặng bộ (bảng GĐ).
- **5.6** Mã giảm giá + cài đặt: giá mua thêm lượt chỉnh được ở Admin (bảng GĐ; DECISIONS #28). Giới hạn dùng mã mỗi người: "thêm ở Admin GĐ5 nếu cần" (PROGRESS 3.4).
- **5.7** Thống kê doanh thu (biểu đồ) + nhật ký thao tác (bảng GĐ). Danh sách thống kê Admin theo yêu cầu: tổng doanh thu, tổng đơn, số sản phẩm, số người dùng, bán chạy, Free tải nhiều, biểu đồ doanh thu theo thời gian (`docs/PRODUCT.md`, danh sách Admin).

### GĐ6 — Email, đối soát, cổng thanh toán (xong 2026-11-20; chi tiết ở `docs/PROGRESS.md`)
- **Kế hoạch các bước (2026-11-20, lựa chọn của người dùng: DECISIONS #38; lựa chọn của Claude: PENDING trong DECISIONS):**
  - **6.1** Nền tảng email: lớp gửi thư dùng chung; ở dev ghi thư ra file; mẫu thư VI/EN/ZH theo ngôn ngữ của khách. *(Xong 2026-11-20, người dùng xác nhận 2026-11-20; xem thử: `npm run mail:preview`.)*
  - **6.2** Quên / đặt lại mật khẩu (thư đầu tiên và duy nhất: đặt lại mật khẩu). *(Xong 2026-11-20, người dùng xác nhận 2026-11-20: trang `/forgot-password`, `/reset-password/<token>`, link "Quên mật khẩu?" ở trang đăng nhập.)*
  - **6.3** Việc chạy định kỳ: đơn chờ quá hạn → EXPIRED; dọn giỏ khách bỏ dở; dọn file tải lên bỏ dở. *(Xong 2026-11-20, người dùng xác nhận 2026-11-20: `/api/cron/reconcile`, `/api/cron/cleanup`, ở dev chạy `npm run cron:run`; lịch chạy trên Vercel đặt khi triển khai ở GĐ7; hỏi cổng thanh toán trước khi cho đơn hết hạn: làm ở 6.4.)*
  - **6.4** Cổng thanh toán MoMo (sandbox trước). *(Xong 2026-11-20, người dùng duyệt tài liệu 2026-11-20; trả thử trên app MoMo còn chờ, xem "Việc chờ người dùng": ví MoMo trên môi trường thử, bật bằng `PAYMENT_PROVIDER=momo`, cách bật và thử ở `docs/OPERATIONS.md` §4; cron đối soát hỏi MoMo trước khi cho đơn hết hạn.)*
- Email giao dịch VI/EN/ZH (bảng GĐ). Thu hẹp theo #38 (2026-11-20): chỉ email đặt lại mật khẩu.
- Quên / đặt lại mật khẩu (DECISIONS #26). *(Làm ở bước 6.2, 2026-11-20.)*
- Cron đối soát: đơn PENDING quá hạn → EXPIRED (bảng GĐ; ARCHITECTURE §4 bước 7). *(Làm ở bước 6.3, 2026-11-20.)*
- Dọn giỏ khách bỏ dở bằng cron (PROGRESS 3.3). *(Làm ở bước 6.3, 2026-11-20.)*
- Dọn object mồ côi khi tải lên bỏ dở (PROGRESS 5.3). *(Làm ở bước 6.3, 2026-11-20.)*
- PayOS / VNPay / MoMo **khi người dùng xác nhận có tài khoản** (bảng GĐ; DECISIONS #3). Người dùng có tài khoản MoMo (#38, 2026-11-20): làm MoMo; PayOS / VNPay vẫn chờ. *(MoMo: làm ở bước 6.4, 2026-11-20, môi trường thử; tạm dừng 2026-11-20 theo #42, xem DEFERRED.)*

### GĐ7 — Kiểm thử tổng thể và triển khai
- **Kế hoạch các bước (2026-11-20, lựa chọn của người dùng: DECISIONS #43; kế hoạch do Claude đề xuất: PENDING trong DECISIONS):**
  - **7.1** Giới hạn số lần đăng nhập sai và số lần thử mã giảm giá, lưu trong Neon. *(Xong 2026-11-20, người dùng xác nhận 2026-11-20.)*
  - **7.2** Rà soát bảo mật toàn web, sửa lỗi tìm được. *(Xong 2026-11-20, người dùng xác nhận 2026-11-20: header bảo mật; giới hạn đăng ký, quên mật khẩu, đổi mật khẩu; cập nhật thư viện. Chi tiết: PROGRESS 7.2.)*
  - **7.3** Hiệu năng + SEO (metadata, sitemap, robots, liên kết giữa các ngôn ngữ). *(Xong 2026-11-20, người dùng xác nhận 2026-11-20: canonical / hreflang / Open Graph, `sitemap.xml`, `robots.txt`; bớt bản dịch gửi xuống trình duyệt; font tiêu đề tự host. Số đo và phần còn lại: PROGRESS 7.3.)*
  - **7.4** Quy trình đưa thay đổi database lên Neon production (thiết kế + script có chốt chặn; chưa chạy). *(Xong 2026-11-20, người dùng xác nhận 2026-11-21: `npm run db:prod:status | db:prod:migrate | db:prod:reference`, người dùng tự chạy (#44); quy trình ở `docs/OPERATIONS.md` §2; chưa chạy gì trên production.)*
  - **SePay** (chen vào trước 7.5, người dùng yêu cầu 2026-11-20; DECISIONS #45): cổng chuyển khoản ngân hàng VietQR qua SePay. *(Cổng + webhook xong 2026-11-21, người dùng xác nhận 2026-11-21; thử trên máy bằng SePay CLI ở Test mode: `docs/OPERATIONS.md` §4.)* Trang Admin xem danh sách chuyển khoản chưa khớp: xong 2026-11-21 trong bước Admin Đơn hàng bên dưới.
  - **Admin Đơn hàng + giao diện điện thoại** (chen vào trước 7.5, người dùng yêu cầu 2026-11-21; DECISIONS #46, #47): khung Tài chính, tab Chuyển khoản chưa khớp, Đơn tay (tặng bộ / chuyển khoản riêng) trên trang của khách, trang Đơn hàng 7 đơn mỗi trang, Thư viện và Lịch sử mua hàng của một khách 5 dòng mỗi trang; điện thoại: 2 bộ một hàng ở khu khách, 2 ô một hàng ở Tổng quan Admin. *(Xong 2026-11-21, người dùng xác nhận 2026-11-21.)*
  - **Xếp lại thư mục** (chen vào trước 7.5, người dùng yêu cầu 2026-11-21; DECISIONS #48): `frontend/` (app Next.js), `backend/` (code server, Prisma, script, test unit / tích hợp), `docs/`; vẫn một app. *(Xong 2026-11-21, người dùng xác nhận 2026-11-21.)* Khi làm 7.6 (Vercel): app nằm ở `frontend/`, lệnh build `npm run build` chạy từ gốc repo, cần chỉnh cấu hình dự án Vercel cho phù hợp.
  - **Trang sửa bộ asset và khu Admin** (chen vào trước 7.5, người dùng yêu cầu 2026-11-21; DECISIONS #49–#52): thông số chọn bằng nút, "Có gì mới" chỉ cần 1 ngôn ngữ; trang sửa bộ dạng thẻ + khung "Sẵn sàng đăng bán" (bản phác A); Tổng quan Admin: nhãn tháng không chồng, bỏ bảng số liệu, ấn cột xem doanh thu; ô chọn mới cho mọi ô chọn của Admin; "Lưu thay đổi" bên trái "Xóa bộ"; trang sửa một phần dạng thẻ. *(Xong 2026-11-21, người dùng xác nhận 2026-11-21.)*
  - **7.5** Lưu file trên Cloudflare R2 (cần tài khoản R2). *(Xong 2026-11-21, người dùng xác nhận 2026-11-21; lựa chọn: DECISIONS #53, ảnh qua tên miền riêng, r2.dev chỉ để thử; cài và kiểm tra: `docs/OPERATIONS.md` §7, `npm run storage:check`. Dev đang chạy trên 2 bucket R2 dev.)*
  - **7.6** Bản xem trước trên Vercel: cổng Demo, nhánh Neon riêng (cần tài khoản Vercel, R2). *(Xong 2026-11-21, người dùng xác nhận 2026-11-21; lựa chọn: DECISIONS #54: GitHub + Vercel, ai có link cũng mở được, database sạch + 10 bộ demo. Đang chạy tại `https://asset2d-git-main-thien-nguyens-projects-bad6033d.vercel.app`; cài đặt: `docs/OPERATIONS.md` §8; lệnh `npm run preview:*`. Hosting giữ Vercel theo #7; tên miền sắp có `asset2d.id.vn`.)*
  - **7.7** Production (cần cổng thanh toán thật và dịch vụ email thật; MoMo đang tạm dừng, #42; SePay đã có ở chế độ thử, #45). *(Việc cần có, ghi 2026-11-21: tên miền `asset2d.id.vn` (người dùng sẽ báo khi có); gói Vercel: Hobby chỉ cho dùng phi thương mại và việc định kỳ chạy 1 lần / ngày, nên bán thật thì hỏi người dùng Vercel Pro hay VPS; bucket R2, token và nhánh Neon production riêng; lên lịch cho `/api/cron/*` (`vercel.json`); dịch vụ email thật; SePay `live`. Chưa chọn gì ngoài những điều đã ghi ở DECISIONS.)* *(Phần không cần tài khoản đã chuẩn bị 2026-11-21, người dùng xác nhận 2026-11-22; lựa chọn: DECISIONS #55: (1) `npm run db:prod:grant -- <email>` / `db:prod:revoke` cấp / bỏ quyền Admin trên web thật, người dùng tự chạy, gõ mã endpoint để xác nhận; (2) `vercel.json` lên lịch `/api/cron/reconcile` và `/api/cron/cleanup` mỗi ngày một lần; (3) `npm run prod:init` / `prod:check` kiểm `.env.vercel-production` trước khi bật; (4) danh sách việc và quy trình chạy thật: `docs/OPERATIONS.md` §9. Ảnh web thật qua tên miền riêng `media.asset2d.id.vn`, không dùng r2.dev. Còn lại: các việc cần tài khoản hoặc quyết định của người dùng ở bảng của §9 (tên miền, R2 production, SePay live, gói Vercel).)* *(Email thật qua Resend: code xong 2026-11-22, người dùng xác nhận 2026-11-22; DECISIONS #56; `MAIL_DRIVER=resend` + `RESEND_API_KEY`, thử bằng `npm run mail:test -- <email>`; người dùng sẽ thử khi có tên miền.)* *(Tên miền: người dùng đã mua `asset2d.id.vn` ở Mắt Bão và thêm vào Cloudflare ngày 2026-11-26; chờ đổi nameserver, xem `docs/OPERATIONS.md` §7.)*
  - **Trang thông tin** (chen vào trong lúc chờ tên miền, người dùng yêu cầu 2026-11-22; DECISIONS #57): Giới thiệu, Câu hỏi thường gặp, Điều khoản sử dụng, Chính sách bảo mật, Chính sách hoàn tiền, 3 ngôn ngữ; Giới thiệu và FAQ ở nhóm "Hỗ trợ", 3 trang pháp lý là link dưới dòng bản quyền; nội dung mẫu trong file dịch. *(Xong 2026-11-22, người dùng xác nhận 2026-11-22; nội dung chờ người dùng đọc và sửa.)*
  - **Trang Admin "Dung lượng"** (chen vào trong lúc chờ tên miền, người dùng chọn 2026-11-22; DECISIONS #58): phần đã dùng của gói miễn phí (database Neon, 2 bucket R2, email Resend 24 giờ / tháng), cảnh báo ở Tổng quan từ 80 %; giới hạn ghi trong code. *(Xong 2026-11-22, người dùng xác nhận 2026-11-22.)*
  - **Chế độ "Chỉ dùng gói miễn phí"** (chen vào trong lúc chờ tên miền, người dùng yêu cầu 2026-11-22; DECISIONS #59): mặc định bật; chặn tải file khi R2 tới 90 %, chặn đăng ký / đặt đơn / mua thêm lượt tải khi database Neon đầy, chặn email quá 100 thư / ngày hoặc 3.000 thư / tháng; tắt ở Admin → Cài đặt bằng cách gõ `OPEN`, có ghi Nhật ký. *(Xong 2026-11-22, chờ người dùng xác nhận.)*
  - **Dòng bản quyền dưới cùng** (người dùng yêu cầu 2026-11-26; DECISIONS #60): dòng © nằm dưới 3 link pháp lý ở sidebar và sheet "Thêm". *(Xong 2026-11-26, chờ người dùng xác nhận.)*
- Kiểm thử tổng thể, bảo mật, hiệu năng, SEO; triển khai Vercel + Neon + R2 (bảng GĐ).
- Driver lưu trữ R2: presigned GET (link tải), presigned PUT (Admin tải lên) (PROGRESS 4.1, 5.3). *(Làm ở bước 7.5, 2026-11-21.)*
- Giới hạn số lần đăng nhập sai và số lần thử mã giảm giá, dùng kho dùng chung (PROGRESS 3.1, 3.4). *(Làm ở bước 7.1, 2026-11-20: kho dùng chung = bảng `RateLimit` trong Neon, #43.)*
- Quy trình áp migration lên production, thiết kế riêng (CLAUDE.md cũ §1).

## NOT SCHEDULED — chưa xếp giai đoạn

Vẫn là yêu cầu. **Không tự đưa vào giai đoạn nào**; hỏi người dùng khi tới lúc làm (người dùng chọn 2026-11-15).

| Chức năng | Nguồn yêu cầu |
|---|---|
| Admin: quản lý danh mục (thêm, sửa, xoá, ảnh, mô tả) | ORIGINAL-BRIEF §6; CLAUDE.md cũ §12 (danh sách Admin) · Người dùng 2026-11-22, nguyên văn (khi chọn việc làm tiếp, sau câu hỏi "quản lý danh mục là sao thế?"): "thôi ko cần, bỏ qua danh mục + đánh giá" (DECISIONS, bảng Nguyên văn, dòng #59). Dòng giữ nguyên, chưa làm; bỏ hẳn khỏi yêu cầu hay chỉ để sau: **REVIEW**, chờ người dùng xác nhận. |
| Admin: quản lý giấy phép / License | ORIGINAL-BRIEF §6 ("Quản lý License"); CLAUDE.md cũ §12 (danh sách Admin) |
| Trang About, FAQ, License & Terms, Privacy Policy, Refund Policy | ORIGINAL-BRIEF §5.9; CLAUDE.md cũ §12 (trang người dùng). Nhóm "Pháp lý" chỉ bị bỏ khỏi menu (DECISIONS #20) · **Đã làm 2026-11-22** theo yêu cầu của người dùng (DECISIONS #57; dòng giữ lại làm lịch sử). |
| Đánh giá và nhận xét sản phẩm (trang bộ đang hiện trạng thái trống; bảng `Review` đã có) | ORIGINAL-BRIEF §5.4; CLAUDE.md cũ §12 · Người dùng 2026-11-22, nguyên văn (khi chọn việc làm tiếp, sau câu hỏi "quản lý danh mục là sao thế?"): "thôi ko cần, bỏ qua danh mục + đánh giá" (DECISIONS, bảng Nguyên văn, dòng #59). Dòng giữ nguyên, chưa làm; bỏ hẳn khỏi yêu cầu hay chỉ để sau: **REVIEW**, chờ người dùng xác nhận. |
| Hiển thị "Có gì mới" của phiên bản ngoài cửa hàng / Thư viện | PROGRESS 5.3 ("Chưa làm") |
| Luồng "chỉnh sửa asset theo nhu cầu" cho khách Premium | CLAUDE.md cũ §11 ("chưa thiết kế — hỏi người dùng khi làm tới") |
| Huỷ đơn PENDING cũ khi đặt đơn mới | PROGRESS 4.2 ("Chưa có") |
| Chặn vượt `maxUses` khi 2 đơn cùng mã thanh toán gần nhau | PROGRESS 4.2 ("Chưa có") |
| Đăng nhập Google OAuth ("có thể thêm sau") | CLAUDE.md cũ §2 |
| Công cụ theo dõi dung lượng các gói miễn phí (R2, Neon…) để không phải trả thêm trong lúc demo | Người dùng nêu 2026-11-21, nguyên văn: "sắp tới sẽ làm tool quản lý dung lượng hàng Free để tránh mục tiêu tôi trả thêm tiền vì project này đang demo nên tôi cần hàng free" (DECISIONS, bảng Nguyên văn, dòng bước 7.5) · **Đã làm 2026-11-22** theo lựa chọn của người dùng: trang Admin "Dung lượng" (DECISIONS #58; dòng giữ lại làm lịch sử). |

## DEFERRED — hoãn có chủ đích

| Việc | Ngày | Ghi chú |
|---|---|---|
| Tự động dịch nội dung EN/ZH (hiện người dùng tự dịch thủ công) | 2026-11-15 | DECISIONS #31. Chưa chọn dịch vụ, nhà cung cấp hay công nghệ dịch; DEFERRED không có nghĩa đã chọn phương án kỹ thuật. Khi làm lại phải hỏi lại: dùng dịch vụ nào (các lựa chọn từng được hỏi: Claude API / DeepL / Google) và cách dịch (tự dịch khi Lưu / nút "Dịch" rồi duyệt). |
| Cổng thanh toán thật: MoMo tạm dừng (code của bước 6.4 giữ nguyên, web chạy cổng Demo); sau này người dùng sẽ thử cổng khác (SePay, VNPay, ZaloPay…) | 2026-11-20 | DECISIONS #42. Chưa chọn cổng nào, chưa xếp giai đoạn; hỏi người dùng khi làm tới. Thêm cổng mới = thêm một provider theo giao diện ở `src/server/modules/payment/providers/types.ts`. *Cập nhật 2026-11-21: người dùng chọn SePay (chuyển khoản VietQR), DECISIONS #45; cổng SePay đã làm, đang chạy ở chế độ thử.* |

## Việc chờ người dùng

- Quyết định mục PENDING "đơn 0 ₫ không hoàn tiền được" (`docs/DECISIONS.md`, ghi khi làm 5.4).
- Thanh toán SePay (DECISIONS #45): xác nhận các chi tiết PENDING (bước SePay đã được xác nhận 2026-11-21); trước khi chạy thật cần tài khoản SePay thật nối với tài khoản ngân hàng nhận tiền của cửa hàng, `SEPAY_MODE=live`, webhook trỏ tới địa chỉ production có ký HMAC; nên thử một lần qua URL công khai trước đó.
- Admin Đơn hàng + giao diện điện thoại (DECISIONS #46, #47): bước đã được xác nhận 2026-11-21; xác nhận các chi tiết PENDING; cho biết nếu "Lịch sử đơn hàng, thư viện … tối đa 5" là trang của khách (Claude đã làm ở trang Admin của một khách; Thư viện `/library` của khách chưa phân trang).
- Xếp lại thư mục (DECISIONS #48): bước đã được xác nhận 2026-11-21; xác nhận các chi tiết PENDING; cho phép xoá bản sao lưu `.backup/before-restructure-2026-11-21.tar` khi đã yên tâm.
- Trang sửa bộ asset và khu Admin (DECISIONS #49–#52): bước đã được xác nhận 2026-11-21; xác nhận các chi tiết PENDING (danh sách thông số soạn sẵn, bộ nháp tạo ngay, nút Lưu ở mọi thẻ, ô chọn mới cho mọi ô chọn của Admin…).
- Lưu file trên R2 (bước 7.5, DECISIONS #53): xác nhận bước và các chi tiết PENDING. Tạo API token R2 mới (cùng quyền, cùng 2 bucket dev), tự điền vào `.env.local` rồi xoá token cũ: khoá của token cũ đã được dán vào khung chat (không ghi giá trị vào tài liệu). Khi có tên miền `asset2d.id.vn`: thêm vào Cloudflare, gắn tên miền phụ vào bucket ảnh, đổi `R2_PUBLIC_BASE_URL` (`docs/OPERATIONS.md` §7).
- Bản xem trước trên Vercel (bước 7.6, DECISIONS #54): xác nhận các chi tiết PENDING (bước 7.6 đã được xác nhận 2026-11-21). Đổi mật khẩu của nhánh Neon `preview` và tạo lại token R2 của bản thử (các giá trị này đã được dán vào khung chat; không ghi giá trị vào tài liệu); khi đổi, cập nhật cả `.env.preview` và Environment Variables của Vercel. Kiểm tra nhánh Neon `preview` đã tắt tự xoá. Đã cấp Admin cho tài khoản `admin_asset2d` trên bản thử (vào được `/vi/admin`); chưa thử đăng ảnh lên một bộ ở bản thử (kiểm R2 từ Admin).
- Chuẩn bị bước 7.7 (DECISIONS #55): xác nhận các chi tiết PENDING (bước đã được xác nhận 2026-11-22). Quyết định còn lại để làm 7.7: gói Vercel (Hobby chỉ phi thương mại), cung cấp tên miền `asset2d.id.vn` khi có, SePay thật. Các khoá đã dán vào khung chat (R2 dev, mật khẩu Neon bản thử, khoá R2 bản thử, mật khẩu Admin bản thử) nên đổi; không ghi giá trị vào tài liệu.
- Email thật qua Resend (DECISIONS #56): xác nhận các chi tiết PENDING (bước đã được xác nhận 2026-11-22). Khi có tên miền: tài khoản Resend, xác minh `asset2d.id.vn` (bản ghi DNS ở Cloudflare), tạo khoá API (tự dán vào `.env.local` / `.env.vercel-production`, không gửi qua chat), rồi `npm run mail:test -- <email>` (`docs/OPERATIONS.md` §9, hàng 5). Thêm dòng `RESEND_API_KEY=` vào `.env.vercel-production` (file tạo từ mẫu cũ chưa có dòng này).
- Trang thông tin (DECISIONS #57): xác nhận các chi tiết PENDING (bước đã được xác nhận 2026-11-22). Đọc và sửa nội dung mẫu của 5 trang (3 ngôn ngữ), nhất là phần là chính sách của cửa hàng: hạn yêu cầu hoàn tiền (mẫu: 7 ngày), các trường hợp được / không được hoàn tiền, giữ dữ liệu đơn hàng khi khách xin xoá tài khoản. Khi nội dung đã đúng, bỏ khung "Nội dung mẫu" (`info.draftNotice`).
- Trang Admin "Dung lượng" (DECISIONS #58): xác nhận các chi tiết PENDING (bước đã được xác nhận 2026-11-22). Khi nhà cung cấp đổi gói miễn phí, sửa `FREE_LIMITS` (`backend/src/lib/usage/rules.ts`) kèm ngày kiểm tra. Neon và R2 tính chung mọi nhánh / bucket (dev, bản thử, web thật): thỉnh thoảng xem thêm trang quản lý của Neon và Cloudflare.
- Chế độ "Chỉ dùng gói miễn phí" (DECISIONS #59): xác nhận bước và các chi tiết PENDING. Chỉ tắt (gõ `OPEN` ở Quản trị → Cài đặt) khi đã sẵn sàng trả tiền phần vượt. Web thật nhận cột mới khi chạy `npm run db:prod:migrate` lúc lên production.
- Dòng bản quyền dưới cùng (DECISIONS #60): xác nhận bước.
- Danh mục và đánh giá (NOT SCHEDULED): cho biết "bỏ qua danh mục + đánh giá" (2026-11-22) là bỏ hẳn khỏi yêu cầu hay chỉ để sau (REVIEW).
- Tên miền `asset2d.id.vn` (mua 2026-11-26): đổi nameserver ở Mắt Bão sang `adi.ns.cloudflare.com` và `wells.ns.cloudflare.com` (Mắt Bão đang báo tên miền bật DNSSEC: thử lại sau, hoặc nhờ hỗ trợ của họ); quyết định giữ hay xoá 7 bản ghi email của Mắt Bão mà Cloudflare đã chép (`docs/OPERATIONS.md` §7). Khi Cloudflare báo Active: Resend (§9 hàng 5), rồi `media.asset2d.id.vn` cho bucket ảnh của web thật (§9 hàng 1, 3).
- *(MoMo tạm dừng 2026-11-20, DECISIONS #42; mục này và mục ngay dưới chỉ cần khi bật lại MoMo.)* Trả thử MoMo từ đầu đến cuối (bước 6.4): cần app MoMo bản thử nghiệm và ví thử. Ngày 2026-11-20 người dùng quét QR bằng app MoMo thật thì bị báo lỗi 1005 ("giao dịch đã hết hạn hoặc không tồn tại", vì đơn nằm ở môi trường thử), và cả hai link tải app thử nghiệm tìm được đều lỗi; người dùng chọn làm tài liệu trước. Thử lại khi tải được app thử nghiệm, hoặc khi có tài khoản MoMo doanh nghiệp (GĐ7).
- Quyết định khi bật MoMo (bước 6.4): (1) đơn 0 ₫ (mã giảm 100 %) không đặt được (PENDING ở `docs/DECISIONS.md`); (2) trang MoMo cho trả trong khoảng 16 giờ 40 phút, còn đơn của shop hết hạn sau 30 phút: khách trả muộn vẫn được ghi "Đã thanh toán" (cron chỉ cho hết hạn khi MoMo báo đơn đã kết thúc), nhưng trước đó trang shop đã hiện "Đã hết hạn". Có thể đặt hạn bên MoMo bằng hạn của shop; cần thử trên môi trường thử trước khi làm.
- Nghiệm thu phần ảnh gọn trên trang bộ. Quyết định riêng các lựa chọn thiết kế của 5.3 và việc người mua chỉ tải được phiên bản mới nhất (PENDING trong `docs/DECISIONS.md`).
- Quyết định có sửa 2 điểm ghi nhận khi xác nhận 5.3 (2026-11-19) hay không: đổi thứ tự ảnh không ghi AuditLog (lệch `.claude/rules/admin.md`); dev log báo "Could not validate `instant`" khi người không phải Admin mở `/admin` (chỉ ở dev, có từ 5.1).
- Hai điểm chưa rõ nguồn, ghi khi kiểm tra cuối GĐ5 (2026-11-19): một lần test tích hợp lỗi không tái hiện được (5 lần chạy sau đều qua; lần lỗi không lưu log); log dev có `unhandledRejection: SyntaxError: Unexpected end of JSON input`, stack không có dòng nào thuộc code dự án. Chưa sửa; theo dõi nếu lặp lại.
- Xác nhận các mục REVIEW / PENDING trong `docs/DECISIONS.md` (mục "Chờ xác nhận") và hai hàng REVIEW trong `docs/requirements/BRIEF-STATUS.md` (§12 số lượng dữ liệu demo, §13 cách chia giai đoạn).
- **REVIEW, chờ xác nhận:** `mediaUrl` (ảnh/video bucket public) có cần cách phục vụ riêng trên R2 hay không. Đây là nội dung Claude suy ra; tài liệu cũ chỉ ghi chung "driver R2 (GĐ7)" (PROGRESS 5.3). Chưa phải yêu cầu chính thức: không tự triển khai và không coi là yêu cầu trước khi người dùng xác nhận. *(Đã giải quyết 2026-11-21: người dùng chọn tên miền riêng gắn vào bucket ảnh, DECISIONS #53; đã làm ở bước 7.5.)*
- Điền link liên hệ thật ở `frontend/src/lib/contact-channels.ts` (DECISIONS #20).
- Đặt lại mật khẩu cơ sở dữ liệu Neon đã từng lộ trong khung chat (không ghi giá trị vào tài liệu).
- Tái cấu trúc tài liệu: đã nghiệm thu và ghi 11 file ngày 2026-11-15 (DECISIONS #30). Còn lại: (1) người dùng tự đổi tên hoặc chuyển `c:\Users\HawkDev\Desktop\CLAUDE.md` để nó thôi tự nạp vào mọi dự án trên Desktop; (2) người dùng quyết định khi nào cho phép xoá `.backup/docs-2026-11-15/`.
