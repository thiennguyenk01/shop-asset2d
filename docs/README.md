# Asset Game MMORPG 2D

Marketplace bán tài nguyên game 2D HD Pixel Art phong cách phương Đông (Next.js 16 + PostgreSQL/Neon + Prisma 7 + Cloudflare R2).

Quy tắc làm việc, bảng lệnh và bản đồ tài liệu: **[CLAUDE.md](../CLAUDE.md)**. Nghiệp vụ, kiến trúc, lộ trình và các quyết định đã xác nhận: thư mục **[docs/](./)**; giao diện: **[DESIGN.md](DESIGN.md)**. Code: `frontend/` (app Next.js) và `backend/` (code server, Prisma, script).

## Bắt đầu

Chạy mọi lệnh từ thư mục gốc của repo:

```bash
npm install                 # cũng chạy prisma generate
cp .env.example .env.local  # điền giá trị trên máy bạn (không commit, không gửi qua chat)
npm run dev                 # http://localhost:3000 → /vi
```

Hướng dẫn đầy đủ cho người mới (ảnh demo, chức năng, cài đặt bằng PostgreSQL trong Docker): **[README.vi.md](../README.vi.md)** (tiếng Việt) · **[README.md](../README.md)** (English).

Các lệnh khác: xem bảng lệnh trong CLAUDE.md.
