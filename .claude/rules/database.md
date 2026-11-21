---
paths:
  - "backend/prisma/**"
  - "backend/prisma.config.ts"
  - "backend/scripts/db-guard.ts"
  - "backend/scripts/admin-grant.ts"
  - "backend/src/db.ts"
  - "backend/src/modules/**/*repository.ts"
---

# Cơ sở dữ liệu (Prisma 7 + Neon)

> **Cấu trúc thư mục (2026-11-21, DECISIONS #48):** thân file này còn ghi đường dẫn cũ (`src/server/…`, `tests/…`); đối chiếu sang `frontend/` · `backend/` bằng bảng trong `CLAUDE.md` §3 "Cấu trúc thư mục". Danh sách `paths:` ở trên đã đổi.

Chuyển nguyên văn từ `CLAUDE.md` cũ (2026-11-15). Mô tả bảng: `docs/ARCHITECTURE.md` §3. Quy tắc bất khả xâm phạm (không migrate/seed production, không gọi `prisma` trực tiếp): `CLAUDE.md`.

## `npm run db:migrate` (nguyên văn ô bảng lệnh cũ)
Guard (`scripts/db-guard.ts`) → `prisma migrate dev` (dùng `DIRECT_URL`). Tạo migration mới: `npm run db:migrate -- --name <tên>`. Nếu Prisma báo "non-interactive" (có cảnh báo mất dữ liệu): sinh SQL bằng `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, lưu vào `prisma/migrations/<timestamp>_<tên>/migration.sql`, sửa tay, rồi `npm run db:migrate`. CHECK constraint so sánh cột enum phải DROP trước khi đổi enum và ADD lại sau (xem migration `packs_sections`). **Prisma 7 không tự generate** → chạy `npm run db:generate` sau mỗi lần đổi schema. Cần SQL tay (CHECK, unique một phần): thêm `--create-only`, sửa file SQL, rồi chạy lại `db:migrate`.

## Prisma 7
- Prisma 7: cấu hình ở `prisma.config.ts` (CLI dùng `DIRECT_URL`); runtime dùng `getDb()` trong `src/server/db.ts` (adapter `pg` + `DATABASE_URL` pooled). Import client từ `@/generated/prisma/client`.

## Production (thêm ở bước 7.4)
- Chỉ người dùng chạy `npm run db:prod:*` lên production (DECISIONS #44, `docs/OPERATIONS.md` §2). Claude không chạy các lệnh này lên production; muốn thử thì diễn tập trên nhánh dev bằng `--env-file=<file tạm>` khai host dev là production, rồi xoá file tạm ngay.
- Migration mới nên chỉ **thêm** (bảng; cột cho phép trống hoặc có mặc định) để áp trước khi deploy code mới mà code cũ vẫn chạy. Migration có DROP / TRUNCATE / DELETE / đổi kiểu cột bị `db:prod:migrate` chặn nếu không có `--allow-destructive`: ghi rõ lý do ngay trong file SQL.
- Thêm / sửa danh mục, thể loại, phong cách, Lợi ích: sửa `prisma/seed/data/catalog.ts`; dev chạy `npm run db:seed`, production chạy `npm run db:prod:reference` (chỉ ghi / cập nhật, không xoá).
