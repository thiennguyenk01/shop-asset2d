# Kiến trúc

Công nghệ, phân lớp, cơ sở dữ liệu, thanh toán, bảo vệ file, đa ngôn ngữ. Chuyển **nguyên văn** từ `CLAUDE.md` cũ (§2, §3, §4, §6, §7, §8 và 3 mục "Lưu ý kỹ thuật") ngày 2026-11-15; câu đã lỗi thời giữ nguyên chữ, có dòng ghi chú ngay bên dưới. Mẹo kỹ thuật theo vùng code: `.claude/rules/`.

## 1. Công nghệ

Cột **Căn cứ**: `DECISIONS #n` = quyết định đã xác nhận · "Lựa chọn kỹ thuật đang dùng" = đang dùng trong code, **chưa phải quyết định** · "Chưa chọn" = chưa có lựa chọn cuối. Muốn đổi công nghệ vẫn phải hỏi người dùng trước (`CLAUDE.md` §0).

| Thành phần | Lựa chọn | Căn cứ |
|---|---|---|
| Ứng dụng | **Một app Next.js (App Router) + TypeScript** — vừa Frontend vừa Backend API. Không tách backend riêng ở giai đoạn đầu. | DECISIONS #1 |
| UI | Tailwind CSS + design tokens (CSS variables) + Radix UI primitives | Lựa chọn kỹ thuật đang dùng (chưa có hàng DECISIONS) |
| i18n | next-intl, route có tiền tố `/vi/...`, `/en/...`, `/zh/...` | Lựa chọn kỹ thuật đang dùng (chưa có hàng DECISIONS). Ba ngôn ngữ VI/EN/ZH: DECISIONS #13 |
| Database | PostgreSQL trên **Neon** + **Prisma** | DECISIONS #1, #7, #10 |
| Auth | Auth.js v5, Credentials (email + mật khẩu băm argon2), JWT session; có thể thêm Google OAuth sau | Lựa chọn kỹ thuật đang dùng (chưa có hàng DECISIONS). Kiểm tra sessionVersion: DECISIONS #9. Google OAuth: NOT SCHEDULED (`docs/ROADMAP.md`) |
| Lưu trữ file | **Cloudflare R2** (S3 API): bucket `public-media` (ảnh/video preview) và bucket `private-assets` (file bán) | DECISIONS #1, #7. Tên bucket: lựa chọn kỹ thuật |
| Validation | Zod (dùng chung form + server) | Lựa chọn kỹ thuật đang dùng (chưa có hàng DECISIONS) |
| Email | Resend hoặc SMTP, template VI/EN/ZH | Chưa chọn (GĐ6) |
| Biểu đồ Admin | Recharts | Đã chọn trong kế hoạch công nghệ ngày 2026-11-14, **chưa cài** (dự kiến bước 5.7); chưa có hàng DECISIONS. Phạm vi sử dụng biểu đồ: REVIEW (`docs/DECISIONS.md`, "Chờ xác nhận") |
| Test | Vitest (unit/service), Playwright (E2E, VI/EN/ZH, desktop/mobile) | Lựa chọn kỹ thuật đang dùng (chưa có hàng DECISIONS) |
| Hosting | **Vercel** (app) + **Neon** (DB) + **Cloudflare R2** (file). Không dùng VPS/Docker giai đoạn đầu. | DECISIONS #7 |

**Vì sao Neon (không phải Supabase):** chỉ cần Postgres thuần (auth và storage đã do Auth.js và R2 lo, không dùng phần còn lại của Supabase); tích hợp sẵn với Vercel; **branching DB** cho từng môi trường/preview; có connection pooler cho serverless. Gói free tự scale-to-zero (có độ trễ khởi động lạnh nhỏ) thay vì tạm dừng project như Supabase free.

**Cấu hình Prisma + Neon:** `DATABASE_URL` = chuỗi kết nối **pooled** (host `-pooler`) dùng lúc chạy; `DIRECT_URL` = chuỗi kết nối trực tiếp dùng cho `prisma migrate`. Dev local dùng một Neon branch riêng (`dev`), không dùng DB production.

**Storage driver:** interface `StorageProvider` có 2 bản: `r2` (preview/production) và `local` (chỉ dev, lưu ở `.storage/` ngoài `public/`, phục vụ qua API có token ký HMAC). Production bắt buộc `r2`.

> **Ghi chú khi chuyển file (2026-11-15):** dòng "Email" (Resend/SMTP) và "Biểu đồ Admin" (Recharts) trong bảng trên **chưa cài** và chưa phải quyết định (xem cột Căn cứ): email làm ở GĐ6, biểu đồ dự kiến ở bước 5.7.
> **Ghi chú bước 5.7 (2026-11-19):** biểu đồ Admin **tự vẽ bằng SVG** theo DECISIONS #36 (`src/components/admin/revenue-chart.tsx`); **không cài Recharts**. Hai màu biểu đồ là token `--color-chart-real` / `--color-chart-demo` trong `src/app/globals.css`.
> **Ghi chú GĐ6 (2026-11-20):** theo DECISIONS #38: **email** ở dev ghi thư ra file, dịch vụ gửi thật (Resend hay SMTP) chọn khi triển khai; **chỉ có email đặt lại mật khẩu**, nên bước 6 "Gửi email xác nhận theo `order.locale`" của luồng thanh toán (§4) **không làm**; **cổng thanh toán thật: MoMo** (PayOS / VNPay vẫn chờ).
> **Ghi chú bước 6.1 (2026-11-20):** lớp email ở `src/server/mail/`: `render.ts` (hàm thuần, có unit test) dựng thư từ khoá dịch `email.*` của `messages/<locale>.json` theo ngôn ngữ của khách, khung thư dùng màu giao diện sáng, mọi giá trị chèn vào HTML đều được escape, link phải là URL http(s) đầy đủ; `index.ts` (`server-only`) chọn cách gửi theo `MAIL_DRIVER`: `outbox` (mặc định, dev) ghi mỗi thư thành 3 file `.html` / `.txt` / `.json` vào `MAIL_OUTBOX_DIR` (mặc định `.mail-outbox/`, ngoài `public/`, có trong `.gitignore`), không gửi; `resend` / `smtp` mới chỉ là tên giữ chỗ, làm khi chọn dịch vụ thật lúc triển khai. Production **từ chối khởi động** khi `MAIL_DRIVER=outbox` (`src/server/env.ts`, cùng kiểu với Demo Payment và storage local). Không ghi link đặt lại mật khẩu vào log.
> **Ghi chú bước 6.2 (2026-11-20):** quên / đặt lại mật khẩu: `src/lib/auth/password-reset.ts` (hàm thuần: token 32 byte ngẫu nhiên dạng base64url, chỉ lưu SHA-256 vào `PasswordResetToken.tokenHash`, hạn 30 phút, tối đa 3 link / tài khoản / giờ), `src/server/modules/user/password-reset-service.ts` (gửi link qua `sendPasswordResetMail`; không bao giờ cho biết email có tài khoản hay không), `repository.ts` (`consumeResetToken`: trong một transaction giành link bằng cập nhật có điều kiện, đặt mật khẩu mới **và tăng `sessionVersion`** — mọi phiên cũ của tài khoản phải đăng nhập lại — rồi huỷ các link khác). Trang `(account)/forgot-password`, `(account)/reset-password/[token]` (tham số giữ chỗ `__none__`, kiểm link sau `connection()`).
> **Ghi chú bước 6.3 (2026-11-20):** việc định kỳ ở `src/server/modules/maintenance/` (quy tắc thuần + thời hạn: `src/lib/cron/rules.ts`), gọi qua `GET /api/cron/reconcile` · `/api/cron/cleanup` chỉ khi có `Authorization: Bearer <CRON_SECRET>` (so sánh thời gian hằng; sai / thiếu → 404 như đường dẫn lạ). `CRON_SECRET` bắt buộc trên production (≥ 32 ký tự, `src/server/env.ts`). Ở dev: `npm run cron:run`. **reconcile:** đơn PENDING quá `expiresAt` hơn 15 phút → EXPIRED (cập nhật có điều kiện PENDING); trong 15 phút đó webhook đến muộn vẫn thanh toán được, sau khi đã ghi EXPIRED thì webhook bị bỏ qua (không cấp quyền). Hỏi cổng thanh toán (`queryStatus`) trước khi cho hết hạn: làm ở 6.4 cùng MoMo (cổng Demo không có trạng thái để hỏi). **cleanup:** xoá giỏ khách (`userId` null) không đổi 30 ngày (xoá dòng giỏ giờ cũng cập nhật `Cart.updatedAt`); xoá object dưới `packs/` (file Admin tải lên) của cả 2 bucket cũ hơn 24 giờ mà không dòng `ProductMedia` / `ProductFile` nào trỏ tới (kiểm tra ngay trước khi xoá). `StorageProvider` có thêm `list(bucket, prefix)` (local: đọc thư mục; R2: làm ở GĐ7). Lịch chạy (Vercel Cron) đặt khi triển khai (GĐ7).
> **Ghi chú bước 6.4 (2026-11-20):** cổng **MoMo** (ví MoMo, API v2 `captureWallet`; DECISIONS #41): `src/server/modules/payment/providers/momo.ts` + hàm thuần `src/lib/payment/momo.ts` (chuỗi ký HMAC-SHA256 theo đúng thứ tự trường của mã mẫu chính thức github.com/momo-wallet/payment; đã kiểm với môi trường thử thật của MoMo ngày 2026-11-20: tạo thanh toán, hỏi trạng thái, chữ ký sai bị từ chối). Bật bằng `PAYMENT_PROVIDER=momo` + `MOMO_PARTNER_CODE` / `MOMO_ACCESS_KEY` / `MOMO_SECRET_KEY`; `MOMO_ENDPOINT` = `https://test-payment.momo.vn` (mặc định) hoặc `https://payment.momo.vn` (bắt buộc trên production), kiểm tra ở `src/server/env.ts`. Giao diện cổng (`providers/types.ts`) có thêm: `testMode` (đơn được đánh dấu `isDemo`), `amountRange` (MoMo 1.000 – 50.000.000 ₫; ngoài khoảng → `amountNotSupported`, không tạo đơn), `webhookAck` (MoMo nhận 204); `createPayment` nhận `origin` (`src/lib/http/origin.ts`: ở dev lấy địa chỉ trình duyệt đang dùng, vd. quick tunnel; preview / production luôn `APP_URL`) và trả `redirectTo` (trang MoMo) + `resumeUrl` (lưu ở `Payment.rawPayload` cho nút "Tiếp tục thanh toán"); `verifyWebhook` có thể trả `ACKNOWLEDGED` (thông báo thật nhưng chưa có kết quả, vd. mã 1000). MoMo không tạo được thanh toán → `PaymentUnavailableError` → đơn FAILED, khách được báo thử lại. Chỉ IPN đã kiểm chữ ký mới cấp quyền (bước 4 bên dưới không đổi). Ở máy người dùng, MoMo chỉ gọi tới được qua quick tunnel (`docs/OPERATIONS.md` §4).
> **Cập nhật 2026-11-20 (DECISIONS #42):** người dùng **tạm dừng MoMo**; code MoMo giữ nguyên, web chạy cổng Demo (`PAYMENT_PROVIDER=demo`). Sau này người dùng sẽ thử cổng khác (SePay, VNPay, ZaloPay…), chưa chọn: thêm cổng mới = thêm một provider theo giao diện ở `providers/types.ts` (kể cả `testMode`, `amountRange`, `webhookAck`, `queryStatus`), không sửa luồng đơn hàng.
> **Ghi chú bước 7.1 (2026-11-20):** giới hạn số lần thử thất bại (DECISIONS #43; con số: PENDING): quy tắc thuần + con số ở `src/lib/rate-limit/rules.ts`, bộ đếm ở bảng `RateLimit` của Neon (`src/server/modules/rate-limit/`; cộng thêm một lần bằng một câu SQL `INSERT … ON CONFLICT … RETURNING` nên nhiều yêu cầu cùng lúc không đếm sai; cửa sổ cố định tính từ lần thất bại đầu). Khoá = phạm vi + SHA-256 của email / IP / người mua, không lưu giá trị gốc. **Đăng nhập:** kiểm và đếm trong `authorize()` của Auth.js (`src/server/auth/index.ts`), nên đường gửi thẳng tới `/api/auth/callback/credentials` cũng bị chặn; `loginAction` kiểm trước chỉ để báo "thử lại sau X phút". **Mã giảm giá:** `applyCouponAction` (`src/server/modules/cart/actions.ts`). IP lấy từ `x-real-ip` / `x-forwarded-for` (Vercel tự đặt; khi chạy `next start` ngoài Vercel, khách có thể tự đặt header này). Cron cleanup xoá bộ đếm cũ hơn 24 giờ (báo cáo có thêm `rateLimits`).

> **Ghi chú bước 7.2 (2026-11-20, rà soát bảo mật; các lựa chọn: PENDING):** (1) **Header bảo mật:** `src/lib/http/security-headers.ts`, gắn bằng `headers()` trong `next.config.ts` (import đường dẫn tương đối). Mọi đường dẫn: `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `Permissions-Policy`. Chỉ các trang (trừ `/api/…`, `/media/…`, `/_next/…`): CSP `frame-ancestors 'none'; base-uri 'self'; object-src 'none'` + `Referrer-Policy: strict-origin-when-cross-origin`. CSP không giới hạn nguồn script: CSP dùng nonce buộc mọi trang render động (mất Partial Prerender). `/media` và `/api/files` tự đặt CSP sandbox / `no-referrer` của riêng chúng. (2) **Giới hạn thêm** (cùng bảng `RateLimit`, `src/lib/rate-limit/rules.ts`): đăng ký (`registerIp`) và quên mật khẩu (`resetRequestIp`) đếm **mọi** yêu cầu hợp lệ theo IP; đổi mật khẩu (`passwordChange`) đếm lần sai mật khẩu hiện tại theo tài khoản. Kiểm ở action (`src/server/modules/user/actions.ts`, `account-actions.ts`). (3) Rà soát không thấy lỗi ở: kiểm quyền mọi server action và 14 trang Admin; 6 route handler (`/api/files`, `/api/admin/uploads`, `/api/cron`, webhook, `/media`, Auth.js); cổng Demo (chỉ chủ đơn, chỉ chế độ Demo); chuyển hướng sau đăng nhập (`safeCallbackPath`); cookie giỏ hàng / mã giảm giá (`httpOnly`, `sameSite=lax`, `secure` ở production); đường dẫn file (`assertSafeKey`). `npm audit` còn cảnh báo `effect`, chỉ có trong công cụ dòng lệnh Prisma (không chạy trong web).

> **Ghi chú bước 7.3 (2026-11-20, hiệu năng + SEO; các lựa chọn: PENDING):** (1) **SEO:** hàm thuần `src/lib/seo/seo.ts` (canonical + `hreflang`, Open Graph / Twitter, `robots.txt`, các mục sitemap). `metadataBase` = `APP_URL` ở `src/app/[locale]/layout.tsx`. Trang Cửa hàng và trang bộ tự khai báo `alternates` + ảnh xem trước (metadata ghép nông: trang thay cả bộ `openGraph` của layout). `src/app/sitemap.ts` dùng `listPublishedSlugs` (cache tag `catalog`); `src/app/robots.ts` chỉ cho vào ở production. `alternateLinks: false` trong `src/i18n/routing.ts`. (2) **Bản dịch gửi xuống trình duyệt:** `src/i18n/client-messages.ts`. Layout gốc truyền `SITE_CLIENT_MESSAGES`; layout Admin bọc thêm `NextIntlClientProvider` với `ADMIN_CLIENT_MESSAGES` (provider lồng nhau thay hẳn messages, nên danh sách Admin gồm cả phần khu khách). `tests/unit/client-messages.test.ts` quét mọi file `"use client"`. (3) **Font tiêu đề** Noto Serif Display: tự host `src/fonts/noto-serif-display-latin.woff2` + `-vietnamese.woff2` bằng `next/font/local`, cùng tên họ `fontHeading`, `unicode-range` như Google (`src/styles/fonts.ts`, `src/fonts/README.md`).

> **Ghi chú bước 7.4 (2026-11-20, đưa thay đổi database lên production; lựa chọn: DECISIONS #44, chi tiết: PENDING):** lệnh `scripts/db-prod.ts` (`npm run db:prod:status | migrate | reference`); quy tắc thuần `scripts/db-prod-rules.ts` (đích production, chuỗi xác nhận, migration chờ / chạy dở, câu lệnh có thể mất dữ liệu, kế hoạch áp). Chuỗi kết nối đọc từ `.env.production-db`; `PRODUCTION_DATABASE_HOSTS` lấy từ file đó hoặc `.env.local`. Prisma CLI được gọi bằng chính Node đang chạy, với `DIRECT_URL` đặt sẵn trong môi trường (dotenv của `prisma.config.ts` không ghi đè biến đã có). Dữ liệu danh mục: `prisma/seed/reference.ts` (`upsertReferenceData`), dùng chung cho seed demo và `db:prod:reference`. Guard `db:*` (`scripts/db-guard.ts`) không đổi: vẫn từ chối production. Quy trình: `docs/OPERATIONS.md` §2.

> **Ghi chú bước 7.7 (2026-11-22, email thật; DECISIONS #56):** dịch vụ gửi thật là **Resend**: `backend/src/mail/resend.ts` gọi thẳng API HTTP của Resend (`POST https://api.resend.com/emails`, khoá ở `RESEND_API_KEY`; không cài SDK), có unit test với `fetch` giả; lỗi chỉ ghi lời giải thích của Resend, không ghi khoá hay nội dung thư. `backend/src/env.ts`: `MAIL_DRIVER=resend` bắt buộc `RESEND_API_KEY` (bắt đầu bằng `re_`); `smtp` vẫn giữ tên nhưng bị từ chối khi khởi động (chưa làm); trên production `MAIL_FROM` phải thuộc tên miền của cửa hàng (không `localhost`, không `resend.dev`). Dòng "Email" của bảng công nghệ ở trên: nay là Resend.

> **Ghi chú trang thông tin (2026-11-22, DECISIONS #57):** 5 trang `/[locale]/about`, `faq`, `terms`, `privacy`, `refund` (`frontend/src/app/[locale]/(site)/<trang>/page.tsx`), danh sách trang ở `backend/src/lib/info-pages.ts` (`INFO_PAGES`, `LEGAL_PAGES`, hàm thuần `textBlocks`: đoạn cách nhau một dòng trống, đoạn mà mọi dòng bắt đầu bằng `- ` là danh sách). Chữ nằm ở khoá `info.<trang>` của `frontend/messages/<locale>.json` (tiêu đề trang = `nav.<trang>`); `frontend/src/components/info/info-content.tsx` đọc các mục bằng `getMessages()` (kiểu của `t.raw` chỉ nhận khoá lá) và vẽ ở server, FAQ dùng `<details>` (không cần JavaScript). Trang tĩnh, có `alternates` 3 ngôn ngữ, nằm trong `sitemap.xml`. Link pháp lý: `frontend/src/components/layout/legal-links.tsx` dưới dòng bản quyền (sidebar, sheet "Thêm"). Unit test `info-pages.test.ts` giữ các con số trong chữ khớp hằng số của code (2 lượt Free, 30 phút giữ đơn, 30 phút link đặt lại mật khẩu, 100 lượt / giờ, 30 ngày giỏ khách, 24 giờ bộ đếm theo IP).

> **Ghi chú trang Admin "Dung lượng" (2026-11-22, DECISIONS #58):** `/[locale]/admin/usage`. Giới hạn gói miễn phí và các mức nằm ở hàm thuần `backend/src/lib/usage/rules.ts` (`FREE_LIMITS` kèm ngày kiểm tra và link nguồn: Neon 1 GB / project, R2 10 GB / tài khoản, Resend 100 thư / ngày và 3.000 thư / tháng; đơn vị thập phân; từ 80 % là `warn`, từ 95 % là `critical`). `backend/src/modules/usage/`: repository đọc `pg_database_size`, 5 bảng lớn nhất (`pg_total_relation_size`) và số `PasswordResetToken` đã tạo (thư duy nhất web gửi) trong 24 giờ qua / từ đầu tháng UTC; service `getUsageReport()` gom thêm dung lượng 2 bucket qua hàm mới `StorageProvider.usage(bucket)` (R2: `ListObjectsV2` cả bucket, 1.000 khoá mỗi lần gọi; local: thư mục `.storage`), `"use cache"` + `cacheTag("usage")` 10 phút; mục nào đọc lỗi thì ghi ở `failed`, trang vẫn hiện các mục khác. Nút "Đo lại ngay" là form gọi `refreshUsageAction` (`requireAdmin()`, `updateTag("usage")`, `refresh()`), không cần JavaScript. Trang Tổng quan có `UsageBanner` (trong `<Suspense>` riêng, gọi `requireAdminPage()` trước khi đọc), chỉ hiện khi có mục từ 80 %. Không đọc API của nhà cung cấp (giờ máy Neon, thao tác R2, băng thông Vercel). Định dạng dung lượng: `formatBytes` (`backend/src/lib/format.ts`).

> **Ghi chú chế độ "Chỉ dùng gói miễn phí" (2026-11-22, DECISIONS #59):** cột `ShopSettings.freeTierOnly` (`BOOLEAN NOT NULL DEFAULT true`, migration `20261121222949_shop_free_tier_only`); chưa có dòng cài đặt thì coi như bật. Ngưỡng ở hàm thuần `backend/src/lib/usage/rules.ts`: `uploadOverFreeStorage` (đã dùng + file sắp tải > 90 % của 10 GB, `STORAGE_BLOCK_RATIO`), `databaseFull` (≥ 1 GB), `mailOverFreeQuota` (≥ 100 thư trong 24 giờ qua hoặc ≥ 3.000 thư từ đầu tháng UTC). Chốt chặn ở `backend/src/modules/usage/guard.ts` (`server-only`), đo mới mỗi lần, không dùng cache 10 phút của trang Dung lượng: `uploadBlockedByFreeTier` trong `startUpload` của Admin (lỗi `freeTierFull`; liệt kê 2 bucket; đo lỗi thì chặn); `databaseBlockedByFreeTier` trong `registerUser`, `placeOrder`, `placeExtraDownloadsOrder` (lỗi `shopPaused`; đơn tay, quà của Admin và tải bộ Free không bị chặn); `mailBlockedByFreeTier` trong `sendPasswordResetMail`, chỉ khi gửi thật (driver khác `outbox`): thư bị chặn thì ném lỗi, nơi gọi ghi log, khách vẫn thấy câu trả lời như thường. Bật / tắt: `setFreeTierAction` (`requireAdmin()`); tắt phải gõ `OPEN` (`freeTierOpenConfirmed`: bỏ khoảng trắng, không phân biệt hoa thường); `saveFreeTierOnlyRow` ghi `AuditLog` `settings.freeTier` với `{ freeTierOnly: { before, after } }` trong cùng transaction; `updateTag("usage")`. `finishUploadAction` cũng gọi `updateTag("usage")` để trang Dung lượng tính cả file vừa tải.

> **Ghi chú đơn chờ thanh toán và lượt mã giảm giá (2026-11-26, DECISIONS #61; chi tiết: PENDING):** "đơn đang mở" = `status = PENDING` và `expiresAt > now` (đơn giữ 30 phút). `insertOrder` (`backend/src/modules/order/repository.ts`) tạo đơn trong một transaction: khoá dòng `User` của người mua (`SELECT … FOR UPDATE`), từ chối nếu tài khoản đã có đơn đang mở (`pendingOrder`, kèm mã đơn đó); đơn có mã giảm giá thì khoá thêm dòng `Coupon`, từ chối (`couponUsedUp`) khi `usedCount` + số đơn đang mở dùng mã ≥ `maxUses`, hoặc số lần tài khoản đã dùng (`CouponRedemption`) + đơn đang mở của tài khoản dùng mã ≥ `maxUsesPerUser`. `placeOrder` trả `pendingOrder` sớm khi `getCheckout` thấy đơn đang mở; mua thêm lượt tải (`placeExtraDownloadsOrder`) cũng đi qua `insertOrder`. `checkCouponCode` (giỏ hàng, trang Thanh toán) cộng các đơn đang mở vào `usedCount` và vào số lần của tài khoản trước khi gọi quy tắc thuần `checkCoupon`, nên mã hết lượt được báo ngay ở giỏ. Đơn hết hạn hoặc bị huỷ thì tự thôi giữ lượt (không có cột mới, không có migration). Huỷ: `cancelOrderAction(locale, orderCode)` (tài khoản lấy từ phiên) → `cancelOrder` → `cancelOpenOrder`: chỉ đơn của chính tài khoản (đơn của người khác: `notFound`), còn PENDING và chưa hết hạn (`notOpen`); đơn có Payment MoMo bị từ chối (`gateway`: trang MoMo vẫn nhận tiền); trong một transaction Payment PENDING → CANCELLED rồi Order PENDING → CANCELLED bằng `updateMany` có điều kiện trạng thái, đơn vừa đổi trạng thái (ví dụ vừa được trả) thì hoàn tác và trả `notOpen`. Thông báo thanh toán tới sau cho đơn đã huỷ không cấp gì (`ignored`); chuyển khoản SePay cho đơn đó vào `UnmatchedTransfer` lý do `ORDER_CLOSED` để Admin cấp bộ hoặc hoàn tiền. Chuyển khoản muộn cho đơn EXPIRED vẫn được ghi nhận như trước (#45), kể cả khi mã giảm giá đã hết lượt trong lúc đó (trường hợp hiếm, đã nêu trong lựa chọn của người dùng).

> **Ghi chú bước SePay (2026-11-21; lựa chọn: DECISIONS #45, chi tiết: PENDING):** cổng `SEPAY` = chuyển khoản ngân hàng qua VietQR: `src/server/modules/payment/providers/sepay.ts` + hàm thuần `src/lib/payment/sepay.ts` (chữ ký HMAC-SHA256 `sha256=<hex>` của `<timestamp>.<nội dung thô>`, lệch tối đa 5 phút; tìm mã đơn trong nội dung chuyển khoản; link ảnh QR). `createPayment` không gọi SePay: mã chuyển khoản (mã đơn bỏ dấu gạch) là `providerTxnId`, người mua được đưa tới trang đơn `/checkout/result/<mã>` có khung chuyển khoản (`src/components/checkout/bank-transfer.tsx`). Webhook `/api/payments/sepay/webhook` trả đúng `{"success": true}`. Adapter có cờ `bankTransfer`: `applyPaymentEvent(…, { acceptExpired })` cho phép thanh toán đơn EXPIRED khi payment còn PENDING; thông báo có chữ ký nhưng không khớp đơn được ghi vào bảng `UnmatchedTransfer` (migration `sepay_transfers`: enum `UnmatchedTransferReason`, thêm `SEPAY` vào enum `PaymentProvider`; chỉ thêm) và vẫn trả thành công. `queryStatus` trả null → việc định kỳ vẫn cho đơn quá hạn EXPIRED. Lỗi vượt khoảng tiền gửi kèm khoảng tiền của cổng đang bật (`range`). Biến `SEPAY_*`: `src/server/env.ts`.

> **Ghi chú Admin Đơn hàng (2026-11-21; lựa chọn: DECISIONS #46, chi tiết: PENDING):** quy tắc thuần có unit test: `src/lib/admin/order-rules.ts` (`orderMoneySummary`: 6 ô Tài chính từ `groupBy` trạng thái × Demo với cùng bộ lọc của danh sách; `ADMIN_ORDERS_PAGE_SIZE = 7`), `transfer-rules.ts` (lọc, ghi chú xử lý), `manual-order-rules.ts` (form đơn tay, số tiền ≤ giá niêm yết, `formatAmountInput`), `user-rules.ts` (`clampPage`, 5 dòng mỗi trang trên trang một khách). Chuyển khoản chưa khớp: `src/server/modules/payment/admin-{repository,service,actions}.ts`; đánh dấu đã xử lý là ghi có điều kiện (`resolvedAt` còn trống) cùng `AuditLog` `transfer.resolve` trong một transaction. Đơn tay: `src/server/modules/order/admin-manual-repository.ts`, một transaction: đọc lại khách và bộ (PREMIUM, PUBLISHED, có lợi ích mặc định, khách chưa sở hữu), tính tiền, tạo đơn PAID (ảnh chụp giá như đơn thường) + payment `MANUAL` SUCCEEDED (`providerTxnId = manual_<mã đơn>`), quyền PURCHASE gắn đơn (hoàn tiền dùng lại luồng 5.4), `salesCount` +1, bỏ khỏi giỏ, đóng chuyển khoản được gắn, `AuditLog` `order.manual`. Tặng bộ nhận nhiều bộ: `giftPackRows` chạy trong một transaction, một bộ bị chặn thì huỷ cả lần tặng. Migration (chỉ thêm, đã áp trên nhánh dev): `20261120181518_unmatched_transfer_admin` (cột `isDemo`, khoá ngoại người xử lý), `20261120183934_manual_orders` (giá trị `MANUAL` của enum `PaymentProvider`). Đơn tay và tặng bộ là thao tác của Admin (`requireAdmin()`), không phải xác nhận thanh toán của cổng: quy tắc "chỉ webhook đã kiểm chữ ký mới cấp quyền" vẫn áp cho mọi cổng thanh toán.

> **Ghi chú cấu trúc thư mục (2026-11-21; lựa chọn: DECISIONS #48, chi tiết: PENDING):** code chia vào `frontend/` (app Next.js) và `backend/` (mọi code chạy ở server, Prisma, script), tài liệu ở `docs/`; vẫn một app (#1). Cây mới: §2 "Cấu trúc thư mục (từ 2026-11-21)". Các mục nguyên văn bên dưới còn ghi đường dẫn cũ: đối chiếu bằng bảng trong `CLAUDE.md` §3.
>
> **Ghi chú khi nghiệm thu (2026-11-15):** người dùng duyệt bỏ chữ "(đã xác nhận)" khỏi tiêu đề mục này và thêm cột "Căn cứ"; không thêm quyết định mới. Bảng cũ: `.backup/docs-2026-11-15/CLAUDE.md.bak` (§2).

## 2. Kiến trúc và phân lớp

```
Browser ─► Next.js /[locale]/... (Server Components, Server Actions, Route Handlers /api/*)
              │
              ▼
          src/server/modules/*  (service = toàn bộ quy tắc nghiệp vụ)
              │            │                  │
              ▼            ▼                  ▼
        Neon Postgres   Cloudflare R2     PaymentProvider (Demo → PayOS/VNPay/MoMo)
        (Prisma)        public / private   webhook ký số → server
```

Nguyên tắc phân lớp (để sau này tách backend được):
- `app/` (UI, route) **chỉ gọi service**, không import Prisma trực tiếp.
- Mỗi module: `repository.ts` (Prisma) → `service.ts` (nghiệp vụ, nhận/trả kiểu thuần, không phụ thuộc Next) → `actions.ts` / route handler (lớp mỏng: auth + validate + gọi service).
- Code server nằm trong `src/server/` và có `import "server-only"`.
- Kiểm tra quyền (guard) ở **cả** layout/middleware **và** trong từng action/route (defense in depth).
- Giá, tổng tiền, quyền sở hữu **luôn tính lại ở server**, không tin dữ liệu client.

### Cấu trúc thư mục (từ 2026-11-21; DECISIONS #48)

Mọi lệnh chạy từ thư mục gốc. Import: `@/…` = `frontend/src/…`, `@backend/…` = `backend/src/…` (`tsconfig.json` ở gốc; `frontend/tsconfig.json` kế thừa). Backend không import frontend, trừ `frontend/messages/` (thư email).

```
CLAUDE.md               quy tắc làm việc (luôn nạp) · package.json · package-lock.json · tsconfig.json · eslint.config.mjs
.env.example · .env.local (máy người dùng) · .storage/ (file dev) · .mail-outbox/ (thư dev) · .backup/ · .claude/rules/
frontend/               app Next.js (next dev|build|start frontend)
  AGENTS.md             do next dev tự ghi
  next.config.ts · playwright.config.ts · vitest.config.mts · tsconfig.json
  messages/             vi.json · en.json · zh.json
  public/               (trống; KHÔNG BAO GIỜ chứa file bán)
  scripts/              i18n-check.ts · generate-icons.mjs
  src/
    app/                [locale]/{(site)/{(account)/…, shop, product/[slug], cart, checkout/…}, admin/…} · api/ · media/[...key] · globals.css
    components/         ui/ · layout/ · product/ · shop/ · cart/ · checkout/ · download/ · account/ · admin/ · design-system/
    i18n/               request · client-messages
    lib/                cn · contact-channels · http/security-headers
    styles/ · fonts/    next/font + font tự host
    proxy.ts            định tuyến ngôn ngữ (không chặn /admin)
    instrumentation.ts  kiểm cấu hình lúc khởi động (backend/src/startup-check.ts)
    global.d.ts         kiểu cho chữ dịch (next-intl)
  tests/                e2e/ · unit/ (phần giao diện)
backend/                code chạy ở server
  prisma.config.ts · vitest.config.mts · vitest.integration.config.mts
  prisma/               schema.prisma · migrations/ · seed/
  scripts/              db-guard · db-prod(-rules) · admin-grant · mail-preview · cron · e2e-remove-pack
  src/
    db.ts · env.ts · flash.ts · startup-check.ts
    auth/               index · credentials · password · session-validation · current-user · guards · admin-page
    modules/            user · product · cart · coupon · order · payment (providers/) · download · library · stats · settings · rate-limit · maintenance · audit
    lib/                quy tắc thuần: admin/ · auth/ · cart/ · catalog/ · download/ · payment/ · schemas/ · seo/ · rate-limit/ · cron/ · http/origin · format · flash
    i18n/               routing · navigation (dùng chung cho cả app)
    mail/ · storage/
    generated/          Prisma client (không commit)
    types/              next-auth.d.ts
  tests/                unit/ · integration/
docs/                   tài liệu (bản đồ ở CLAUDE.md), kể cả DESIGN.md, README.md
```

### Cấu trúc thư mục (thực tế, 2026-11-15)

> **Ghi chú 2026-11-21:** cây dưới đây là trước khi chia `frontend/` · `backend/` (DECISIONS #48); cây hiện tại ở mục ngay trên.

```
prisma/            schema.prisma · migrations/ · seed/ (index.ts, placeholder.ts, data/)
messages/          vi.json · en.json · zh.json
public/            font, họa tiết, ảnh OG (KHÔNG BAO GIỜ chứa file bán)
scripts/           db-guard.ts · admin-grant.ts · i18n-check.ts · generate-icons.mjs
src/
  app/
    [locale]/
      layout.tsx        layout gốc (html, providers, toast) — không có app/layout.tsx
      not-found.tsx     404 ngoài khung cửa hàng (vd. Admin từ chối) → vẽ SiteShell
      (site)/           khung cửa hàng: shop · product/[slug] · cart · checkout/{demo,result} · design-system · [...rest] · not-found.tsx
        (account)/      login · register · account · library · orders · stats
      admin/            layout (noindex) · page (Tổng quan + thống kê) · products/{new,[id],[id]/sections/[sectionId]} · orders/[code] · users/[id] · coupons/{new,[id]} · audit · settings
    api/                auth/[...nextauth] · payments/[provider]/webhook · files/[token] (link tải ký, dev) · admin/uploads/[ticket] (nhận file tải lên, dev)
    media/[...key]      phục vụ bucket public của driver local (dev)
  server/               db · env · startup-check · flash
    auth/               index · credentials · password · session-validation · current-user · guards (requireUser/requireAdmin) · admin-page (requireAdminPage)
    storage/            types · local · index (getStorage, signedDownloadUrl, uploadUrl) · media-url · file-token · upload-ticket
    modules/            user · product (queries + admin-*) · cart · coupon · order · payment (providers/) · download · library · stats
  components/           ui/ · layout/ · product/ · shop/ · cart/ · checkout/ · download/ · account/ · admin/ · design-system/
  i18n/                 routing · request · navigation
  lib/                  format · cn · flash · contact-channels · schemas/ · auth/ · cart/ · catalog/ · download/ · payment/ · admin/
  styles/               fonts.ts (next/font) — font tự host ở src/fonts/; design tokens ở src/app/globals.css
  types/                next-auth.d.ts
src/proxy.ts            chỉ định tuyến ngôn ngữ (Next 16: middleware → proxy). KHÔNG chặn /admin: mỗi trang Admin tự gọi requireAdminPage(), mỗi action gọi requireAdmin()
tests/                  unit/ · integration/ · e2e/
docs/                   tài liệu (bản đồ ở CLAUDE.md)
```

<details>
<summary>Cây thư mục dự kiến ban đầu (lỗi thời, giữ để tra cứu)</summary>

> **Ghi chú khi chuyển file (2026-11-15):** cây dưới đây là bản dự kiến từ GĐ0. Khác thực tế: `(account)/` nằm trong `(site)/`; chưa có `(info)/`; `api/downloads/[fileId]` đã thay bằng server action `requestDownloadAction`; `cron/reconcile` chưa có (GĐ6); các module `category`, `license`, `review`, `translation` chưa có; `lib/constants` không có; `src/proxy.ts` không chặn /admin.

```
prisma/          schema.prisma · migrations/ · seed/
messages/        vi.json · en.json · zh.json
public/          font, họa tiết, ảnh OG, ảnh placeholder DEMO (KHÔNG BAO GIỜ chứa file bán)
src/
  app/
    [locale]/
      (site)/     khung cửa hàng: shop · product/[slug] · cart · checkout/* · (account)/ · [...rest]
      (account)/  login · register · forgot-password · reset-password · account · account/orders · library
      (info)/     about · contact · faq · license · privacy · refund
      admin/      dashboard · products · categories · orders · users · coupons · licenses
      not-found.tsx
    api/          auth/[...nextauth] · payments/[provider]/webhook · downloads/[fileId] · admin/uploads · cron/reconcile
  server/         db · auth (guards: requireUser/requireAdmin) · storage · email · env (validate bằng Zod)
    modules/      user · product · category · cart · order · payment(providers/) · download · license · review · coupon · stats · translation
  components/     ui/ (design system) · layout/ · product/ · cart/ · admin/
  i18n/           routing · request · navigation
  lib/            format (tiền, ngày) · schemas · constants
  styles/         fonts.ts (next/font)   ·   fonts/ (font tự host)   ·   design tokens: app/globals.css
src/proxy.ts      định tuyến ngôn ngữ (Next 16: middleware → proxy) + chặn /admin (GĐ5)
tests/            unit/ · e2e/
```

</details>

## 3. Cơ sở dữ liệu (Prisma, PostgreSQL)

Tiền lưu **số nguyên VND** (`Int`), không dùng float. Mọi bảng có `createdAt`/`updatedAt`. Locale là enum `vi | en | zh`.

- Schema đầy đủ: `prisma/schema.prisma` (34 model). Ràng buộc Prisma không biểu diễn được nằm trong SQL tay ở cuối `prisma/migrations/*_catalog/migration.sql`: giá ≥ 0, FREE = 0đ, PREMIUM > 0đ, `compareAtPriceVnd` > giá, rating 1–5, coupon % 1–100, tổng đơn = tạm tính − giảm giá, **đúng 1 giấy phép mặc định/sản phẩm** (unique một phần), **tối đa 1 Payment PENDING/đơn**, Cart phải có chủ, `ProductSection.assetCount` ≥ 0 (migration `packs_sections`). Đã kiểm tra: Prisma không đòi xoá các ràng buộc này ở migration sau.
  > **Ghi chú khi chuyển file (2026-11-15):** Hiện có **35** model (thêm `DownloadCredit` ở bước 4.6).
  > **Ghi chú bước 5.6 (2026-11-19):** Hiện có **36** model (thêm `ShopSettings`). CHECK mới: `Coupon.maxUsesPerUser` ≥ 1 (migration `coupon_checks_dedupe`); `ShopSettings` một dòng (id = 1), 1–100 lượt, 1.000–10.000.000 ₫ (migration `admin_coupons_settings`).
  > **Ghi chú bước 7.1 (2026-11-20):** Hiện có **37** model (thêm `RateLimit`: `key` (phạm vi + SHA-256), `count`, `windowStart`; không có `createdAt`/`updatedAt`; migration `rate_limit`).
- Xoá an toàn: sản phẩm đã có đơn/quyền sở hữu không xoá được (Restrict) → dùng `status = HIDDEN`.

**User & Auth**
- `User`: id, email (unique), passwordHash, name, role (`USER|ADMIN`), status (`ACTIVE|LOCKED`), preferredLocale, emailVerifiedAt, `sessionVersion` (tăng khi đổi mật khẩu/khóa tài khoản để vô hiệu JWT cũ)
- `Account` (OAuth, cho sau này), `PasswordResetToken` (tokenHash, userId, expiresAt, usedAt)

**Danh mục & phân loại**
- `Category`: id, slug, sortOrder, bannerKey, iconKey, isActive · `CategoryTranslation` (categoryId, locale, name, description) — PK (categoryId, locale)
- `Genre`, `ArtStyle` + bảng translation · `ProductGenre`, `ProductArtStyle` (n–n)

**Sản phẩm**
- `Product` (= **một bộ asset trọn gói A→Z**): id, slug (unique), type (`FREE|PREMIUM`), status (`DRAFT|PUBLISHED|HIDDEN`), priceVnd, compareAtPriceVnd? (giá gốc khi giảm giá), isFeatured, **isDemoData**, assetCount, resolution, fileFormats[], compatibleSoftware[], salesCount, downloadCount, claimCount, ratingAvg, ratingCount, currentVersionId, publishedAt
- `ProductTranslation`: productId, locale, title, shortDescription, description, contentsList
- `ProductMedia`: id, productId, kind (`THUMBNAIL|IMAGE|GIF|VIDEO`), storageKey (bucket public), mimeType, width, height, sortOrder, **isPlaceholder**
- `ProductVersion`: id, productId, version, changelog (VI/EN/ZH), releasedAt (**null = bản nháp**, file còn đổi được; tối đa 1 bản nháp/bộ — migration `version_drafts`)
- `ProductFile`: id, versionId, storageKey (bucket **private**), filename, sizeBytes, sha256, mimeType
- `ProductSection`: productId, categoryId (unique cặp), sortOrder, assetCount, resolution?, fileFormats[] · `ProductSectionTranslation` (summary, contentsList). Mỗi danh mục trong 21 nhóm là **một phần bên trong bộ**, không phải sản phẩm riêng. `ProductMedia.sectionId` (null = ảnh tổng quan của bộ). `Product.assetCount`/`fileFormats` = tổng/hợp của các phần.
- ~~`BundleItem`~~ — đã bỏ (2026-11-14).

**Giấy phép (mở rộng được)**
- `License`: id, code (`PERSONAL|COMMERCIAL|EXTENDED|...`), allowCommercial, allowModification, allowMultiProject, allowRedistribution, allowResale, isActive · `LicenseTranslation` (name, summary, terms)
  > **Ghi chú khi nghiệm thu (2026-11-15):** Giá trị seed hiện tại của `License.code` là `FREE` và `PREMIUM` (`prisma/seed/data/catalog.ts`; khớp `Product.type`, xem `docs/PRODUCT.md` §3). Cột `code` là chuỗi (`String @unique`), nên `PERSONAL|COMMERCIAL|EXTENDED|...` ở dòng trên không phải giá trị đang dùng.
- `ProductLicense`: productId, licenseId, priceVnd? (null = dùng giá sản phẩm), isDefault — PK (productId, licenseId). **Giai đoạn đầu: mỗi sản phẩm đúng 1 dòng `isDefault = true`.**

**Giỏ hàng & giảm giá**
- `Cart`: id, userId? (unique), guestToken? · `CartItem`: cartId, productId, licenseId — unique (cartId, productId). Không có số lượng.
- `Coupon`: code (unique), kind (`PERCENT|FIXED`), value, minTotalVnd, startsAt, endsAt, maxUses, usedCount, isActive · `CouponRedemption`
  > **Ghi chú bước 5.6 (2026-11-19):** `Coupon` có thêm `maxUsesPerUser?` (lượt mỗi tài khoản, null = không giới hạn; DECISIONS #35). Bảng mới `ShopSettings` (id = 1): `extraDownloadsCount`, `extraDownloadsPriceVnd` — gói mua thêm lượt tải bộ Free do Admin chỉnh; chưa có dòng thì dùng `DEFAULT_EXTRA_DOWNLOADS` (`src/lib/download/rules.ts`).

**Đơn hàng & thanh toán**
- `Order`: id, code (unique, dễ đọc), userId, status (`PENDING|PAID|FAILED|CANCELLED|EXPIRED|REFUNDED`), subtotalVnd, discountVnd, totalVnd, couponId?, buyerName, buyerEmail, locale, **isDemo**, paidAt
- `OrderItem`: orderId, productId, productType, titleSnapshot, priceSnapshotVnd, licenseId, licenseSnapshot (json), versionId
- `Payment`: id, orderId, provider (`DEMO|PAYOS|VNPAY|MOMO`), providerTxnId (unique), amountVnd, status (`PENDING|SUCCEEDED|FAILED|CANCELLED`), rawPayload (jsonb)
- `WebhookEvent`: provider, eventId — unique (provider, eventId) để xử lý **idempotent**; payload, processedAt
- `Refund`: orderId, amountVnd, reason, status, adminId

**Quyền sở hữu & tải xuống (lõi bảo mật)**
- `Entitlement`: userId, productId, licenseId, source (`PURCHASE|FREE_CLAIM|ADMIN_GRANT`), orderId?, grantedAt, revokedAt? — unique (userId, productId)
- `DownloadCredit`: userId, productId (PK cặp), extraDownloads — lượt tải bộ Free đã mua thêm (4.6), chỉ webhook cộng. `OrderItem.kind` = PACK | EXTRA_DOWNLOADS (+ `extraDownloads`).
- `DownloadLog`: userId, productId, fileId, ip, userAgent, createdAt — `userId` **nullable** (đã làm 4.1: lượt tải bộ Free của khách chưa đăng nhập, không gắn người, chỉ để thống kê/chống lạm dụng); `ip` luôn là SHA-256 có muối (chỉ ghi cho khách), không lưu IP thô
 **Từ 4.5 khách không tải được nữa** → không ghi dòng mới không gắn user / có `ip`; cột giữ cho dữ liệu cũ. Lượt tải Free đã dùng = số dòng `DownloadLog` (userId, productId).
  > **Ghi chú khi chuyển file (2026-11-15):** Hai câu về `userId` nullable và `ip` mô tả dữ liệu từ thời khách còn tải được (4.1–4.4). Từ 4.5 mọi lượt tải đều gắn tài khoản; cột giữ cho dữ liệu cũ (DECISIONS #28).

**Khác**
- `Review`: userId, productId (unique cặp), rating 1–5, body, locale, status, isVerifiedOwner
- `AuditLog`: adminId, action, entity, entityId, diff (json)
  > **Ghi chú 2026-11-26:** đổi thứ tự ảnh / video (mũi tên lên / xuống ở thẻ Ảnh & video) nay ghi action `product.media.reorder` (diff: `mediaId`, `from`, `to` (vị trí trước / sau, đếm từ 0), `sectionId`) trong cùng transaction với `reorderGallery` (`backend/src/modules/product/admin-media-repository.ts`); danh sách action của trang Nhật ký: `AUDIT_ACTIONS` (`backend/src/lib/admin/audit-rules.ts`, unit test so với code).

## 4. Thanh toán

- Interface `PaymentProvider { createPayment(order), verifyWebhook(req), queryStatus(order) }` trong `src/server/modules/payment/providers/`. Thêm cổng mới = thêm 1 provider, không sửa luồng đơn hàng.
- **Hiện tại chỉ triển khai `DemoProvider`.** PayOS / VNPay / MoMo để sau, khi người dùng xác nhận có tài khoản.
  > **Ghi chú bước 6.4 (2026-11-20):** đã có thêm cổng MoMo (môi trường thử; xem ghi chú bước 6.4 ở đầu file). PayOS / VNPay vẫn chờ.
  > **Ghi chú bước SePay (2026-11-21):** đã có thêm cổng SePay (chuyển khoản VietQR, DECISIONS #45; xem ghi chú ở đầu file). Khác luồng chuẩn ở bước 4: chuyển khoản đúng số tiền tới sau khi đơn EXPIRED vẫn chuyển đơn sang PAID; thông báo có chữ ký nhưng không khớp đơn được ghi vào `UnmatchedTransfer` (không cấp gì).
  > **Ghi chú Admin Đơn hàng (2026-11-21):** giá trị `MANUAL` của `PaymentProvider` dành cho đơn tay của Admin (DECISIONS #46): không có adapter, không có webhook; đơn được tạo thẳng ở trạng thái PAID trong thao tác của Admin (xem ghi chú ở đầu file).

**Luồng chuẩn**
1. Checkout: server đọc giỏ, **tính lại giá từ DB**, kiểm tra coupon, loại sản phẩm đã sở hữu → tạo `Order(PENDING)` kèm snapshot.
  > **Ghi chú 2026-11-26 (DECISIONS #61):** mỗi tài khoản chỉ có một đơn đang chờ thanh toán; đơn chờ thanh toán giữ lượt của mã giảm giá; tạo đơn khoá tài khoản và mã giảm giá. Người mua huỷ được đơn của mình (trừ MoMo). Xem ghi chú ở đầu file.
2. `provider.createPayment()` → URL/QR.
3. Trang return **chỉ hiển thị trạng thái "đang xác nhận" và poll** — **không bao giờ cấp quyền**.
4. **Chỉ webhook** được chuyển đơn sang PAID, sau khi: chữ ký hợp lệ, số tiền = `order.totalVnd`, mã đơn khớp, `WebhookEvent` chưa xử lý.
5. Trong **một transaction**: Payment SUCCEEDED → Order PAID → tạo Entitlement (dòng PACK) / cộng `DownloadCredit` (dòng EXTRA_DOWNLOADS) → tăng salesCount (chỉ PACK) → ghi CouponRedemption.
6. Gửi email xác nhận theo `order.locale`.
7. Cron đối soát (`/api/cron/reconcile`, Vercel Cron) kiểm tra đơn PENDING quá hạn; đơn quá hạn → EXPIRED.
  > **Ghi chú bước 6.3 (2026-11-20):** đã làm: chỉ ghi EXPIRED khi quá hạn hơn 15 phút; chưa hỏi cổng thanh toán (làm ở 6.4). Xem ghi chú bước 6.3 ở đầu file.
  > **Ghi chú bước 6.4 (2026-11-20):** trước khi cho đơn hết hạn, cron hỏi cổng đang bật (`queryStatus`): thất bại / huỷ, hoặc cổng không giữ trạng thái (Demo) → EXPIRED; còn đang trả hoặc không hỏi được → giữ PENDING, lần sau hỏi lại; cổng báo đã trả mà chưa có thông báo có chữ ký → giữ PENDING + ghi log, **không cấp quyền**. Đơn của cổng khác cổng đang bật → EXPIRED như trước. Báo cáo của job có thêm `waitingOrders`.
8. Hoàn tiền (Admin): Order REFUNDED → thu hồi Entitlement liên quan (`revokedAt`).
  > **Ghi chú khi chuyển file (2026-11-15):** Hoàn tiền cũng phải **trừ lại `DownloadCredit`** của dòng EXTRA_DOWNLOADS (PROGRESS 4.6; ROADMAP 5.4).

**Demo Payment**
- Bật bằng `PAYMENT_PROVIDER=demo`. Trang thanh toán giả có nút "Thành công" / "Thất bại" và đi qua **cùng đường webhook** (có ký HMAC) như cổng thật.
- Luôn hiển thị banner "CHẾ ĐỘ DEMO — không có giao dịch thật"; đơn demo có `isDemo = true` và nhãn DEMO trong Library/Admin.
- **Cấm ở production:** khi `APP_ENV=production` (hoặc `VERCEL_ENV=production`) mà provider là `demo` → ứng dụng **từ chối khởi động** (kiểm tra trong `src/server/env.ts`). Lưu ý `NODE_ENV` trên Vercel preview cũng là `production`, nên phải dùng `APP_ENV`/`VERCEL_ENV`.

## 5. Bảo vệ file tải xuống và lưu trữ

- File bán chỉ nằm trong bucket R2 **private**. **Không bao giờ** để trong `public/`, không render đường dẫn file vào HTML, không lưu signed URL vào DB/cache.
- Tải xuống qua **server action `requestDownloadAction(productId, fileId?)`** (`src/server/modules/download/actions.ts`; thay cho `GET /api/downloads/[fileId]` dự kiến ban đầu: POST có kiểm tra origin của Next nên trang khác không thể khiến người đang đăng nhập "claim" bộ qua `<img>`, và lỗi trả về dạng dữ liệu để hiện toast): kiểm tra sản phẩm còn PUBLISHED →
  - **PREMIUM:** bắt buộc session → `Entitlement` còn hiệu lực (từ đơn PAID) → rate limit → ghi `DownloadLog` → signed URL.
  - **FREE:** bắt buộc session → còn lượt (2 trọn đời/bộ + lượt mua thêm; đếm lại trong transaction có `pg_advisory_xact_lock`) → tự tạo `FREE_CLAIM` (nếu chưa có) + ghi `DownloadLog`. Không session → `signInRequired`. Hết lượt → `quotaExhausted`. Chốt chống bot 100 lượt/giờ/tài khoản áp cho cả Free và Premium.
  - Cuối cùng tạo **signed URL hạn ~60 giây** (`Content-Disposition: attachment`), trả cho trình duyệt **một lần** để tải ngay (không render vào HTML, không lưu). Không bao giờ trả URL cố định.
  - (Đến 4.4 khách được tải Free, giới hạn theo IP băm từ `x-real-ip` — đã bỏ ở 4.5; IP không còn được đọc trong luồng tải.)
- Admin upload (5.3): vé ký bởi server (bucket + key do server chọn) → PUT thẳng vào kho (local: `/api/admin/uploads/[ticket]`; R2: presigned PUT ở GĐ7) → server kiểm tra magic bytes + SHA-256 rồi mới tạo dòng. File bán vào bucket private (chỉ nén ZIP/7Z/RAR); ảnh/video preview vào bucket public (không SVG).
- Test bắt buộc (đã có đủ, 4.4): quy tắc thuần ở `tests/unit/download.test.ts`/`payment.test.ts`, service thật ở `tests/integration/download-security.test.ts` (hoàn tiền = Order REFUNDED + Entitlement `revokedAt` mô phỏng đúng việc Admin GĐ5 sẽ làm; webhook trùng gửi 3 lần cùng lúc → 1 quyền, 1 lượt bán; file id của bộ khác → notFound), luồng UI/HTTP ở `tests/e2e/download.spec.ts`/`checkout.spec.ts`/`orders.spec.ts`, Demo bị cấm ở production ở `tests/unit/env.test.ts`. Khi làm hoàn tiền ở GĐ5, gọi service hoàn tiền thật trong test tích hợp thay cho bước mô phỏng. Danh sách: bộ **PREMIUM** — chưa đăng nhập / chưa thanh toán / đơn bị hoàn tiền → không tải được; webhook gửi lặp không cấp quyền hai lần; sai số tiền bị từ chối. Bộ **FREE** — khách tải được nhưng không tạo Entitlement; người đăng nhập tải → có trong Library + lịch sử; sản phẩm HIDDEN/DRAFT → không ai tải được; file của bộ Premium không bao giờ tải được qua nhánh Free.
  > **Ghi chú khi chuyển file (2026-11-15):** Ý "Bộ **FREE** — khách tải được nhưng không tạo Entitlement" đã bị thay ở 4.5 (DECISIONS #28): khách không tải được; test tương ứng kiểm tra khách bị từ chối (`tests/integration/download-security.test.ts`, `tests/e2e/download.spec.ts`).

Ảnh sản phẩm và lưu trữ (từ "Lưu ý kỹ thuật" cũ):

- **Ảnh sản phẩm:** dùng `mediaUrl(key)` (`src/server/storage/media-url.ts`). Driver local phục vụ qua `src/app/media/[...key]/route.ts` — **chỉ bucket public**, whitelist đuôi file, SVG có CSP `sandbox` + `nosniff`; file bucket private không bao giờ lấy được ở đây (có test E2E). Ảnh render `unoptimized` + class `pixelated`. Admin upload (5.3) **không nhận SVG** (SVG chỉ còn ở ảnh giữ chỗ do seed tạo); nội dung file được kiểm tra theo magic bytes. Route hỗ trợ HTTP Range cho video.

> **Ghi chú bước 7.5 (2026-11-21, DECISIONS #53):** driver R2 đã làm: `backend/src/storage/r2.ts` (S3 API của R2 qua AWS SDK v3, endpoint `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`), quy tắc thuần ở `backend/src/storage/r2-rules.ts` (có unit test), `backend/src/storage/create.ts` chọn driver theo `STORAGE_DRIVER`. Tên bucket lấy từ `R2_PUBLIC_BUCKET` / `R2_PRIVATE_BUCKET` (không cố định là `public-media` / `private-assets`; dev và production dùng bucket riêng). (1) **Ảnh / video xem trước:** `mediaUrl(key)` = `R2_PUBLIC_BASE_URL` + key: tên miền riêng gắn vào bucket ảnh, trình duyệt tải thẳng từ Cloudflare; địa chỉ r2.dev chỉ để thử ở dev, `APP_ENV=production` từ chối r2.dev; route `/media/…` trả 404 khi dùng R2. (2) **Tải file bán:** sau các bước kiểm quyền ở trên, server ký một link GET của bucket private sống **60 giây**, kèm `Content-Disposition: attachment` (tên file UTF-8) và `Cache-Control: private, no-store`; link chỉ trả cho trình duyệt một lần, không lưu. Bucket private không bật truy cập công khai nào. (3) **Admin tải lên:** vé vẫn do server cấp (bucket + key do server chọn); với R2 server ký một link PUT sống **30 phút** (bằng hạn vé), chữ ký gồm `Content-Type`, `Cache-Control` và `Content-Length` (đúng dung lượng đã khai), và trả kèm các header trình duyệt phải gửi; trình duyệt gửi thẳng lên R2 (không đi qua Vercel); xong, `finishUpload` đọc lại object (stream) để kiểm magic bytes + SHA-256 như driver local. Trình duyệt gửi được nhờ CORS của bucket (`AllowedOrigins` = địa chỉ web, phương thức `PUT`, header `Content-Type`, `Cache-Control`). Link ký chỉ chạy trên endpoint S3, không chạy trên tên miền riêng. (4) **Cache:** file Admin tải lên (`packs/…`, mỗi lần một tên mới) `public, max-age=31536000, immutable`; ảnh khác của bucket ảnh (ảnh demo của seed) 1 giờ; bucket private `private, no-store`. Seed và việc dọn file không còn dùng (`cron:run cleanup`) gọi driver đang chọn (chưa chạy thử hai việc này trên R2; dữ liệu dev được chép lên bằng `npm run storage:push`).

## 6. Đa ngôn ngữ VI / EN / ZH (ưu tiên cao)

- 3 ngôn ngữ: **Tiếng Việt `vi` (mặc định)**, **English `en`**, **中文 giản thể `zh`** (`<html lang="zh-CN">`, map trong `HTML_LANG` ở `src/i18n/routing.ts`). Thêm ngôn ngữ = thêm vào `routing.locales` + tạo `messages/<locale>.json` + thêm tên ngôn ngữ (autonym) vào `localeSwitcher` của mọi file.

- Áp dụng **100% website**, kể cả Admin, popup, modal, tooltip, toast, lỗi, loading/empty/success state, email giao dịch.
- Route: `/vi/...`, `/en/...`, `/zh/...`. **Lần đầu truy cập luôn là `vi`** (không tự đoán theo trình duyệt). Lựa chọn lưu ở cookie `NEXT_LOCALE` và `User.preferredLocale`; tải lại vẫn giữ.
- Đổi ngôn ngữ: giữ nguyên trang hiện tại và query (bộ lọc); không mất giỏ hàng (lưu DB) hay đăng nhập (cookie).
- Text giao diện: **chỉ** lấy từ `messages/vi.json`, `messages/en.json`, `messages/zh.json` (namespace theo khu vực). **Không hardcode chuỗi hiển thị trong component.** next-intl được cấu hình type-safe → thiếu key là lỗi typecheck. `npm run i18n:check` so sánh mọi file: cùng bộ key, không giá trị rỗng.
- Nội dung (sản phẩm, danh mục, giấy phép, thể loại): bảng `*Translation`. Admin bắt buộc nhập đủ VI, EN và ZH mới được Publish; Dashboard liệt kê nội dung thiếu bản dịch. Fallback sang VI chỉ là phương án cuối, có cờ cảnh báo cho Admin.
  > **Ghi chú (2026-11-20, DECISIONS #39):** câu "Admin bắt buộc nhập đủ VI, EN và ZH mới được Publish" và câu fallback sang VI **không còn đúng với nội dung bộ asset**: chỉ cần 1 ngôn ngữ viết đủ (tên, mô tả ngắn, mô tả + tóm tắt mọi phần) là đăng bán được; cửa hàng chỉ hiện bộ ở ngôn ngữ đã có tên + mô tả ngắn + mô tả (`writtenIn` / `visibleIn` trong `src/server/modules/product/queries.ts`, cùng quy tắc với `packTextLocales` trong `src/lib/admin/product-rules.ts`), ở ngôn ngữ khác bộ bị ẩn và trang bộ là 404; không lấy chữ ngôn ngữ khác. Fallback (`pickTranslation`) chỉ còn dùng cho tên phải luôn hiện: giỏ hàng, Thư viện, Đơn hàng, Admin, tên thể loại / danh mục. Chuông "Cần chú ý" của Admin liệt kê bộ chưa viết đủ mọi ngôn ngữ.
- Tiền: luôn VND, **không quy đổi**, chỉ định dạng theo locale (`150.000 ₫` / `₫150,000` / `₫150,000`). Ngày dùng `Intl`.
- SEO: `hreflang`, metadata theo ngôn ngữ.
- Kiểm tra: chế độ EN và ZH không còn chữ tiếng Việt, chế độ VI không còn tiếng Anh giao diện, chế độ ZH hiển thị tiếng Trung; không lộ key kỹ thuật; kiểm tra desktop + mobile. Tên thương hiệu, tên sản phẩm, tên file gốc có thể giữ nguyên.

## 7. Xác thực và cấu hình an toàn (từ "Lưu ý kỹ thuật" cũ)

- Auth.js `5.0.0-beta.32` (ghim cố định — v5 chưa có bản stable). Mở rộng kiểu JWT phải khai báo trên `@auth/core/jwt` (xem `src/types/next-auth.d.ts`).
- Kiểm tra cấu hình an toàn ở 2 lớp: `src/server/startup-check.ts` (server thoát nếu cấu hình không an toàn) và `next.config.ts` (build Vercel production fail).
