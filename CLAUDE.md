# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Dự án: Asset Game MMORPG 2D** (tên cũ: Eastern Fantasy Asset Marketplace) — website thương mại điện tử bán tài nguyên đồ họa game 2D (HD Pixel Art) phong cách phương Đông: Tiên hiệp/Tu tiên, Võ hiệp, Huyền huyễn, Thần thoại phương Đông, Dark Fantasy, MMORPG/RPG 2D.
>
> Đây là một **Marketplace đầy đủ** (tìm kiếm, xem trước, mua, tải xuống, thư viện cá nhân, Admin), không phải Landing Page.

@frontend/AGENTS.md

## Bất khả xâm phạm

Nguyên văn yêu cầu của người dùng (không nới lỏng, không bỏ qua):

- "Khi xác thực JWT, phải kiểm tra sessionVersion hiện tại của User trong Database. Khi tài khoản bị khóa hoặc mật khẩu thay đổi, JWT cũ phải mất hiệu lực. Không chỉ lưu sessionVersion trong JWT mà không kiểm tra lại."
- "DATABASE_URL sử dụng pooled connection. DIRECT_URL sử dụng direct connection cho migration. Không chạy migration hoặc seed dữ liệu thử nghiệm trên Database Production."
- "File bán phải được bảo vệ, không thể truy cập trực tiếp từ URL công khai. Kiểm tra quyền sở hữu trước khi cấp quyền tải. Storage local phải nằm ngoài public và không thể truy cập trực tiếp bằng đường dẫn filesystem."
- "Không yêu cầu tôi gửi mật khẩu, API Key hoặc chuỗi kết nối bí mật qua khung chat."
- "Không tự ý thay đổi những quyết định đã xác nhận. Nếu cần thay đổi, hãy hỏi tôi trước." — quyết định ở `docs/DECISIONS.md`.

Kèm theo:

- **Không bao giờ** gọi trực tiếp `npx prisma migrate ...` / `prisma db seed`; luôn đi qua `db:*` để guard chặn production. Áp migration lên production chỉ qua `npm run db:prod:migrate` (DECISIONS #44; quy trình: `docs/OPERATIONS.md` §2): người dùng tự chạy trên máy, gõ xác nhận. Claude không tự chạy `db:prod:*` lên production.
- Không giả lập giao dịch thành công ngoài chế độ Demo; Demo bị cấm ở production (`docs/ARCHITECTURE.md` §4). Chỉ webhook đã kiểm chữ ký mới cấp quyền sở hữu.
- Không bao giờ để lộ URL file Premium: không render vào HTML, không lưu signed URL; chỉ cấp link ký hạn ngắn sau khi kiểm quyền (`docs/ARCHITECTURE.md` §5).
- Giá, tổng tiền, quyền sở hữu luôn tính lại ở server. Mỗi trang Admin gọi `requireAdminPage()`, mỗi action Admin gọi `requireAdmin()` (`.claude/rules/admin.md`). Đọc phiên chỉ qua `getCurrentUser()`, không cache (`.claude/rules/nextjs.md`).
- Không tạo thông số sản phẩm giả rồi trình bày như thật; dữ liệu demo luôn ghi rõ DEMO.

Các dòng về Demo/webhook, URL Premium, tính lại ở server + quyền Admin + đọc phiên, thông số giả/DEMO ở trên chỉ là **bản tóm tắt**. Khi nội dung tóm tắt trong file này khác với tài liệu chuyên trách, tài liệu chuyên trách được ưu tiên **về nội dung chuyên môn** trong đúng phạm vi của nó: yêu cầu sản phẩm → `docs/PRODUCT.md`; kiến trúc hệ thống → `docs/ARCHITECTURE.md`; UI/UX → `docs/DESIGN.md`; quy tắc Admin → `.claude/rules/admin.md`; Next.js và đọc phiên → `.claude/rules/nextjs.md`; các file khác trong `.claude/rules/` → quy tắc chuyên biệt theo phạm vi của file đó. Tuy nhiên, `docs/DECISIONS.md` là nguồn xác định những quyết định đã được người dùng xác nhận: tài liệu chuyên trách không được tự ý ghi đè hay thay đổi quyết định đã xác nhận. Nếu phát hiện mâu thuẫn giữa tài liệu chuyên trách và quyết định đã xác nhận, phải báo cáo và hỏi người dùng trước khi sửa.

## 0. Quy tắc làm việc (bắt buộc)

- **Đọc file này trước khi làm bất cứ việc gì**, rồi đọc tài liệu theo "Bản đồ tài liệu" bên dưới cho đúng việc đang làm. Rule trong `.claude/rules/` tự nạp theo file đang sửa.
- **Không tự ý thay đổi các quyết định trong `docs/DECISIONS.md`.** Nếu thấy cần thay đổi (công nghệ, kiến trúc, quy tắc kinh doanh, schema cốt lõi), phải hỏi người dùng trước. Quyết định mới chỉ ghi vào bảng "Nguyên văn" khi người dùng đã xác nhận; trước đó ghi ở mục "Chờ xác nhận" (PENDING / REVIEW).
- Làm theo từng giai đoạn (`docs/ROADMAP.md`). Hết mỗi giai đoạn phải chạy kiểm tra (build, lint, test, kiểm tra VI/EN/ZH) và báo kết quả thật trước khi sang giai đoạn tiếp.
- Người dùng muốn làm **từng bước một**: xong bước nào kiểm tra bước đó, để họ mở web xem thử, rồi mới qua bước tiếp (chờ "tiếp tục").
- Không tự loại bỏ chức năng trong yêu cầu. Chức năng chưa xếp giai đoạn ghi ở mục NOT SCHEDULED của `docs/ROADMAP.md`, không tự đưa vào giai đoạn nào.
- Xong mỗi bước: thêm một gạch đầu dòng vào `docs/PROGRESS.md` (không sửa các dòng cũ); cập nhật "Trạng thái hiện tại" ở `docs/ROADMAP.md`.
- Người dùng giao tiếp bằng tiếng Việt: trả lời bằng tiếng Việt; code, tên biến, commit dùng tiếng Anh.

## 1. Lệnh thường dùng

| Lệnh | Việc làm |
|---|---|
| `npm install` | Cài đặt; `postinstall` tự chạy `prisma generate` (client sinh ra ở `backend/src/generated/prisma`, không commit) |
| `npm run dev` | Dev server http://localhost:3000 (→ `/vi`) |
| `npm run build` / `npm start` | `prisma generate && next build` / chạy bản build |
| `npm run lint` | ESLint (flat config) |
| `npm run typecheck` | `next typegen && tsc --noEmit` (typegen sinh kiểu cho `LayoutProps`, `next/root-params`) |
| `npm run format` | Prettier toàn repo (bỏ qua các file trong `.prettierignore`, gồm 3 tài liệu nguyên văn ở `docs/`) |
| `npm test` / `npm run test:watch` | Vitest unit (`backend/tests/unit`, rồi `frontend/tests/unit`). **Chạy từ PowerShell.** Chi tiết: `.claude/rules/testing.md` |
| `npm run test:integration` | Vitest tích hợp trên **DB dev** (`backend/tests/integration`), có guard từ chối production. Chạy từ PowerShell. Chi tiết: `.claude/rules/testing.md` |
| `npm run test:e2e` | Playwright desktop + mobile, 2 worker, trên bản build — **chạy `npm run build` trước**. Chi tiết: `.claude/rules/testing.md` |
| `npm run i18n:check` | So khớp key của mọi `frontend/messages/<locale>.json` (vi, en, zh), không giá trị rỗng |
| `npm run db:migrate` | Guard → `prisma migrate dev` (dùng `DIRECT_URL`). Tạo migration: `npm run db:migrate -- --name <tên>`. SQL tay, CHECK enum, `--create-only`: `.claude/rules/database.md` |
| `npm run db:generate` | `prisma generate` — **Prisma 7 không tự generate**, chạy sau mỗi lần đổi schema |
| `npm run db:seed` | Guard → `prisma db seed` (`backend/prisma/seed/index.ts`). Idempotent: upsert 21 danh mục/thể loại/phong cách/giấy phép, xoá & tạo lại mọi sản phẩm `isDemoData` (10 bộ A→Z: 8 PREMIUM, 2 FREE; mỗi bộ có các `ProductSection`) + ảnh SVG giữ chỗ có chữ DEMO (bucket public, tổng quan + 2 ảnh/phần) + file README demo (bucket private). Không đụng sản phẩm thật. |
| `npm run db:seed:coupons` | Guard → chỉ upsert mã giảm giá demo (`backend/prisma/seed/data/coupons.ts`), **không đụng sản phẩm/giỏ** (seed đầy đủ tạo lại sản phẩm → id đổi → giỏ hàng bị xoá dòng). |
| `npm run db:studio` | Prisma Studio |
| `npm run db:prod:status` / `db:prod:migrate` / `db:prod:reference` / `db:prod:grant -- <email>` / `db:prod:revoke -- <email>` | **Chỉ cho production, người dùng tự chạy** (DECISIONS #44; `backend/scripts/db-prod.ts`): đọc chuỗi kết nối từ `.env.production-db`; xem trạng thái migration (chỉ đọc) / áp migration (`prisma migrate deploy`) / ghi dữ liệu danh mục (21 danh mục, thể loại, phong cách, Lợi ích; không bộ demo, không mã giảm giá thử). Từ chối host không nằm trong `PRODUCTION_DATABASE_HOSTS`; ghi gì cũng phải gõ đúng mã endpoint Neon. `grant` / `revoke` (bước 7.7) cấp / bỏ quyền Admin cho một tài khoản **đã đăng ký trên web thật** (đọc kết quả trước, rồi hỏi mã endpoint mới ghi; không có database nào khác bị chạm; revoke làm đăng xuất mọi phiên của tài khoản). Quy trình: `docs/OPERATIONS.md` §2. |
| `npm run admin:grant -- <email>` / `admin:revoke -- <email>` | Nâng một tài khoản **đã đăng ký** lên Admin / bỏ quyền (`backend/scripts/admin-grant.ts`; guard của `db:*` → từ chối production). Vai trò được đọc lại từ DB mỗi request nên có hiệu lực ngay; revoke tăng `sessionVersion` (mọi phiên phải đăng nhập lại). E2E (`admin.spec.ts`, `admin-products.spec.ts`) gọi thẳng cùng script (`npx tsx backend/scripts/admin-grant.ts grant|revoke <email>`, tương đương lệnh npm ở trên) rồi revoke. |
| `npm run icons` | Tạo lại favicon từ con dấu 仙 của logo (`frontend/scripts/generate-icons.mjs` → `frontend/src/app/favicon.ico` 16/32/48, `icon.png` 512, `apple-icon.png` 180). Chạy lại khi đổi logo. |
| `npm run mail:preview` | Ghi thư mẫu (đặt lại mật khẩu, VI/EN/ZH, dữ liệu mẫu) vào hộp thư dev `.mail-outbox/` rồi in đường dẫn các file `.html` để mở bằng trình duyệt (`backend/scripts/mail-preview.ts`). Không gửi gì, không đụng DB. Ở dev mọi thư của app cũng được ghi vào đây thay vì gửi (`MAIL_DRIVER=outbox`). |
| `npm run mail:test -- <email>` (`--locale=vi\|en\|zh`, `--env-file=<file>`) | Gửi **một** thư mẫu (đặt lại mật khẩu, link mẫu không dùng được) qua Resend để thử khoá và người gửi (bước 7.7; `backend/scripts/mail-test.ts`). Đọc `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL` từ `.env.local` (hoặc file chỉ định); `MAIL_DRIVER` ở máy vẫn để `outbox` được. `MAIL_FROM` còn là `…@localhost` thì dùng người gửi thử của Resend `onboarding@resend.dev` (chỉ tới được email của tài khoản Resend cho tới khi tên miền được xác minh). Không đụng DB, không in khoá. |
| `npm run cron:run` / `cron:run -- reconcile\|cleanup` | Chạy tay các việc định kỳ ở dev (`backend/scripts/cron.ts`, cùng code với `/api/cron/<job>`; guard của `db:*` → từ chối production): `reconcile` ghi EXPIRED cho đơn PENDING quá hạn hơn 15 phút; `cleanup` xoá giỏ khách không đổi 30 ngày, file tải lên (`packs/…`) không còn dòng nào trỏ tới sau 24 giờ và bộ đếm số lần thử (`RateLimit`) cũ hơn 24 giờ. Chạy lại bao nhiêu lần cũng được. |
| `npm run storage:check` / `storage:push` (`-- --dry-run`) | Cloudflare R2 (bước 7.5; `backend/scripts/storage-check.ts`, `storage-push.ts`; đọc `.env.local`, chạy được khi `STORAGE_DRIVER` còn là `local`). `storage:check` thử R2 từ đầu tới cuối bằng object thử `healthcheck/…` (ghi / đọc 2 bucket; ảnh mở được qua `R2_PUBLIC_BASE_URL`; file bán **không** mở được ở đó; link tải 1 phút; tải lên bằng link ký sẵn; CORS cho `APP_URL`; liệt kê; dọn), in ✔ / ✖ kèm gợi ý, không in khoá. `storage:push` chép `.storage/public` và `.storage/private` lên 2 bucket, bỏ qua file đã có cùng dung lượng, không xoá gì; `--dry-run` chỉ đếm; từ chối khi `APP_ENV=production`. Cài R2: `docs/OPERATIONS.md` §7. |
| `npm run preview:init` / `preview:setup` / `preview:check` / `preview:grant -- <email>` / `preview:revoke -- <email>` | Bản xem trước trên Vercel (bước 7.6; `backend/scripts/preview-env.ts`; đọc `.env.preview`, file do người dùng điền, không commit). `init` tạo file mẫu (AUTH_SECRET và CRON_SECRET ngẫu nhiên, không ghi đè file có sẵn); `setup` chạy `prisma migrate deploy` rồi seed đầy đủ (danh mục, 10 bộ demo, ảnh demo lên bucket preview, mã giảm giá demo) trên **nhánh Neon của bản thử**; `check` chạy `storage:check` với bucket và `APP_URL` của bản thử; `grant` / `revoke` cấp / bỏ quyền Admin cho một tài khoản đã đăng ký trên bản thử. Từ chối nếu database là production (`PRODUCTION_DATABASE_HOSTS`) hoặc trùng nhánh dev của `.env.local`, bucket trùng bucket dev, `DATABASE_URL` không phải pooled, cổng khác `demo`, lưu trữ khác `r2`. Chỉ in tên host, không in khoá. Cài đặt và các bước làm trên Vercel: `docs/OPERATIONS.md` §8. |
| `npm run prod:init` / `prod:check` (`-- --storage`) | Cấu hình web chạy thật (bước 7.7; `backend/scripts/prod-env.ts`; đọc `.env.vercel-production`, file do người dùng điền, không commit; không đặt tên `.env.production` vì Next tự nạp file đó khi build trên máy). `init` tạo file mẫu (AUTH_SECRET và CRON_SECRET ngẫu nhiên, thanh toán `sepay` `live`, R2, 2 bucket `asset-game-prod-*`; không ghi đè file có sẵn); `check` liệt kê **từng việc còn thiếu hoặc sai**, mỗi việc một dòng: giá trị chưa điền, đúng các quy tắc của `backend/src/env.ts` ở production (cấm Demo, r2.dev, email `outbox`, CRON_SECRET ngắn…), có dịch vụ email thật trong code chưa, `DATABASE_URL` là pooled của nhánh production (`PRODUCTION_DATABASE_HOSTS`), không có `DIRECT_URL`, `APP_URL` không phải địa chỉ bản thử, không dùng chung database / bucket / `AUTH_SECRET` / `CRON_SECRET` / khoá R2 với dev hoặc bản thử. `-- --storage` chạy thêm `storage:check` với 2 bucket production (ghi rồi xoá một object thử). Chỉ đọc, không chạm database, không in khoá. Danh sách việc khi chạy thật: `docs/OPERATIONS.md` §9. |

- Biến môi trường: xem `.env.example`; giá trị thật chỉ nằm trong `.env.local` trên máy người dùng. **Không yêu cầu người dùng gửi secret/chuỗi kết nối qua chat.**

## 2. Trạng thái hiện tại

- GĐ0–GĐ6 hoàn thành. **GĐ5 (Admin) hoàn thành 2026-11-20** (người dùng chọn đóng giai đoạn sau kiểm tra cuối GĐ5): 5.1–5.7 đã được người dùng xác nhận; ảnh gọn trên trang bộ (yêu cầu thêm) xong, chờ xác nhận; các lựa chọn thiết kế của 5.3 vẫn PENDING; các mục còn treo ở `docs/ROADMAP.md` "Việc chờ người dùng" và mục "Chờ xác nhận" của `docs/DECISIONS.md`. **GĐ6 (email, đối soát, cổng thanh toán MoMo; lựa chọn: `docs/DECISIONS.md` #38, #41) hoàn thành 2026-11-20** (người dùng chọn đóng giai đoạn sau kiểm tra cuối GĐ6): 6.1–6.3 người dùng đã xác nhận; 6.4 cổng MoMo (môi trường thử): người dùng đã duyệt tài liệu; MoMo **tạm dừng** (#42: code giữ nguyên, web chạy cổng Demo; sau này người dùng thử cổng khác: SePay, VNPay, ZaloPay…). **GĐ7 đang làm** (kiểm thử tổng thể và triển khai; lựa chọn: `docs/DECISIONS.md` #43): 7.1 giới hạn số lần đăng nhập sai / thử mã giảm giá: người dùng đã xác nhận; 7.2 rà soát bảo mật: người dùng đã xác nhận; 7.3 hiệu năng + SEO: người dùng đã xác nhận; 7.4 quy trình đưa thay đổi database lên Neon production: người dùng đã xác nhận; thanh toán SePay (người dùng yêu cầu làm trước 7.5; DECISIONS #45): người dùng đã xác nhận; Admin Đơn hàng (Tài chính, chuyển khoản chưa khớp, đơn tay, phân trang; DECISIONS #46) + giao diện điện thoại 2 cột (#47): người dùng đã xác nhận; xếp lại thư mục thành `frontend/` · `backend/` · `docs/` (người dùng yêu cầu; DECISIONS #48): người dùng đã xác nhận; trang sửa bộ asset dạng thẻ, chọn thông số bằng nút, biểu đồ Tổng quan ấn cột, ô chọn mới, trang sửa phần dạng thẻ (người dùng yêu cầu; DECISIONS #49–#52): người dùng đã xác nhận; 7.5 lưu file trên Cloudflare R2 (lựa chọn: DECISIONS #53; cài đặt: `docs/OPERATIONS.md` §7): người dùng đã xác nhận; 7.6 bản xem trước trên Vercel (lựa chọn: DECISIONS #54; cài đặt: `docs/OPERATIONS.md` §8): đang chạy trên mạng (cổng Demo, nhánh Neon + 2 bucket R2 riêng): người dùng đã xác nhận; **7.7 production: đã chuẩn bị phần không cần tài khoản** (lựa chọn: DECISIONS #55; Admin production `db:prod:grant` / `db:prod:revoke`, lịch việc định kỳ trong `vercel.json`, `prod:init` / `prod:check`; việc phải làm khi chạy thật: `docs/OPERATIONS.md` §9), người dùng đã xác nhận; email thật qua Resend (lựa chọn: DECISIONS #56): code xong, người dùng đã xác nhận, chưa gửi thử (người dùng thử khi có tên miền); 5 trang thông tin (Giới thiệu, Câu hỏi thường gặp, Điều khoản sử dụng, Chính sách bảo mật, Chính sách hoàn tiền; người dùng yêu cầu, lựa chọn: DECISIONS #57): người dùng đã xác nhận (nội dung vẫn là bản mẫu, chờ người dùng đọc và sửa); trang Admin "Dung lượng" (theo dõi gói miễn phí Neon, R2, Resend; người dùng yêu cầu, lựa chọn: DECISIONS #58): người dùng đã xác nhận; chế độ "Chỉ dùng gói miễn phí" (mặc định bật; tắt ở Admin → Cài đặt phải gõ `OPEN`; chặn tải file khi R2 tới 90 %, chặn đăng ký / đặt đơn khi database đầy, chặn email quá hạn mức Resend; người dùng yêu cầu, lựa chọn: DECISIONS #59): người dùng đã xác nhận; dòng bản quyền nằm dưới cùng, dưới 3 link pháp lý (người dùng yêu cầu, DECISIONS #60): người dùng đã xác nhận; mỗi tài khoản chỉ một đơn chờ thanh toán (trang Thanh toán hỏi thanh toán hay huỷ đơn đó; khách tự huỷ được đơn của mình, trừ MoMo) và mã giảm giá giữ lượt khi đặt đơn (có khoá chống 2 đơn cùng lấy lượt cuối) (người dùng chọn, lựa chọn: DECISIONS #61): người dùng đã xác nhận; 2 điểm nhỏ còn treo từ 5.3 (Claude chọn khi người dùng nhắn "ok tiếp đi"): đổi thứ tự ảnh nay ghi Nhật ký Admin; lỗi "Could not validate instant" ở dev đã hết từ 2026-11-20, không cần sửa: xong, chờ người dùng xác nhận; tên miền `asset2d.id.vn`: người dùng đã mua (2026-11-26), đang chuyển DNS sang Cloudflare (`docs/OPERATIONS.md` §7); **còn lại** cần tên miền chạy trên Cloudflare, cổng thanh toán thật (SePay `live`), chọn gói Vercel.
- Chi tiết: `docs/ROADMAP.md` (kế hoạch) · `docs/PROGRESS.md` (đã làm).

## 3. Bản đồ tài liệu

| Cần | Đọc |
|---|---|
| Quy tắc kinh doanh, Free/Premium, 21 danh mục, Lợi ích, dữ liệu demo, danh sách trang | `docs/PRODUCT.md` |
| Công nghệ, phân lớp, cây thư mục, Database, thanh toán, bảo vệ file, đa ngôn ngữ | `docs/ARCHITECTURE.md` |
| Giao diện: màu, font, theme, khung dashboard, component, yêu cầu UI của người dùng | `docs/DESIGN.md` |
| Kế hoạch, trạng thái, NOT SCHEDULED, DEFERRED, việc chờ người dùng | `docs/ROADMAP.md` |
| Lịch sử từng bước đã làm (nguyên văn) | `docs/PROGRESS.md` |
| Quyết định đã xác nhận và trạng thái | `docs/DECISIONS.md` |
| Môi trường, Neon, chạy bản build, chia sẻ web, sao lưu | `docs/OPERATIONS.md` |
| Yêu cầu gốc (bản sao từng byte) + mục nào đã bị thay | `docs/requirements/ORIGINAL-BRIEF.md` + `BRIEF-STATUS.md` |
| Mẹo theo vùng code (tự nạp) | `.claude/rules/` nextjs · admin · database · testing |

### Cấu trúc thư mục (từ 2026-11-21, DECISIONS #48)

Vẫn **một app Next.js** (#1), chia 3 thư mục ở gốc. **Mọi lệnh `npm run …` chạy từ thư mục gốc**; `package.json`, `node_modules/`, `.env.local`, `.storage/`, `.mail-outbox/` và cấu hình chung (`tsconfig.json`, ESLint, Prettier, `.gitignore`) nằm ở gốc.

| Thư mục | Chứa | Import |
|---|---|---|
| `frontend/` | App Next.js: `src/app` (trang + route API), `src/components`, `src/i18n` (request, client-messages), `src/styles`, `src/fonts`, `src/lib` (chỉ phần giao diện: `cn`, kênh liên hệ, header bảo mật), `src/proxy.ts`, `src/instrumentation.ts`; `messages/` (vi/en/zh), `public/`, `scripts/` (i18n-check, icons), `tests/e2e`, `tests/unit` (phần giao diện), `next.config.ts`, `playwright.config.ts`, `vitest.config.mts`, `AGENTS.md` | `@/…` = `frontend/src/…` |
| `backend/` | Mọi code chạy ở server: `src/modules/*` (repository → service → actions), `src/auth`, `src/lib` (quy tắc thuần), `src/i18n` (routing, navigation dùng chung), `src/mail`, `src/storage`, `src/env.ts`, `src/db.ts`, `src/generated` (Prisma client); `prisma/` (schema, migrations, seed), `prisma.config.ts`, `scripts/`, `tests/unit`, `tests/integration`, 2 cấu hình Vitest | `@backend/…` = `backend/src/…` |
| *(gốc)* `README.md` | Hướng dẫn cài đặt, cấu hình, cấp quyền, bản thử, lệnh, lỗi thường gặp (cho người mới) | |
| `docs/` | Toàn bộ tài liệu, kể cả `DESIGN.md`; `docs/README.md` là mục lục tài liệu | |

- Frontend gọi backend; **backend không import frontend**, trừ bộ chữ dịch dùng chung `frontend/messages/` (thư email).
- **Đường dẫn cũ** (trước 2026-11-21) còn trong `docs/PROGRESS.md`, `docs/DECISIONS.md`, phần nguyên văn của ARCHITECTURE / PRODUCT / DESIGN và thân các file `.claude/rules/`. Đối chiếu: `src/server/…` → `backend/src/…`; `src/lib/…` → `backend/src/lib/…` (trừ `cn.ts`, `contact-channels.ts`, `http/security-headers.ts` → `frontend/src/lib/…`); `src/i18n/routing.ts`, `navigation.ts` → `backend/src/i18n/`; `src/generated`, `src/types` → `backend/src/…`; mọi `src/…` khác → `frontend/src/…`; `prisma/`, `prisma.config.ts`, `scripts/` → `backend/…` (trừ `scripts/i18n-check.ts`, `generate-icons.mjs` → `frontend/scripts/`); `tests/integration` → `backend/tests/`; `tests/e2e` → `frontend/tests/`; `tests/unit/<file>` → `backend/tests/unit/` hoặc `frontend/tests/unit/`; `messages/`, `next.config.ts`, `playwright.config.ts`, `AGENTS.md` → `frontend/`; `DESIGN.md`, `README.md` → `docs/`.

## 4. Ba điều dễ sai nhất

- **Next 16.4 khác dữ liệu huấn luyện** (`frontend/AGENTS.md`): đọc `node_modules/next/dist/docs/` trước khi viết code Next; dữ liệu request-time (cookies, `auth()`, `useSearchParams`) nằm trong `<Suspense>`; mọi ghi của Admin gọi `updateTag("catalog")`.
- **Chữ giao diện chỉ lấy từ `frontend/messages/vi.json`, `en.json`, `zh.json`**, đủ 3 ngôn ngữ (`npm run i18n:check`). Không hardcode chuỗi hiển thị.
- **`frontend/src/app/` chỉ gọi service** (`backend/src/modules/*`): repository (Prisma) → service (nghiệp vụ) → action/route (auth + validate). Code server có `import "server-only"` (trừ file được test import trực tiếp).
