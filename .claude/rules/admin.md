---
paths:
  - "frontend/src/app/*/admin/**"
  - "frontend/src/components/admin/**"
  - "backend/src/lib/admin/**"
  - "backend/src/modules/**/admin-*"
  - "backend/src/auth/admin-page.ts"
  - "backend/src/auth/guards.ts"
---

# Khu Admin

> **Cấu trúc thư mục (2026-11-21, DECISIONS #48):** thân file này còn ghi đường dẫn cũ (`src/server/…`, `tests/…`); đối chiếu sang `frontend/` · `backend/` bằng bảng trong `CLAUDE.md` §3 "Cấu trúc thư mục". Danh sách `paths:` ở trên đã đổi.

Rút gọn từ nhật ký bước 5.1–5.3 (`docs/PROGRESS.md`, nguyên văn ở đó). Quyết định: DECISIONS #29. Cache cửa hàng (`updateTag`) và `__none__`: `.claude/rules/nextjs.md`.

- **Quyền ở mọi lớp:** mỗi trang Admin gọi `requireAdminPage()` (`src/server/auth/admin-page.ts`) **bên trong `<Suspense>` và trước khi đọc dữ liệu**, vì layout không chạy lại khi điều hướng phía client. Mỗi server action gọi `requireAdmin()`; không phải Admin → trả `forbidden`, không lộ gì thêm. Khách / USER vào `/admin` → 404 giống cửa hàng.
- **Trang Admin mới phải có `export const instant = false`** (ngay sau phần import của `page.tsx`), dù layout `src/app/[locale]/admin/layout.tsx` đã có: Next 16.4 ở dev kiểm tra "instant navigation" cho **từng trang**, mà trang Admin luôn chờ bước kiểm tra quyền (khách / USER → 404) nên không bao giờ có giao diện tức thì; thiếu dòng này dev overlay báo "An error occurred while attempting to validate instant UI". *(Thêm 2026-11-20.)*
- **Mọi thao tác ghi:** tạo `AuditLog` (adminId, action `product.*`, entityId, diff) **trong cùng transaction** với thay đổi; xong làm mới cache cửa hàng theo quy tắc `updateTag` ở `.claude/rules/nextjs.md` ("Cache của cửa hàng"). Riêng Admin: dùng hằng `CATALOG_TAG` (`src/server/modules/product/queries.ts`) và thêm `refresh()` khi ở lại trang.
- **Quy tắc nghiệp vụ là hàm thuần có unit test:** `src/lib/admin/product-rules.ts` (form Zod, điều kiện đăng bán, khoá sau khi đăng bán, chỉ xoá bộ chưa ai mua/sở hữu) và `src/lib/admin/upload-rules.ts` (loại/dung lượng file, magic bytes, số phiên bản). Service gọi lại các hàm này; không lặp quy tắc trong component.
- **Form:** `useActionState`; khi lỗi, action trả lại `values` để điền lại (React reset form). Khoá lỗi là key dịch dưới `adminProducts.errors` / `adminMedia.errors`, đủ VI/EN/ZH.
- **Tải lên:** server cấp vé (`upload-ticket.ts`) và **tự chọn bucket + key**; trình duyệt chỉ gửi bytes; `finishUpload` kiểm tra magic bytes khớp đuôi file, tính SHA-256 rồi mới tạo dòng. Không bao giờ nhận SVG. File bán chỉ vào bucket private, ảnh/video vào bucket public. Xoá object **sau** khi xoá dòng DB.
- **Phiên bản:** `releasedAt = null` là bản nháp (tối đa 1/bộ); phiên bản đã phát hành không đổi file.
- **Trang sửa bộ / sửa phần dạng thẻ (2026-11-21, DECISIONS #50, #52):** thanh thẻ dùng chung `EditorTabBar` + `useUrlTab` (`frontend/src/components/admin/pack-editor.tsx`; thẻ đang mở ở `?tab=`, danh sách thẻ ở `pack-tabs.ts` vì trang server đọc được). Mọi thẻ luôn được gắn (ẩn bằng `hidden`, không gỡ) để chữ đang gõ và file đang tải không mất khi chuyển thẻ. Nút Lưu nằm ngoài `<form>` trong DOM nên dùng `form={formId}`; ở trang bộ, form đưa nút Lưu vào chỗ trống dưới khung "Sẵn sàng đăng bán" bằng portal (`barSlot` / `noteSlot`). "Thêm bộ asset" tạo ngay bộ nháp (`createDraftAction` → `createAdminDraft`), không còn trang `/admin/products/new`.
- **Ô chọn:** khu Admin không dùng `<select>` của trình duyệt; dùng `SelectMenu` (`frontend/src/components/ui/select-menu.tsx`, hoặc `SelectField` trong `fields.tsx` khi có nhãn). Giá trị gửi đi qua một `<input type="hidden" name>`, nên form GET và server action đọc như cũ. *(Thêm 2026-11-21, DECISIONS #51.)*
- **Thông số (kích thước / phần mềm / định dạng):** chọn từ danh sách soạn sẵn `backend/src/lib/admin/spec-options.ts`; khi lưu, `specList` trong `product-rules.ts` đưa về cách viết chuẩn, bỏ trùng không phân biệt hoa / thường (tối đa 20 giá trị, mỗi giá trị ≤ 60 ký tự). Giá trị cũ không có trong danh sách vẫn giữ (nhóm "Đã lưu trước đây"). *(Thêm 2026-11-21, DECISIONS #49.)*
