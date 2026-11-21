# Asset Game MMORPG 2D

Chợ tài nguyên đồ họa game 2D (HD Pixel Art, phong cách phương Đông): xem trước, mua, tải về, thư viện cá nhân và khu quản trị (Admin). Giao diện 3 ngôn ngữ: Tiếng Việt (mặc định), English, 中文.

Công nghệ: Next.js 16 · Prisma 7 · PostgreSQL trên Neon · Cloudflare R2 · Auth.js v5 · next-intl · Tailwind.

Tài liệu chi tiết: [docs/](docs/) (sản phẩm, kiến trúc, lộ trình, quyết định đã xác nhận, vận hành) và [docs/DESIGN.md](docs/DESIGN.md) (giao diện). Quy tắc làm việc của dự án: [CLAUDE.md](CLAUDE.md).

## Mục lục

1. [Yêu cầu](#1-yêu-cầu)
2. [Chạy trên máy (phát triển)](#2-chạy-trên-máy-phát-triển)
3. [Cấu hình biến môi trường](#3-cấu-hình-biến-môi-trường)
4. [Dữ liệu demo](#4-dữ-liệu-demo)
5. [Cấp và thu quyền Admin](#5-cấp-và-thu-quyền-admin)
6. [Cloudflare R2 (lưu file)](#6-cloudflare-r2-lưu-file)
7. [Bản thử trên Vercel](#7-bản-thử-trên-vercel)
8. [Các lệnh](#8-các-lệnh)
9. [Kiểm thử](#9-kiểm-thử)
10. [Lỗi thường gặp](#10-lỗi-thường-gặp)
11. [Quy tắc bắt buộc](#11-quy-tắc-bắt-buộc)

## 1. Yêu cầu

- **Node.js 20.9 trở lên** và npm (kiểm tra: `node -v`).
- **Git**.
- **Tài khoản Neon** (PostgreSQL miễn phí): tạo project, rồi tạo nhánh `dev` riêng cho máy bạn. Không dùng nhánh `production` để phát triển.
- **Tài khoản Cloudflare** (R2) chỉ cần khi muốn dùng R2. Chạy trên máy có thể dùng driver `local` (không cần Cloudflare).
- **Tài khoản Vercel** chỉ cần khi đưa bản thử lên mạng (mục 7).

## 2. Chạy trên máy (phát triển)

Chạy mọi lệnh từ **thư mục gốc** của repo.

```bash
# 1. Cài thư viện (cũng sinh Prisma client)
npm install

# 2. Tạo file cấu hình trên máy bạn, rồi điền giá trị (xem mục 3)
cp .env.example .env.local

# 3. Tạo bảng trong database dev (dùng DIRECT_URL, kết nối không có -pooler)
npm run db:migrate

# 4. (Tuỳ chọn) Nạp danh mục, thể loại, 10 bộ demo và mã giảm giá demo (mục 4)
npm run db:seed

# 5. Chạy web
npm run dev
```

Mở **http://localhost:3000** (tự chuyển sang `/vi`). Đăng ký một tài khoản, rồi cấp quyền Admin theo mục 5.

Ở máy bạn, mọi thư gửi đi (quên mật khẩu, v.v.) được ghi thành file trong thư mục `.mail-outbox/` để xem, không gửi thật. Xem thư mẫu: `npm run mail:preview`.

## 3. Cấu hình biến môi trường

Toàn bộ biến nằm trong `.env.example` (có chú thích tiếng Việt và tiếng Anh). Giá trị thật **chỉ** nằm trong `.env.local` trên máy bạn. Không commit file này, không dán giá trị vào chat, không để trong file nào khác.

Kiểm tra cấu hình khi khởi động: nếu thiếu hoặc sai, web từ chối chạy và báo đúng biến cần sửa.

### Nhóm bắt buộc

| Biến | Ý nghĩa | Ghi chú |
|---|---|---|
| `APP_ENV` | `development`, `test`, `preview` hoặc `production` | Trên máy: `development`. Vercel tự đặt đúng giá trị. |
| `APP_URL` | Địa chỉ web, ví dụ `http://localhost:3000` | Dùng cho link trong thư và CORS của R2. |
| `DATABASE_URL` | Chuỗi kết nối **pooled** (host có `-pooler`) | App chạy bằng chuỗi này. |
| `DIRECT_URL` | Chuỗi kết nối **direct** (không có `-pooler`) | Chỉ dùng cho migrate. Giữ `sslmode=require`. |
| `AUTH_SECRET` | Khoá ký phiên đăng nhập, tối thiểu 32 ký tự | Tạo: `npx auth secret`. |
| `PAYMENT_PROVIDER` | `demo` (mặc định), `sepay`, `momo` | `demo` không nhận tiền thật và **bị cấm ở production**. |
| `STORAGE_DRIVER` | `local` (mặc định trên máy) hoặc `r2` | `r2` là bắt buộc ở production. |
| `STORAGE_LOCAL_ROOT` | Thư mục file khi dùng `local`, mặc định `.storage` | Nằm ngoài `public/`, không bao giờ commit. |
| `MAIL_DRIVER` | `outbox` (ghi file, chỉ dùng ở máy) | Production cần dịch vụ gửi thật. |
| `MAIL_OUTBOX_DIR` | Thư mục thư ghi ra, mặc định `.mail-outbox` | |
| `CRON_SECRET` | Khoá bảo vệ các việc định kỳ `/api/cron/*`, tối thiểu 32 ký tự | Trên máy chạy tay bằng `npm run cron:run`. |

### Nhóm R2 (khi `STORAGE_DRIVER=r2`)

Xem mục 6. Các biến: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET`, `R2_PUBLIC_BASE_URL`.

### Nhóm thanh toán (khi dùng cổng thật)

- **SePay** (chuyển khoản VietQR): `SEPAY_MODE` (`test` hoặc `live`; production bắt buộc `live`), `SEPAY_WEBHOOK_SECRET`, `SEPAY_BANK_ACCOUNT`, `SEPAY_BANK_NAME`, `SEPAY_ACCOUNT_NAME`. Trên máy cần một đường công khai để SePay gọi webhook (xem `docs/OPERATIONS.md` §4).
- **MoMo**: `MOMO_ENDPOINT`, `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY`. Hiện đang tạm dừng (DECISIONS #42), chỉ cần khi bật lại.

### Nhóm Neon riêng cho production

`PRODUCTION_DATABASE_HOSTS` liệt kê host của database production. Các lệnh `db:*` và `admin:*` **từ chối** chạy trên những host này. Chuỗi kết nối production không bao giờ nằm trong `.env.local`; xem mục 11.

## 4. Dữ liệu demo

`npm run db:seed` làm 3 việc, và có thể chạy lại nhiều lần:

- Tạo/cập nhật 21 danh mục, thể loại, phong cách, giấy phép và phần "Lợi ích".
- **Xoá và tạo lại** 10 bộ demo (đánh dấu `isDemoData`), kèm ảnh giữ chỗ có chữ DEMO và file README demo.
- Tạo/cập nhật mã giảm giá demo (mã bắt đầu bằng `DEMO`).

Bộ thật do bạn đăng (không đánh dấu demo) **không bị đụng tới**. Chỉ cần nạp mã giảm giá demo mà không làm lại bộ: `npm run db:seed:coupons`.

Mọi nội dung demo đều ghi rõ là DEMO, không phải sản phẩm thật.

## 5. Cấp và thu quyền Admin

Admin là tài khoản có vai trò `ADMIN`. Cách làm:

1. **Tài khoản phải đăng ký trước** qua giao diện web (`/vi/register`). Lệnh không tạo tài khoản mới.
2. Cấp quyền:
   ```bash
   npm run admin:grant -- email@cua-ban.com
   ```
3. Thu quyền:
   ```bash
   npm run admin:revoke -- email@cua-ban.com
   ```

Lưu ý:
- Vai trò được đọc lại từ database ở mỗi lần truy cập, nên cấp hoặc thu có hiệu lực ngay, không cần đăng nhập lại khi cấp.
- **Thu quyền** tăng `sessionVersion` của tài khoản, nên mọi phiên đang đăng nhập bị đăng xuất.
- Trên **bản thử Vercel**, dùng `npm run preview:grant -- <email>` và `npm run preview:revoke -- <email>` (đọc `.env.preview`, không đọc `.env.local`).
- Trên **web chạy thật (production)**: tài khoản đăng ký trên web thật trước, rồi **bạn tự chạy** `npm run db:prod:grant -- <email>` (hoặc `db:prod:revoke`). Lệnh đọc chuỗi kết nối từ `.env.production-db`, chỉ ghi vào database có trong `PRODUCTION_DATABASE_HOSTS` và hỏi bạn gõ đúng mã endpoint Neon trước khi ghi (`docs/OPERATIONS.md` §2).

Sau khi được cấp quyền, vào **/vi/admin** để quản lý bộ asset, đơn hàng, người dùng, mã giảm giá và nhật ký.

## 6. Cloudflare R2 (lưu file)

R2 lưu hai loại file, tách thành 2 bucket:

- **Bucket public:** ảnh và video xem trước. Trình duyệt tải thẳng từ địa chỉ `R2_PUBLIC_BASE_URL`.
- **Bucket private:** file bán. **Không bật truy cập công khai.** Khách chỉ tải được qua link ký sẵn sống 60 giây, sau khi server kiểm quyền sở hữu.

Các bước cài (một lần cho mỗi môi trường):

1. **Tạo 2 bucket** trong R2 Object Storage, ví dụ `asset-game-dev-public` và `asset-game-dev-private`.
2. **Bucket public → Settings → Public Development URL → Enable** để có địa chỉ `https://pub-….r2.dev` (chỉ dùng để thử). Web thật phải dùng tên miền riêng gắn vào bucket (Custom Domains).
3. **CORS cho cả 2 bucket** (Settings → CORS Policy, dạng JSON):
   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000", "http://localhost:3100"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["Content-Type", "Cache-Control"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   `3000` là dừng khi phát triển, `3100` là E2E. Bản thử và production ghi địa chỉ web thật của mình.
4. **Tạo API token** (R2 → Manage API Tokens): quyền **Object Read & Write**, chỉ cho 2 bucket trên. Chép Access Key ID và Secret Access Key (secret chỉ hiện một lần).
5. Điền 6 biến R2 vào `.env.local`, giữ `STORAGE_DRIVER=local`, rồi chạy:
   ```bash
   npm run storage:check        # 8 bước: ghi/đọc, ảnh công khai, file bán bị chặn, link tải, CORS, dọn
   npm run storage:push         # chép file đang có trong .storage/ lên R2 (thêm --dry-run để chỉ đếm)
   ```
6. Khi mọi bước ✔, đổi `STORAGE_DRIVER=r2` và khởi động lại `npm run dev`.

## 7. Bản thử trên Vercel

Bản thử chạy cổng **Demo** (không nhận tiền thật), database và bucket **riêng** (không dùng dữ liệu dev). Hướng dẫn đầy đủ từng bước (GitHub, nhánh Neon, R2, Vercel): `docs/OPERATIONS.md` §8. Tóm tắt:

1. Đưa code lên GitHub (repo riêng tư). `.gitignore` chặn `.env*`, `.storage/`, `.backup/`.
2. Tạo nhánh Neon `preview` (tắt tự xoá), 2 bucket R2 `…-preview-…` và token riêng.
3. Tạo file cấu hình của bản thử:
   ```bash
   npm run preview:init       # tạo .env.preview (khoá ngẫu nhiên đã sẵn), rồi điền các dòng còn trống
   ```
4. Trên Vercel: import repo, đặt **Production Branch = `production`** (để `main` là Preview), tắt Deployment Protection nếu muốn ai có link cũng mở được, dán nội dung `.env.preview` vào Environment Variables **chỉ cho môi trường Preview**.
5. Dựng database và file của bản thử:
   ```bash
   npm run preview:setup      # migrate + seed (danh mục, 10 bộ demo, ảnh demo)
   npm run preview:check      # kiểm R2 và CORS của địa chỉ bản thử
   ```
6. Đẩy một commit lên `main` để Vercel build bản Preview.

Các lệnh `preview:*` từ chối chạy nếu nhầm sang production, nhầm sang database dev, hoặc nhầm bucket dev.

## 8. Các lệnh

Chạy từ thư mục gốc. Bảng đầy đủ kèm giải thích: `CLAUDE.md` mục 1.

| Nhóm | Lệnh | Việc làm |
|---|---|---|
| Chạy | `npm run dev` | Web phát triển tại localhost:3000 |
| | `npm run build` / `npm start` | Bản build production trên máy |
| Kiểm tra | `npm run typecheck` / `lint` / `i18n:check` | Kiểu, lint, đủ bản dịch 3 ngôn ngữ |
| Database | `npm run db:migrate` | Tạo migration (nhánh dev) |
| | `npm run db:seed` / `db:seed:coupons` | Nạp dữ liệu demo |
| | `npm run db:studio` | Xem database trên trình duyệt |
| Quyền | `npm run admin:grant -- <email>` / `admin:revoke` | Cấp / thu quyền Admin |
| Việc định kỳ | `npm run cron:run` (hoặc `-- reconcile` / `-- cleanup`) | Chạy tay các việc định kỳ |
| R2 | `npm run storage:check` / `storage:push` | Kiểm và chép file lên R2 |
| Bản thử | `npm run preview:init` / `setup` / `check` / `grant` / `revoke` | Xem mục 7 |
| Web thật | `npm run prod:init` / `prod:check` | Tạo và kiểm `.env.vercel-production` trước khi chạy thật (`docs/OPERATIONS.md` §9) |
| Thư | `npm run mail:preview` | Ghi thư mẫu ra thư mục để xem |

Các lệnh `db:prod:*` (`status`, `migrate`, `reference`, `grant`, `revoke`) chỉ dùng cho production và do người dùng tự chạy (mục 11).

## 9. Kiểm thử

```bash
npm test                 # unit (backend + frontend)
npm run test:integration # tích hợp, trên database dev
npm run build && npm run test:e2e   # E2E, cần build trước
```

- Chạy `npm test` và `npm run test:integration` từ **PowerShell** trên Windows (từ Git Bash, Vitest báo lỗi "failed to find the runner").
- E2E chạy trên cổng 3100 và tự khởi động server; tắt server đang chiếm cổng 3000 trước khi chạy.
- E2E và tích hợp tạo dữ liệu thử có tiền tố riêng và tự xoá, nhưng vẫn ghi vào database dev: không chạy trên production.

## 10. Lỗi thường gặp

| Triệu chứng | Nguyên nhân và cách sửa |
|---|---|
| Web không chạy, báo "Cấu hình môi trường không an toàn" | Đọc danh sách biến bị báo, sửa trong `.env.local`. Đây là chốt chặn có chủ đích. |
| `db:migrate` báo DIRECT_URL trỏ tới pooler | Dùng chuỗi **không có** `-pooler` cho `DIRECT_URL`. |
| Vercel build lỗi "production" và thiếu biến | Nhánh `main` đang là Production Branch. Đổi sang `production` trong Settings → Branch Tracking (xem mục 7). |
| Ảnh không hiện | Kiểm `R2_PUBLIC_BASE_URL` và CORS của bucket public (`npm run storage:check`). |
| Tải file lên ở Admin báo "Tải lên thất bại" | CORS của bucket thiếu địa chỉ web đang dùng (cổng 3000, 3100, hoặc địa chỉ Vercel). |
| Cổng 3000 bận khi `npm run dev` | Có server khác đang chạy: tắt nó hoặc đổi cổng. |
| Sau khi cấp Admin, vẫn không thấy mục Quản trị | Tải lại trang. Nếu vẫn không thấy, kiểm tra email có đúng tài khoản đã đăng ký không. |
| Prisma báo thiếu client | Chạy `npm run db:generate` (hoặc `npm install`). |

## 11. Quy tắc bắt buộc

- **Không commit** `.env*` (trừ `.env.example`), `.storage/`, `.mail-outbox/`, `.backup/`. `.gitignore` đã chặn, đừng bỏ chặn.
- **Không dán** khoá, mật khẩu, chuỗi kết nối hay secret vào chat, issue hay commit. Nếu lỡ dán, đổi ngay.
- **Không chạy migrate hoặc seed trên production.** Chỉ dùng `db:*` (có chốt chặn). Migration production do người dùng tự chạy qua `npm run db:prod:status | db:prod:migrate | db:prod:reference` (cấp quyền Admin: `db:prod:grant | db:prod:revoke`), cần nhập xác nhận (`docs/OPERATIONS.md` §2).
- **File bán** không bao giờ nằm trong thư mục công khai hay bucket public. Không lưu link tải vào database hay cache.
- **Không đổi quyết định đã xác nhận** trong `docs/DECISIONS.md` khi chưa hỏi người dùng.
