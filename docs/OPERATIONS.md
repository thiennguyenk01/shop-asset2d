# Vận hành

Môi trường, cơ sở dữ liệu, chạy và chia sẻ web, sao lưu. Không chứa giá trị bí mật: giá trị thật chỉ nằm trong `.env.local` trên máy người dùng.

## 1. Biến môi trường và quy tắc an toàn

- Quy tắc an toàn về biến môi trường, secret và lệnh `prisma`: xem `CLAUDE.md` (khối "Bất khả xâm phạm" và dòng "Biến môi trường" ngay dưới bảng lệnh). Không chép lại ở đây.
- Danh sách biến (`.env.example`): `APP_ENV`, `APP_URL`, `DATABASE_URL`, `DIRECT_URL`, `PRODUCTION_DATABASE_HOSTS`, `AUTH_SECRET`, `PAYMENT_PROVIDER`, `STORAGE_DRIVER`, `STORAGE_LOCAL_ROOT`. Kiểm tra ở `backend/src/env.ts` (production bắt buộc `STORAGE_DRIVER=r2`; `PAYMENT_PROVIDER=demo` bị cấm khi `APP_ENV`/`VERCEL_ENV` = production).
- Biến cho cổng MoMo (bước 6.4): `MOMO_ENDPOINT`, `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY`, chỉ cần khi `PAYMENT_PROVIDER=momo` (xem `.env.example`).
- Biến cho cổng SePay (DECISIONS #45): `SEPAY_MODE` (`test` | `live`; production bắt buộc `live`), `SEPAY_WEBHOOK_SECRET` (khoá HMAC của webhook SePay), `SEPAY_BANK_ACCOUNT`, `SEPAY_BANK_NAME`, `SEPAY_ACCOUNT_NAME`; chỉ cần khi `PAYMENT_PROVIDER=sepay` (xem `.env.example`). Khoá chỉ nằm trong `.env.local`.
- Biến cho Cloudflare R2 (bước 7.5, DECISIONS #53): `R2_ACCOUNT_ID` (32 ký tự hex), `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET` (2 bucket khác nhau), `R2_PUBLIC_BASE_URL` (địa chỉ `https://` của bucket ảnh: tên miền riêng; r2.dev chỉ ở dev); bắt buộc khi `STORAGE_DRIVER=r2`. Cách cài: §7.
- Biến cho đăng nhập Google (DECISIONS #63): `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (điền cả hai hoặc bỏ trống cả hai; trống thì nút "Tiếp tục với Google" không hiện). Cách cài: §10.

## 2. Neon (PostgreSQL)

- Project `asset-game-mmorpg-2d` (AWS Singapore, Free plan, PostgreSQL 18). Nhánh `production` (mặc định) và nhánh `dev` (dùng khi phát triển, host `ep-<mã nhánh dev>…`). Chi tiết lúc kết nối: `docs/PROGRESS.md`, GĐ0.
- `DATABASE_URL` = **pooled** (host `-pooler`, `sslmode=verify-full`) dùng lúc chạy; `DIRECT_URL` = **direct** (`sslmode=require`) chỉ cho Prisma CLI / migrate (DECISIONS #10).
- `PRODUCTION_DATABASE_HOSTS` = host nhánh `production` (`ep-<mã nhánh production>…`): guard của `db:*`, `admin:grant/revoke` và test tích hợp từ chối chạy trên các host này (cả direct lẫn pooled). Chuỗi kết nối production không bao giờ nằm trong `.env.local`; chỉ nằm trong `.env.production-db` lúc chạy `db:prod:*` (mục dưới; sửa ở bước 7.4, DECISIONS #44).

### Đưa thay đổi database lên production (bước 7.4, DECISIONS #44)

Chỉ người dùng chạy, trên máy của mình. Claude không chạy các lệnh này lên production.

1. **Chuẩn bị:** Neon Console → nhánh `production` → Connect → chọn kết nối **không** pooled (host không có `-pooler`) → chép chuỗi kết nối. Tạo file `.env.production-db` ở thư mục dự án, một dòng: `DIRECT_URL=<chuỗi vừa chép>` (phải có `sslmode=require`). Không dán chuỗi này vào chat, không để trong `.env.local`.
2. **Xem trạng thái (chỉ đọc):** `npm run db:prod:status`: số migration đã áp / chờ áp, các cảnh báo, rồi `prisma migrate status` (dòng `Datasource` phải là host `ep-<mã nhánh production>…`).
3. **Sao lưu:** Neon Console → Branches → Create branch, lấy từ `production` (đặt tên kiểu `backup-<ngày>`). Có sự cố thì khôi phục từ nhánh này.
4. **Áp migration:** `npm run db:prod:migrate` → đọc danh sách, gõ đúng mã endpoint (`ep-<mã nhánh production>…`) khi được hỏi. Migration có lệnh có thể mất dữ liệu (DROP / TRUNCATE / DELETE / đổi kiểu cột) bị chặn trên database đang dùng: đọc kỹ file SQL, nếu chắc chắn thì `npm run db:prod:migrate -- --allow-destructive`. Database còn trống (lần đầu) thì không cần cờ này.
5. **Dữ liệu danh mục** (lần đầu, và mỗi khi danh mục / Lợi ích đổi): `npm run db:prod:reference` → gõ mã endpoint. Chỉ ghi / cập nhật 21 danh mục, thể loại, phong cách, Lợi ích; không tạo bộ demo, mã giảm giá thử hay file.
6. **Kiểm tra:** `npm run db:prod:status` lần nữa (chờ áp 0).
7. **Dọn:** xoá file `.env.production-db`.

Phát hành bản mới có đổi database: áp migration **trước** khi deploy code mới; vì vậy migration nên chỉ thêm (bảng, cột cho phép trống hoặc có giá trị mặc định) để code cũ vẫn chạy được trong lúc chờ (đề xuất của Claude, PENDING).

### Cấp quyền Admin trên web thật (bước 7.7, DECISIONS #55)

Chỉ người dùng chạy, cùng file `.env.production-db` ở bước 1 phía trên.

1. Mở web thật, đăng ký tài khoản bằng giao diện (`/vi/register`). Lệnh không tạo tài khoản.
2. `npm run db:prod:grant -- <email>`: lệnh đọc tài khoản trước (không ghi) và dừng nếu email không có, hoặc tài khoản đang bị khoá, hoặc đã là Admin. Nếu cần ghi, lệnh hỏi gõ đúng mã endpoint Neon (`ep-<mã nhánh production>…`) rồi mới đổi vai trò.
3. Thu quyền: `npm run db:prod:revoke -- <email>` (cùng cách hỏi). Tài khoản về `USER` và `sessionVersion` tăng: mọi phiên đang đăng nhập của tài khoản bị đăng xuất.
4. Các lệnh này từ chối khi database chưa ở migration mới nhất (chạy `db:prod:migrate` trước) và chỉ ghi một dòng `User`; không dùng cho tài khoản chưa đăng ký.

## 3. Chạy bản build trên máy

- `npm run build` rồi `AUTH_TRUST_HOST=true npx next start -p 3000`.
- `next start` ngoài Vercel cần `AUTH_TRUST_HOST=true` (Playwright đã đặt trong `webServer.env`).
- Chạy E2E: Playwright tự khởi động `next start` riêng (`reuseExistingServer: false`) → phải dừng server đang chiếm cổng 3000 trước.

## 4. Chia sẻ web cho người khác dùng thử (trước GĐ7)

Cách người dùng đã chọn ngày 2026-11-14 (ghi trong memory của Claude; trạng thái quyết định: REVIEW ở `docs/DECISIONS.md`): **Cloudflare quick tunnel** từ máy người dùng.

1. Dừng dev server (cùng cổng 3000).
2. `npm run build` → `AUTH_TRUST_HOST=true npx next start -p 3000` (chạy nền).
3. `"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --no-autoupdate --url http://localhost:3000` → link `https://<ngẫu nhiên>.trycloudflare.com` in trong output.
4. Thử qua link công khai (đăng ký + thêm vào giỏ) trước khi gửi link.

Link đổi mỗi lần chạy; mất khi máy ngủ hoặc tắt tiến trình. Dùng nhánh Neon **dev**.

**Thử cổng MoMo trên môi trường thử (bước 6.4, DECISIONS #41; MoMo tạm dừng từ 2026-11-20 theo #42, chỉ dùng khi bật lại):** MoMo gửi kết quả thanh toán về `/api/payments/momo/webhook`, nên phải mở web qua link tunnel ở trên (MoMo không gọi được tới localhost).

1. Trong `.env.local`: `PAYMENT_PROVIDER=momo` và 4 biến `MOMO_*`. Khoá thử lấy từ MoMo: tài khoản doanh nghiệp, hoặc bộ khoá mẫu công khai trong `php/PayMoMo/query_transaction.php` của repo github.com/momo-wallet/payment.
2. Làm các bước 1–3 ở trên. Địa chỉ tunnel được lấy từ request, không cần sửa `APP_URL`.
3. Trả tiền cần **app MoMo bản thử nghiệm** và ví thử; app MoMo thật báo lỗi 1005 với đơn của môi trường thử (2026-11-20).
4. Thử xong đổi lại `PAYMENT_PROVIDER=demo` (test tự động chạy bằng cổng Demo).

**Thử cổng SePay trên máy bằng SePay CLI (DECISIONS #45; Test mode, không có tiền thật):** không cần tunnel: CLI nhận thông báo của SePay rồi chuyển về localhost, giữ nguyên nội dung và chữ ký.

1. Cài và đăng nhập (một lần): `npm install -g sepay-cli`, `sepay login` (mở trình duyệt; nhập mã hiện trong cửa sổ lệnh, phím `y` chép mã).
2. Tài khoản ngân hàng thử: `sepay sandbox init` (không cần tài khoản ảo, không tạo webhook, không tạo giao dịch mẫu) → `sepay bank-account list` lấy số tài khoản và mã ở cột `ID`.
3. Ghi khoá HMAC tự đặt (chỉ chữ và số, từ 16 ký tự) vào `SEPAY_WEBHOOK_SECRET` trong `.env.local`, rồi tạo webhook chỉ nhận qua CLI bằng chính khoá đó, đưa qua ống lệnh để khoá không hiện trên màn hình, không vào lịch sử lệnh: `(Select-String -Path .env.local -Pattern '^SEPAY_WEBHOOK_SECRET=(.+)$').Matches[0].Groups[1].Value.Trim() | sepay webhook create --listen-only --bank-mode single --bank-account <ID> --event-type in --auth-type hmac --name <tên> --secret -`. Chỉ để một webhook đang bật (`sepay webhook list`).
4. `.env.local`: `PAYMENT_PROVIDER=sepay`, `SEPAY_MODE=test`, `SEPAY_BANK_ACCOUNT`, `SEPAY_BANK_NAME` (ví dụ `ACB`), `SEPAY_ACCOUNT_NAME`; khởi động lại `npm run dev`.
5. Mở một cửa sổ riêng, để chạy: `sepay webhook listen --forward localhost:3000/api/payments/sepay/webhook`.
6. Đặt đơn trên web, rồi giả lập chuyển khoản: `sepay sandbox simulate payment_in --bank-account <ID> --amount <số tiền> --override "content=<nội dung chuyển khoản>"` (cờ `--code` chỉ nhận 10 ký tự, mã đơn dài 16), hoặc my.sepay.vn → Test mode → Giả lập giao dịch. Cửa sổ `listen` phải báo `200`; trang đơn tự chuyển sang Đã thanh toán.
7. Xem giao dịch: `sepay transaction list`, `sepay webhook logs --since 1h`. Số dư của tài khoản thử ACB luôn 0 (ở Test mode SePay chỉ cộng số dư với vài kiểu kết nối); giao dịch vẫn được ghi.
8. Thử xong đổi lại `PAYMENT_PROVIDER=demo` trước khi chạy test tự động (test tích hợp và E2E dùng cổng Demo).

`listen` gửi lại một giao dịch thì giữ dấu thời gian cũ: sau 5 phút web từ chối (đúng thiết kế, chống gửi lại). Trước khi chạy thật nên thử một lần qua URL công khai (đề xuất của Claude, PENDING).

## 5. Sao lưu tài liệu

- Repo dùng git từ 2026-11-21 (bước 7.6, nhánh `main`, đẩy lên GitHub `thiennguyenk01/asset2d`, riêng tư). Các dòng sau về sao lưu tài liệu giữ nguyên lịch sử: Trước khi tái cấu trúc tài liệu (2026-11-15) đã sao lưu `CLAUDE.md` và `DESIGN.md` vào `.backup/docs-2026-11-15/` (`*.bak` + `MANIFEST.txt` có SHA-256). **Chỉ xóa bản sao lưu khi người dùng cho phép.** *(Thư mục `.backup/` đã xoá 2026-11-26 theo lựa chọn của người dùng, DECISIONS #67.)*
- `docs/requirements/ORIGINAL-BRIEF.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md` nằm trong `.prettierignore` để `npm run format` không định dạng lại nội dung nguyên văn.

## 6. Việc vận hành chờ người dùng

Xem `docs/ROADMAP.md` mục "Việc chờ người dùng".

## 7. Cloudflare R2 (lưu file, bước 7.5)

Lựa chọn: DECISIONS #53 (ảnh xem trước qua tên miền riêng; r2.dev chỉ để thử). Kỹ thuật: `docs/ARCHITECTURE.md` §5 (ghi chú bước 7.5). Khoá chỉ nằm trong `.env.local` (dev) hoặc biến môi trường của Vercel (7.6–7.7); không dán vào chat.

**Dev hiện tại (2026-11-21):** bucket `asset-game-dev-public` (ảnh, đang dùng địa chỉ r2.dev) và `asset-game-dev-private` (file bán); `.env.local` đặt `STORAGE_DRIVER=r2`. File cũ ở `.storage/` đã chép lên (381 file, 11.7 MB); `.storage/` vẫn giữ, đổi lại `STORAGE_DRIVER=local` là quay về như trước.

Cài một môi trường (dev; production làm lại với bucket và token riêng):

1. **Tạo 2 bucket** (R2 Object Storage → Create bucket): một cho ảnh xem trước, một cho file bán. Location: Automatic.
2. **Bucket ảnh → Settings:** Custom Domains → Connect (tên miền phải nằm trong cùng tài khoản Cloudflare). Chưa có tên miền thì Public Development URL → Enable để thử (r2.dev bị Cloudflare giới hạn tốc độ; production từ chối). **Bucket file bán không bật truy cập công khai nào.**
3. **CORS cho cả 2 bucket** (Settings → CORS Policy → JSON): `[{ "AllowedOrigins": ["http://localhost:3000", "http://localhost:3100"], "AllowedMethods": ["PUT"], "AllowedHeaders": ["Content-Type", "Cache-Control"], "MaxAgeSeconds": 3600 }]`. Cổng `3000` là dev, `3100` là E2E; production chỉ ghi địa chỉ thật của web. Đổi CORS cần khoảng 30 giây mới có hiệu lực.
4. **API token** (R2 → Manage API Tokens → Create): quyền **Object Read & Write**, chỉ cho 2 bucket trên. Token này không đọc / sửa được cấu hình bucket (CORS, tên miền): việc đó làm trên trang Cloudflare.
5. **`.env.local`:** 6 biến R2 ở §1; giữ `STORAGE_DRIVER=local`.
6. `npm run storage:check` → cả 8 bước ✔ (bước lỗi có gợi ý cách sửa).
7. `npm run storage:push -- --dry-run`, rồi `npm run storage:push` (chép file đang có ở `.storage/`; chạy lại bao nhiêu lần cũng được).
8. Đổi `STORAGE_DRIVER=r2`, khởi động lại `npm run dev`; mở Cửa hàng: địa chỉ ảnh bắt đầu bằng `R2_PUBLIC_BASE_URL`.

- Mỗi lần chạy E2E tải vài file thử lên bucket dev; `npm run cron:run -- cleanup` xoá file không còn dòng nào trỏ tới sau 24 giờ.
- Tên miền sắp có (người dùng, 2026-11-21): `asset2d.id.vn`. Đề xuất của Claude (PENDING): thêm tên miền vào Cloudflare (đổi nameserver ở nơi mua), gắn `media.asset2d.id.vn` vào bucket ảnh rồi đổi `R2_PUBLIC_BASE_URL`; bản ghi trỏ web sang Vercel để DNS only. **Cập nhật 2026-11-26:** người dùng đã mua tên miền (ở Mắt Bão) và thêm vào Cloudflare (gói Free; nameserver `adi.ns.cloudflare.com`, `wells.ns.cloudflare.com`). Mắt Bão chưa cho đổi nameserver: báo tên miền đang bật DNSSEC, trong khi công tắc DNSSEC ghi Tắt và VNNIC không có bản ghi DS (Claude tra DNS công khai ngày 2026-11-26); người dùng thử lại sau, hoặc nhờ hỗ trợ của Mắt Bão. Cloudflare đã chép 7 bản ghi email của Mắt Bão (CNAME `autoconfig`, `autodiscover`, `cpanel`, `mail`, `webmail`; MX; TXT SPF). Đề xuất của Claude (PENDING): không dùng hộp thư của Mắt Bão thì xoá cả 7; dùng thì để 5 CNAME ở DNS only. Chưa gắn tên miền vào Vercel cho tới khi chạy thật.

## 8. Bản xem trước trên Vercel (bước 7.6)

Lựa chọn: DECISIONS #54 (GitHub + Vercel; ai có link cũng mở được; database sạch + 10 bộ demo). Chạy cổng **Demo**, không nhận tiền thật; `robots.txt` chặn công cụ tìm kiếm (không phải production). Lần đầu lên mạng theo #43.

**Hiện tại (2026-11-21):** Vercel (gói Hobby) project `asset2d`, nhánh `main` → bản **Preview**, địa chỉ cố định `<địa chỉ bản thử trên Vercel>`. Code ở GitHub `thiennguyenk01/asset2d` (riêng tư). Database: nhánh Neon `preview` (tách từ `production`, kết nối pooled cho app, direct cho migrate). File: 2 bucket R2 `asset-game-preview-public` (địa chỉ r2.dev) và `asset-game-preview-private`, token riêng chỉ cho 2 bucket đó. Mọi giá trị nằm trong `.env.preview` (không commit) và trong Environment Variables của Vercel (môi trường Preview). *(2026-11-26: project kết thúc, người dùng xoá project Vercel, nhánh Neon và bucket của bản thử theo §11; `.env.preview` đã xoá, DECISIONS #67.)*

Cài từ đầu:

1. **GitHub:** tạo repo riêng tư, rồi `git remote add origin https://github.com/<tên tài khoản>/<repo>.git` và `git push -u origin main` (thay chữ trong `<>` bằng tên thật). `.gitignore` chặn `.env*`, `.storage/`, `.mail-outbox/`, `.backup/`, `node_modules`; `.gitattributes` (`* -text`) giữ nguyên kiểu xuống dòng của từng file (Prisma tính checksum của `migration.sql`; tài liệu là CRLF, chữ dịch là LF).
2. **Neon:** Branches → Create branch `preview` (parent `production`; **tắt tự xoá** (Auto-delete), nếu để "After 1 day" nhánh mất sau 1 ngày). Connect: chuỗi có pooling → `DATABASE_URL`, chuỗi tắt pooling → `DIRECT_URL`.
3. **R2:** làm như §7 nhưng 2 bucket và token riêng của bản thử; CORS `AllowedOrigins` = địa chỉ web của bản thử (ở **cả 2** bucket, không có `/` ở cuối); không dùng địa chỉ giả như `TEN_VERCEL`.
4. **`.env.preview`:** `npm run preview:init`, điền `APP_URL`, `DATABASE_URL`, `DIRECT_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL`. `APP_URL` = `https://<project>-git-main-<tên nhóm Vercel>.vercel.app` (tên nhóm là đoạn sau `vercel.com/` trên thanh địa chỉ); kiểm lại ở Settings → Domains.
5. **Vercel:** Add New → Project → chọn repo; giữ cấu hình build (`vercel.json` đã đặt `buildCommand` = `npm run build`, `outputDirectory` = `frontend/.next`). Lần build đầu sẽ lỗi vì thiếu biến: bình thường.
   - Settings → **Environments → Production → Branch Tracking:** đổi `main` thành `production` và Save (nhánh `production` phải có trên GitHub: `git push origin main:production`). **Bắt buộc**: nếu `main` còn là nhánh Production thì build chạy ở chế độ production và ứng dụng từ chối khởi động (cổng Demo, lưu trữ, email bị cấm ở production), đúng chốt chặn của `backend/src/env.ts`. Từ đó nhánh `production` là nơi chạy web thật (bước 7.7): chỉ đẩy code vào đó khi sẵn sàng.
   - Settings → **Deployment Protection:** tắt Vercel Authentication (nếu còn bật, mọi địa chỉ bị chuyển sang trang đăng nhập Vercel, mã 302).
   - Settings → **Environment Variables:** dán nội dung `.env.preview` vào ô Key, **chỉ chọn môi trường Preview** (bỏ Production và Development; kiểm lại ngay trước khi Save, vì chọn nhầm Production làm biến chạy ở production, và Vercel không cho thêm lần hai: phải xoá rồi thêm lại).
6. `npm run preview:setup` (migrate + seed; nếu báo "DatabaseNotReachable" ngay sau khi tạo nhánh Neon thì chờ một lát và chạy lại: chạy lại bao nhiêu lần cũng được), rồi `npm run preview:check` (8 bước ✔, gồm CORS).
7. Đẩy một commit lên `main` (kể cả `git commit --allow-empty`): Vercel build bản **Preview** (nhãn Preview ở tab Deployments, trạng thái Ready). Mỗi lần đẩy lên `main` là một lần build lại. Đăng ký tài khoản trên bản thử rồi `npm run preview:grant -- <email>` để có Admin.

- Bản thử không gửi email (`MAIL_DRIVER=outbox` ghi vào `/tmp`, mất khi hàm kết thúc): không thử "Quên mật khẩu"; việc định kỳ (`/api/cron/*`, đơn quá hạn, dọn file) không chạy ở bản thử: Vercel chỉ chạy lịch (`vercel.json`) ở bản production (§9).
- Ảnh demo và file demo nằm ở bucket của bản thử; muốn dựng lại từ đầu: `npm run preview:setup` (seed tạo lại 10 bộ demo; không đụng bộ thật khác). *(Từ 2026-11-22 bản thử có 1 đơn và 1 quyền sở hữu gắn bộ demo: bước seed của `preview:setup` bị database từ chối (khoá ngoại RESTRICT; transaction hoàn tác, dữ liệu giữ nguyên), phần migrate vẫn chạy. Muốn dựng lại từ đầu thì xoá đơn đó trước, hoặc reset nhánh Neon `preview`.)*
- Khi làm 7.7: dự án Vercel có thể dùng chung; nhánh `production`, biến môi trường cho môi trường Production (bucket + token + nhánh Neon production riêng, `APP_ENV` / `VERCEL_ENV` = production, cổng thanh toán thật, email thật, `CRON_SECRET`), tên miền `asset2d.id.vn`; xem `docs/ROADMAP.md`.

## 9. Chạy thật (bước 7.7)

Lựa chọn: DECISIONS #55 (chuẩn bị trước phần không cần tài khoản; ảnh xem trước của web thật qua tên miền riêng, không dùng r2.dev; bản thử giữ mở). Phần đã chuẩn bị: lệnh cấp quyền Admin production (§2), lịch việc định kỳ (`vercel.json`), lệnh kiểm cấu hình `prod:init` / `prod:check`. Còn lại là các việc cần tài khoản và quyết định của bạn: bảng dưới, rồi quy trình.

**Việc của bạn (cần tài khoản hoặc quyết định):**

| # | Việc | Ghi chú |
|---|---|---|
| 1 | Tên miền `asset2d.id.vn` | Đưa vào Cloudflare (DNS). Dùng cho 2 việc: web (gắn vào dự án Vercel) và ảnh (`media.asset2d.id.vn` gắn vào bucket ảnh R2: Cloudflare → R2 → bucket → Settings → Custom Domains). *(2026-11-26: đã mua, đã thêm vào Cloudflare, chờ đổi nameserver; xem §7.)* *(2026-11-26, #66: người dùng báo Mắt Bão không hỗ trợ DNSSEC nữa, sẽ chuyển tên miền sang nơi khác. `.env.vercel-production` và mẫu `prod:init` đã điền sẵn `APP_URL`, `R2_PUBLIC_BASE_URL`, `MAIL_DRIVER`, `MAIL_FROM` theo tên miền. Gắn `media.asset2d.id.vn` vào R2 cần DNS của tên miền do Cloudflare quản lý; nơi mới không cho đổi nameserver sang Cloudflare thì phải quyết định lại cách phục vụ ảnh.)* *(2026-11-26, DECISIONS #68: mẫu `prod:init` không còn điền sẵn tên miền; `.env.vercel-production` đã xoá ở #67.)* |
| 2 | Nhánh Neon `production` | Có sẵn. Chuỗi **pooled** (có `-pooler`) → `DATABASE_URL` của Vercel; chuỗi **direct** chỉ nằm trong `.env.production-db` lúc chạy `db:prod:*`. |
| 3 | R2 của web thật | 2 bucket `asset-game-prod-public` / `asset-game-prod-private`, token riêng chỉ cho 2 bucket đó, CORS `AllowedOrigins` = địa chỉ web thật ở cả 2 bucket (như §7). |
| 4 | SePay thật | Tài khoản SePay nối với tài khoản ngân hàng nhận tiền; `SEPAY_MODE=live`, `SEPAY_WEBHOOK_SECRET`, `SEPAY_BANK_ACCOUNT`, `SEPAY_BANK_NAME`, `SEPAY_ACCOUNT_NAME`; webhook trỏ tới `https://<web thật>/api/payments/sepay/webhook`, ký HMAC (#45). |
| 5 | Email thật: Resend (#56) | Code đã có. Tài khoản resend.com; **Domains → Add Domain** `asset2d.id.vn`, thêm các bản ghi DNS Resend đưa ra vào Cloudflare, chờ Verified; **API Keys → Create API Key** (Sending access). Trong `.env.vercel-production`: `MAIL_DRIVER=resend`, `MAIL_FROM=Asset Game MMORPG 2D <no-reply@asset2d.id.vn>`, `RESEND_API_KEY=re_…` (file tạo từ mẫu trước 2026-11-22 chưa có dòng này: tự thêm). Thử: `npm run mail:test -- <email> --env-file=.env.vercel-production`. Trước khi xác minh tên miền vẫn thử được với khoá trong `.env.local`: thư đi từ `onboarding@resend.dev` và chỉ tới email của tài khoản Resend. Gói miễn phí: 3.000 thư / tháng, 100 thư / ngày. |
| 6 | Gói Vercel | Hobby chỉ cho dùng phi thương mại và việc định kỳ chạy tối đa 1 lần / ngày; bán thật thì chọn Vercel Pro hoặc VPS (hỏi bạn khi tới lúc, #53 PENDING). |

**Quy trình khi đã có đủ:**

1. `npm run prod:init` tạo `.env.vercel-production` (file đã có thì không ghi đè). Điền các dòng còn trống; không gửi file này qua chat.
2. `npm run prod:check` lặp lại cho tới khi hết dòng ✖ (mỗi dòng là một việc cần làm); rồi `npm run prod:check -- --storage` để thử 2 bucket thật.
3. Database: `npm run db:prod:status` → `db:prod:migrate` → `db:prod:reference` (§2); **không** seed dữ liệu demo lên production.
4. Vercel → Settings → Environment Variables: dán nội dung `.env.vercel-production`, **chỉ chọn môi trường Production**. Settings → Domains: thêm tên miền của web. `APP_URL` phải đúng địa chỉ khách dùng.
5. Đẩy code lên nhánh `production` (`git push origin main:production`): Vercel build bản **Production** (nhãn Production ở tab Deployments). Ứng dụng từ chối khởi động nếu còn cổng Demo, r2.dev, email `outbox` hoặc `CRON_SECRET` ngắn (`backend/src/env.ts`).
6. Việc định kỳ: `vercel.json` lên lịch `/api/cron/reconcile` (19:00 UTC, tức 2:00 sáng giờ Việt Nam) và `/api/cron/cleanup` (19:30 UTC, 2:30 sáng), mỗi ngày một lần (giới hạn của gói Hobby). Vercel chỉ chạy lịch ở bản Production và gửi `Authorization: Bearer <CRON_SECRET>`; sai `CRON_SECRET` thì hai route trả lỗi. Xem kết quả ở Vercel → Logs.
7. Đăng ký tài khoản trên web thật rồi `npm run db:prod:grant -- <email>` (§2).
8. Thử một đơn thật số tiền nhỏ qua SePay (webhook về đúng địa chỉ, đơn thành PAID, tải được file); thử thư đặt lại mật khẩu; mở `robots.txt` (production được cho công cụ tìm kiếm).
9. Xoá `.env.production-db` khi xong. Đổi mọi khoá đã từng dán vào khung chat (dev, bản thử).

**Chống tốn tiền khi bản thử mở link công khai:** Google không thấy bản thử (`robots.txt`); đã có giới hạn số lần thử theo IP (bước 7.1). Nếu bị spam: reset nhánh Neon `preview` rồi `npm run preview:setup`; hoặc bật lại Vercel Authentication (khi đó người xem phải có quyền với dự án). Theo dõi phần đã dùng của gói miễn phí: **Quản trị → Dung lượng** (#58; đo môi trường đang mở: nhánh Neon và 2 bucket của nó; Neon và R2 tính gói miễn phí chung cho mọi nhánh / bucket, nên xem thêm trang quản lý của Neon và Cloudflare).

**Chỉ dùng gói miễn phí** (#59): mặc định bật ở mọi môi trường (web thật nhận cột `freeTierOnly` khi chạy `db:prod:migrate` ở bước 3). Khi bật, web chặn: Admin tải file lên khi 2 bucket của môi trường cộng file mới vượt 9 GB (90 % gói R2; R2 tính 10 GB chung cả tài khoản nên chừa chỗ cho bucket dev và bản thử); khách đăng ký, đặt đơn, mua thêm lượt tải khi database đạt 1 GB; gửi email quá 100 thư / ngày hoặc 3.000 thư / tháng. Muốn trả tiền phần vượt: **Quản trị → Cài đặt**, gõ `OPEN` rồi bấm tắt (có ghi Nhật ký); bật lại chỉ một nút. Trang **Dung lượng** cho biết chế độ đang bật hay tắt. R2 là dịch vụ duy nhất tính tiền phần vượt (tài khoản Cloudflare có thẻ); có thể đặt thêm Budget Alert (ví dụ $1) ở Cloudflare → Billing để nhận email khi phát sinh tiền (gợi ý của Claude, PENDING).

**Kênh liên hệ của nút chat** (#65): nhập ở Quản trị → Cài đặt → "Liên hệ (nút chat)". Cột `ShopSettings.contactChannels` vào web thật khi chạy `db:prod:migrate` ở bước 3; bản thử cần `npm run preview:setup` (§8). Chưa điền kênh nào thì nút chat không hiện.

## 10. Đăng nhập bằng Google (DECISIONS #63)

Nút "Tiếp tục với Google" chỉ hiện khi môi trường có đủ `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET`. Mỗi môi trường (dev, bản thử, web thật) điền khoá riêng của nó; không gửi khoá qua chat.

1. **Google Cloud Console** (console.cloud.google.com): chọn hoặc tạo một project → **Google Auth Platform** (APIs & Services → OAuth consent screen): loại **External**, tên ứng dụng, email hỗ trợ. Khi ứng dụng còn ở chế độ **Testing**, chỉ các Gmail trong **Audience → Test users** đăng nhập được.
2. **Clients → Create client → Web application.** **Authorized redirect URIs** (đúng từng ký tự, không có `/` ở cuối):
   - dev: `http://localhost:3000/api/auth/callback/google`;
   - bản thử: `<APP_URL của bản thử>/api/auth/callback/google` (mở bản thử bằng địa chỉ cố định của §8; địa chỉ riêng của từng lần build không nằm trong danh sách nên Google sẽ báo `redirect_uri_mismatch`);
   - web thật: `https://<tên miền của web>/api/auth/callback/google`.
   Có thể dùng một client cho cả ba (thêm đủ các địa chỉ) hoặc tạo client riêng cho web thật.
3. Chép **Client ID** → `AUTH_GOOGLE_ID`, **Client secret** → `AUTH_GOOGLE_SECRET`:
   - dev: `.env.local`, rồi khởi động lại dev server;
   - bản thử: `.env.preview` rồi Vercel → Environment Variables, **chỉ môi trường Preview** (như §8 bước 5), rồi đẩy một commit lên `main`;
   - web thật: `.env.vercel-production` rồi Vercel, **chỉ môi trường Production** (§9 bước 4).
4. Kiểm tra: `/vi/login` có nút "Tiếp tục với Google"; `/api/auth/providers` có `google` với `callbackUrl` đúng địa chỉ đã khai ở bước 2. Google báo `redirect_uri_mismatch`: địa chỉ ở bước 2 không khớp địa chỉ đang mở.
5. Trước khi mở cho khách trên web thật: **Audience → Publish app** (chuyển sang "In production"). Web chỉ xin `openid`, `email`, `profile`; nếu Google yêu cầu xác minh thương hiệu (tên, logo, tên miền) thì làm theo hướng dẫn trên màn hình.

## 11. Kết thúc project và chạy lại từ đầu (2026-11-26, DECISIONS #67)

**Đã làm trên máy:** `.env.local` = bản chép của `.env.example` (không còn khoá nào); đã xoá `.env.preview`, `.env.vercel-production`, `.backup/`. Code và lịch sử git không có khoá. Repo GitHub giữ riêng tư.

**Người dùng tự xoá trên cloud** (Claude không có quyền vào các tài khoản này). Xoá project / client là mọi khoá cũ hết hiệu lực, kể cả khoá từng dán vào khung chat. Thứ tự:

1. **Vercel:** project → Settings → General → Delete Project (bản build, biến môi trường, tên miền, lịch việc định kỳ đi theo). Gỡ quyền của Vercel với repo: GitHub → Settings → Applications → Vercel → Configure. *(Người dùng báo đã xoá project Vercel, 2026-11-26.)*
2. **Neon:** project → Settings → Delete project (cả 3 nhánh dev, preview, production; mất vĩnh viễn mọi tài khoản, đơn hàng).
3. **Cloudflare R2:** mỗi bucket (dev, bản thử, `asset-game-prod-*` nếu đã tạo): Objects → chọn hết → xoá (nhiều file: Settings → Object lifecycle rules, xoá sau 1 ngày), bucket trống thì Settings → Delete bucket. R2 → Manage R2 API Tokens: xoá mọi token của project. Tên miền `asset2d.id.vn` trong Cloudflare: không dùng tiếp thì Overview → Remove site.
4. **Google Cloud Console:** APIs & Services → Credentials (hoặc Google Auth Platform → Clients) → xoá OAuth client; project chỉ dùng cho web này thì IAM & Admin → Settings → Shut down (Google giữ 30 ngày).
5. **Resend / SePay** (nếu đã tạo): xoá API key, tên miền (Resend), webhook (SePay). MoMo chỉ dùng khoá thử.

**Chạy lại từ đầu** (bạn hoặc người khác; dữ liệu là demo):

1. Database: cách nhanh nhất là PostgreSQL trong Docker trên máy (mục dưới; không cần tài khoản cloud), hoặc một project Neon mới (`DATABASE_URL` pooled, `DIRECT_URL` direct, `PRODUCTION_DATABASE_HOSTS` = host của nhánh production để guard chặn). Trong `.env.local` điền 2 chuỗi kết nối và `AUTH_SECRET` (`npx auth secret`). Chi tiết: `README.vi.md` (tiếng Việt) / `README.md` (tiếng Anh), mục cài đặt nhanh.
2. `npm install` → `npm run db:migrate` → `npm run db:seed` (21 danh mục, 10 bộ demo có ảnh DEMO, mã giảm giá demo) → `npm run dev`; đăng ký một tài khoản rồi `npm run admin:grant -- <email>`.
3. Bản thử / web thật: dựng lại theo §7–§10 (`npm run preview:init`, `npm run prod:init` tạo lại file cấu hình).

**Database trên máy bằng Docker** (đang dùng từ 2026-11-26, DECISIONS #68; không cần tài khoản cloud):

- Container `asset2d-postgres` (`postgres:17`, chỉ mở ở `127.0.0.1:5432`, volume `asset2d-pgdata`, `--restart unless-stopped`: tự chạy khi Docker Desktop bật). Lệnh tạo: `README.vi.md` / `README.md`, mục cài đặt nhanh.
- `.env.local`: `DATABASE_URL` = `DIRECT_URL` = `postgresql://asset2d:<mật khẩu>@localhost:5432/asset2d` (không phải pooled: guard chỉ cảnh báo); `AUTH_SECRET`, `CRON_SECRET` ngẫu nhiên, chỉ dùng trên máy; các dòng khác giữ như `.env.example` (`MOMO_ENDPOINT` không được để trống: seed báo "Invalid URL").
- Mỗi lần mở máy: bật Docker Desktop trước `npm run dev`. Tắt database: `docker stop asset2d-postgres`; bật lại: `docker start asset2d-postgres`. Xoá hẳn (mất mọi dữ liệu trên máy): `docker rm -f asset2d-postgres` rồi `docker volume rm asset2d-pgdata`.
- Đổi `AUTH_SECRET` thì cookie đăng nhập cũ của trình duyệt không còn đọc được (`JWTSessionError: no matching decryption secret` ở console): xoá cookie `authjs.*` của localhost.
- Admin trên máy: đăng ký trên web rồi `npm run admin:grant -- <email>`.
