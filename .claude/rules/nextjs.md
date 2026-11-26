---
paths:
  - "frontend/src/app/**"
  - "frontend/src/components/**"
  - "frontend/src/i18n/**"
  - "backend/src/i18n/**"
  - "backend/src/auth/**"
  - "backend/src/storage/**"
  - "backend/src/flash.ts"
  - "backend/src/modules/**/actions.ts"
  - "backend/src/modules/**/*-actions.ts"
  - "backend/src/modules/product/queries.ts"
  - "frontend/src/proxy.ts"
  - "frontend/next.config.ts"
---

# Next.js 16.4 / Auth.js trong dự án này

> **Cấu trúc thư mục (2026-11-21, DECISIONS #48):** thân file này còn ghi đường dẫn cũ (`src/server/…`, `tests/…`); đối chiếu sang `frontend/` · `backend/` bằng bảng trong `CLAUDE.md` §3 "Cấu trúc thư mục". Danh sách `paths:` ở trên đã đổi.

Chuyển từ "Lưu ý kỹ thuật" của `CLAUDE.md` cũ (2026-11-15): nguyên văn, trừ phần flash và `visible()` được gộp khi nghiệm thu (bản cũ: `.backup/docs-2026-11-15/CLAUDE.md.bak`). Quy tắc chung và bảo mật: `CLAUDE.md`. *(Thư mục `.backup/` đã xoá 2026-11-26 theo lựa chọn của người dùng, DECISIONS #67.)*

## Next 16, layout, i18n
- Next 16.4 khác nhiều so với dữ liệu huấn luyện: **đọc `node_modules/next/dist/docs/` trước khi viết code Next** (xem `AGENTS.md`). Middleware giờ là `src/proxy.ts` (Node runtime). `cacheComponents` bật → dữ liệu động mặc định; dữ liệu request-time (cookies, `useSearchParams`, `auth()`) phải nằm trong `<Suspense>`; không dùng `dynamicParams`/`runtime`/`dynamic` segment config.
- Root layout là `src/app/[locale]/layout.tsx` (không có `app/layout.tsx` — nếu thêm sẽ làm hỏng `next/root-params`). Locale lấy qua `next/root-params` trong `src/i18n/request.ts`; trong Server Action / Route Handler phải truyền locale tường minh (`getTranslations({ locale, namespace })`).
- Dùng `Link`, `useRouter`, `redirect` từ `@/i18n/navigation`, không dùng bản của `next/*`.
- Next 16.4 kiểm tra "instant navigation" cho mọi page ở dev. Segment **luôn** `notFound()` (như `[locale]/[...rest]`) phải có `export const instant = false`, nếu không dev overlay báo "Could not validate `instant`". Xem `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/instant.md`.
- **Script chạy trước khi vẽ (giao diện sáng, sidebar thu gọn):** không đặt `<script dangerouslySetInnerHTML>` thẳng trong layout. Khi đổi ngôn ngữ, root layout `[locale]` được dựng lại ở client: React báo "Encountered a script tag while rendering React component" và xoá `data-theme` / `data-sidebar` trên `<html>`. Cách đang dùng: component client `src/components/layout/remembered-ui-state.tsx` render script `type="text/javascript"` ở server, `"text/plain"` ở client (`suppressHydrationWarning`), và `useLayoutEffect` áp lại trạng thái đã nhớ bằng `applyRememberedUiState()` (`init-scripts.ts`; `tests/unit/init-scripts.test.ts` giữ script và hàm này cho cùng kết quả). *(Thêm 2026-11-20.)*
- **Route động không liệt kê được tham số** (mã đơn, mã giao dịch…): layout dùng `usePathname` (sidebar, thanh tab, thanh trên) → build lỗi "URL data … outside of `<Suspense>`". Cách đang dùng: `generateStaticParams` trả một tham số giữ chỗ (`__none__`), nội dung đọc `params` + phiên **bên trong** `<Suspense>` (xem `checkout/result/[code]/page.tsx`).
- **Trang sản phẩm `/[locale]/product/[slug]`:** `generateStaticParams` lấy mọi slug PUBLISHED (build cần DB), `instant = false` (chặn có chủ đích). Slug lạ: lần đầu được phục vụ từ shell prerender nên HTTP có thể là 200, Next tự chèn `noindex` + UI 404 bản địa hóa (giới hạn của Cache Components, đã ghi trong test E2E). Thanh danh mục dưới đáy: `src/components/product/section-nav.tsx` (fixed, cuộn ngang, scroll spy; đặt biến CSS `--bottom-bar-height` để toast nằm trên thanh).
- `src/server/storage/local.ts` dùng `/*turbopackIgnore: true*/` trong `path.resolve` để Next không trace cả dự án (driver chỉ dùng ở dev).

## Cache của cửa hàng
- **Catalog storefront:** truy vấn đọc ở `src/server/modules/product/queries.ts`, dùng `"use cache"` + `cacheTag("catalog")` (`cacheLife("minutes")`). **Mọi thao tác ghi của Admin (GĐ5) phải gọi `updateTag("catalog")`** trong server action (ngoài server action: `revalidateTag("catalog", "max")` — dạng một tham số đã bị Next 16 bỏ). Chỉ trả sản phẩm `PUBLISHED` **và đã viết ở ngôn ngữ đang xem** (`visibleIn(locale)`; DECISIONS #39: bộ chưa viết ở ngôn ngữ nào thì ẩn ở ngôn ngữ đó, trang bộ 404; chữ của bộ chỉ lấy đúng ngôn ngữ đó, không fallback). Tham số URL Shop parse/build bằng hàm thuần `src/lib/catalog/shop-params.ts` (giá trị sai bị bỏ qua, không lỗi); tìm kiếm khớp cả tiêu đề có dấu lẫn slug không dấu (`toSearchSlug`). Định dạng tiền: `formatVnd` trong `src/lib/format.ts`; chọn bản dịch có fallback VI: `pickTranslation`.

## Phiên đăng nhập, server action, flash
- **Đọc phiên đăng nhập trong UI:** chỉ qua `getCurrentUser()` (`src/server/auth/current-user.ts`), đặt trong `<Suspense>`. Hàm này gọi `await connection()` trước `auth()` vì Auth.js mã hoá lại cookie bằng `crypto.getRandomValues` — thiếu nó Cache Components báo lỗi "unstable value … while prerendering". Không bọc bằng `use cache: private` (sẽ bỏ qua bước kiểm tra sessionVersion mỗi lần đọc).
- **Server action đặt cookie phiên làm Next vẽ lại cả cây từ layout gốc** → state của form và toast có thể bị reset. Thông báo thành công của các action này đi qua **flash**: server gọi `setFlash` (`src/server/flash.ts`) đặt cookie ngắn hạn chỉ chứa key (`src/lib/flash.ts`); phía client `takeFlash()`: form hoặc `<FlashToast />` (`layout/flash-toast.tsx`) lấy trước thì hiện toast, chỉ một lần. Không điều hướng bằng `router.replace` + `router.refresh` sau action đặt cookie (chạy đua với lần làm mới tự động của Next → URL đổi nhưng nội dung không đổi).
  - **Server action tài khoản** (`src/server/modules/user/actions.ts`): thành công thì `redirect()` ngay ở server (trang mới + thanh trên vẽ lại với cookie mới); flash hiện toast ở trang mới. `callbackUrl` luôn đi qua `safeCallbackPath` (`src/lib/auth/callback.ts`, chặn open redirect).
  - Đăng nhập lại sau đổi mật khẩu… (`changePasswordAction`, không chuyển trang): flash giữ thông báo qua lần vẽ lại.
  - Action chỉ đổi dữ liệu (không đổi cookie) dùng `refresh()` từ `next/cache` để thanh trên cập nhật.
- **Next 16 giữ tối đa 3 trang đã xem ở dạng ẩn** (`<Activity>`, `display:none`, giữ cả DOM/state — `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`). Hệ quả: (1) form nhạy cảm phải tự xoá khi bị ẩn (xem `useClearPasswordsOnHide` trong `components/account/auth-forms.tsx`); (2) E2E phải chỉ tìm phần tử đang hiện, vì trang cũ có thể vẫn nằm trong DOM: cách làm ở `.claude/rules/testing.md`.

## SEO, bản dịch phía trình duyệt (thêm ở bước 7.3)
- Component `"use client"` dùng nhóm bản dịch mới (`useTranslations("x")`): thêm `x` vào `src/i18n/client-messages.ts` (khu khách: `SITE_CLIENT_MESSAGES`; chỉ khu Admin: `ADMIN_CLIENT_MESSAGES`), nếu không trình duyệt không có chữ đó. `tests/unit/client-messages.test.ts` báo lỗi khi quên.
- Trang công khai mới cần vào kết quả tìm kiếm: `generateMetadata` trả `alternates: pageAlternates(…)` và `...shareMetadata(…)` (`src/lib/seo/seo.ts`; truyền đủ bộ vì metadata ghép nông), rồi thêm đường dẫn vào `sitemapEntries`. Trang riêng tư: `robots: { index: false }`.

## App ở `frontend/`, code server ở `backend/` (thêm 2026-11-21, DECISIONS #48)
- Lệnh Next chạy từ thư mục gốc với thư mục app: `next dev frontend`, `next build frontend`, `next start frontend`, `next typegen frontend` (qua `npm run …`). `turbopack.root` và `outputFileTracingRoot` = thư mục gốc để app import được `../backend` (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/turbopack.md`, mục `root`).
- `frontend/next.config.ts` được Next biên dịch với import tương đối tính **từ thư mục chạy lệnh**, không phải từ file: module của dự án nạp bằng đường dẫn tuyệt đối (hàm `load(…)`), chỉ `import type` mới viết đường dẫn tương đối.
- Env: Next chỉ đọc `.env*` trong thư mục app (trống) và nhớ lần nạp đầu, nên `next.config.ts` nạp lại `.env.local` ở gốc (`loadEnvConfig(gốc, dev, undefined, true)`) và ghi vào env ban đầu (`updateInitialEnv`) để các worker của Next giữ được biến. Thiếu bước này `next build` báo "DATABASE_URL chưa được cấu hình" lúc thu dữ liệu trang.
- next-intl: `createNextIntlPlugin("./frontend/src/i18n/request.ts")` (plugin kiểm file từ thư mục chạy lệnh), rồi đặt lại alias Turbopack `next-intl/config` = `./src/i18n/request.ts` (Turbopack tính alias từ thư mục app). Sai một trong hai: "Couldn't find next-intl config file".
