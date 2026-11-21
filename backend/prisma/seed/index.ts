/**
 * Demo seed (CLAUDE.md §11). Run ONLY via `npm run db:seed` — backend/scripts/db-guard.ts refuses production.
 *
 * Idempotent: reference data (categories, genres, styles, licenses) is upserted; every product
 * with isDemoData = true is deleted and recreated. Real products (isDemoData = false) are never touched.
 *
 * Every demo product is a complete A→Z pack; its categories are ProductSection rows.
 *
 * Files:
 *  - placeholder images → PUBLIC bucket  products/<slug>/<n>.svg (overview)
 *                                        products/<slug>/<category>/<n>.svg (per section)
 *  - demo download file → PRIVATE bucket products/<slug>/<version>/<slug>-demo-readme.txt
 */
import { createHash } from "node:crypto";
import { config as loadEnv } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Locale } from "../../src/generated/prisma/client";
import { parseEnv } from "../../src/env";
import { createStorage } from "../../src/storage/create";
import type { StorageProvider } from "../../src/storage/types";
import { ART_STYLES, CATEGORIES, GENRES, KIND_SPECS, LICENSES, type AssetKind, type L3 } from "./data/catalog";
import { DEMO_COUPONS } from "./data/coupons";
import { PRODUCTS, type PackSeed } from "./data/products";
import { PLACEHOLDER_SIZE, placeholderSvg } from "./placeholder";
import { upsertReferenceData } from "./reference";

const LOCALES: Locale[] = ["vi", "en", "zh"];
const DAY = 24 * 60 * 60 * 1000;
const OVERVIEW_IMAGES = 4;
const SECTION_IMAGES = 2;

function translations<T extends object>(build: (l: Locale) => T) {
  return { create: LOCALES.map((locale) => ({ locale, ...build(locale) })) };
}

/** Demo asset count of one section at scale 1, by asset kind (illustrative only). */
const BASE_ASSETS: Record<AssetKind, number> = { sprite: 60, map: 120, vfx: 40, ui: 80, item: 150, audio: 30, font: 6, tech: 12 };

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

async function putSvg(storage: StorageProvider, key: string, svg: string) {
  await storage.put("public", key, new TextEncoder().encode(svg));
}

function mediaRow(productId: string, sectionId: string | null, storageKey: string, kind: "THUMBNAIL" | "IMAGE", sortOrder: number) {
  return {
    productId,
    sectionId,
    kind,
    storageKey,
    mimeType: "image/svg+xml",
    width: PLACEHOLDER_SIZE.width,
    height: PLACEHOLDER_SIZE.height,
    sortOrder,
    isPlaceholder: true,
  };
}

function describe(p: PackSeed, genreNames: L3[], sectionCount: number, l: Locale): string {
  const genres = genreNames.map((g) => g[l]).join(", ");
  return {
    vi: `${p.title.vi} là bộ asset HD Pixel Art trọn gói A→Z cho game ${genres}, gồm ${sectionCount} phần dùng chung một nét vẽ và bảng màu, ghép lại là thành một thế giới game hoàn chỉnh.\n\nDữ liệu demo: hình ảnh và thông số chỉ để minh họa giao diện cửa hàng, không phải sản phẩm thật.`,
    en: `${p.title.en} is a complete A→Z HD Pixel Art pack for ${genres} games: ${sectionCount} sections sharing one line style and palette, so they fit together into a full game world.\n\nDemo data: images and specs only illustrate the store interface; this is not a real product.`,
    zh: `${p.title.zh}是一套面向${genres}游戏的 A→Z 全套 HD 像素风素材，共 ${sectionCount} 个部分，线条与配色统一，可直接组成完整的游戏世界。\n\n演示数据：图片与参数仅用于展示商店界面，并非真实商品。`,
  }[l];
}

function demoReadme(p: PackSeed, version: string): string {
  return [
    "DEMO FILE — NOT A REAL ASSET PACK",
    "",
    `Product: ${p.title.en} (${p.slug})`,
    `Version: ${version}`,
    "",
    "This placeholder is delivered by the demo store so the download flow can be tested.",
    "Tệp demo — không phải bộ asset thật. Dùng để kiểm thử luồng tải xuống.",
    "演示文件——并非真实素材包，仅用于测试下载流程。",
    "",
  ].join("\n");
}

async function main() {
  loadEnv({ path: [".env.local", ".env"], quiet: true });
  const env = parseEnv(process.env);
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL chưa được cấu hình.");
  // local (.storage/) or the R2 buckets of .env.local (GĐ7.5). The guard of `npm run db:seed` refuses production.
  const storage = createStorage(env);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  const started = Date.now();
  // `npm run db:seed:coupons` (= `prisma db seed -- --only=coupons`): demo coupons only, products untouched.
  const onlyCoupons = process.argv.includes("--only=coupons");

  try {
    // ── Demo coupons (upsert by code; codes start with DEMO) ──
    for (const c of DEMO_COUPONS) {
      const data = {
        kind: c.kind,
        value: c.value,
        minTotalVnd: c.minTotalVnd ?? 0,
        startsAt: c.startsAt ?? null,
        endsAt: c.endsAt ?? null,
        maxUses: c.maxUses ?? null,
        usedCount: c.usedCount ?? 0,
        isActive: true,
      };
      await db.coupon.upsert({ where: { code: c.code }, update: data, create: { code: c.code, ...data } });
    }
    console.log(`✔ ${DEMO_COUPONS.length} mã giảm giá demo: ${DEMO_COUPONS.map((c) => c.code).join(", ")}`);
    if (onlyCoupons) return;

    // ── Reference data (upsert; shared with `npm run db:prod:reference`, backend/prisma/seed/reference.ts) ──
    const { categoryIds, genreIds, styleIds, licenseIds } = await upsertReferenceData(db);
    console.log(`✔ ${CATEGORIES.length} danh mục, ${GENRES.length} thể loại, ${ART_STYLES.length} phong cách, ${LICENSES.length} bộ điều khoản`);

    // ── Remove previous demo products (real products are never touched) ──
    const deleted = await db.$transaction(async (tx) => {
      const where = { isDemoData: true };
      await tx.product.updateMany({ where, data: { currentVersionId: null } });
      return (await tx.product.deleteMany({ where })).count;
    });
    if (deleted > 0) console.log(`✔ đã xoá ${deleted} sản phẩm demo cũ`);

    // ── Retired terms (old Personal/Commercial/Extended tiers, STANDARD): dropped once nothing references them ──
    const retired = await db.license.deleteMany({
      where: {
        code: { notIn: LICENSES.map((l) => l.code) },
        products: { none: {} },
        cartItems: { none: {} },
        orderItems: { none: {} },
        entitlements: { none: {} },
      },
    });
    if (retired.count > 0) console.log(`✔ đã xoá ${retired.count} mức giấy phép cũ`);

    // ── Packs: each product is a complete A→Z pack whose categories are sections ──
    const now = Date.now();
    for (const p of PRODUCTS) {
      const genreNames = p.genres.map((g) => {
        const genre = GENRES.find((x) => x.slug === g);
        if (!genre) throw new Error(`Thể loại không tồn tại: ${g}`);
        return genre.name;
      });
      const sections = p.sections.map((slug) => {
        const category = CATEGORIES.find((c) => c.slug === slug);
        if (!category) throw new Error(`Danh mục không tồn tại: ${slug}`);
        const specs = KIND_SPECS[category.kind];
        const jitter = 0.85 + (hash(`${p.slug}/${slug}`) % 31) / 100; // 0.85–1.15, deterministic
        return { category, specs, assetCount: Math.max(4, Math.round(BASE_ASSETS[category.kind] * p.scale * jitter)) };
      });
      if (p.compareAtPriceVnd !== undefined && p.compareAtPriceVnd <= p.priceVnd) {
        throw new Error(`${p.slug}: giá gốc phải lớn hơn giá bán`);
      }

      const isPaid = p.type !== "FREE";
      const product = await db.product.create({
        data: {
          slug: p.slug,
          type: p.type,
          status: "PUBLISHED",
          priceVnd: p.priceVnd,
          compareAtPriceVnd: p.compareAtPriceVnd ?? null,
          isFeatured: p.featured ?? false,
          isDemoData: true,
          assetCount: sections.reduce((sum, s) => sum + s.assetCount, 0),
          resolution: null, // varies per section
          fileFormats: unique(sections.flatMap((s) => s.specs.fileFormats)),
          compatibleSoftware: unique(sections.flatMap((s) => s.specs.software)),
          salesCount: isPaid ? p.popularity : 0,
          downloadCount: isPaid ? 0 : p.popularity,
          claimCount: isPaid ? 0 : Math.round(p.popularity * 0.7),
          publishedAt: new Date(now - p.daysAgo * DAY),
          translations: translations((l) => ({
            title: p.title[l],
            shortDescription: p.short[l],
            description: describe(p, genreNames, sections.length, l),
            contentsList: sections.map((s) => s.category.name[l]),
          })),
          genres: { create: p.genres.map((g) => ({ genreId: genreIds.get(g)! })) },
          artStyles: { create: (p.styles ?? ["hd-pixel-art"]).map((s) => ({ artStyleId: styleIds.get(s)! })) },
          licenses: { create: [{ licenseId: licenseIds.get(p.type)!, isDefault: true }] }, // terms follow the pack type
        },
      });

      // Pack overview gallery (public bucket).
      const overviewKinds = unique(sections.map((s) => s.category.kind));
      const media: ReturnType<typeof mediaRow>[] = [];
      for (let n = 0; n < OVERVIEW_IMAGES; n++) {
        const key = `products/${p.slug}/${n}.svg`;
        await putSvg(storage, key, placeholderSvg({ seed: p.slug, kind: overviewKinds[n % overviewKinds.length], variant: n }));
        media.push(mediaRow(product.id, null, key, n === 0 ? "THUMBNAIL" : "IMAGE", n));
      }

      // Sections + their preview images.
      for (const [i, s] of sections.entries()) {
        const section = await db.productSection.create({
          data: {
            productId: product.id,
            categoryId: categoryIds.get(s.category.slug)!,
            sortOrder: i,
            assetCount: s.assetCount,
            resolution: s.specs.resolution === "—" ? null : s.specs.resolution,
            fileFormats: s.specs.fileFormats,
            translations: translations((l) => ({
              summary: s.category.description[l],
              contentsList: s.specs.contents.map((c) => c[l]),
            })),
          },
        });
        for (let n = 0; n < SECTION_IMAGES; n++) {
          const key = `products/${p.slug}/${s.category.slug}/${n}.svg`;
          await putSvg(storage, key, placeholderSvg({ seed: `${p.slug}/${s.category.slug}`, kind: s.category.kind, variant: n }));
          media.push(mediaRow(product.id, section.id, key, "IMAGE", n));
        }
      }
      await db.productMedia.createMany({ data: media });

      // Versions + demo download file (private bucket): one archive for the whole pack.
      const versions = p.version && p.version !== "1.0.0" ? ["1.0.0", p.version] : ["1.0.0"];
      let currentId = "";
      for (const [vi, version] of versions.entries()) {
        const body = new TextEncoder().encode(demoReadme(p, version));
        const fileKey = `products/${p.slug}/${version}/${p.slug}-demo-readme.txt`;
        await storage.put("private", fileKey, body);
        const row = await db.productVersion.create({
          data: {
            productId: product.id,
            version,
            releasedAt: new Date(now - (p.daysAgo + (versions.length - 1 - vi) * 20) * DAY),
            changelog:
              vi === 0
                ? { vi: "Phát hành lần đầu.", en: "Initial release.", zh: "首次发布。" }
                : { vi: "Thêm hoạt ảnh và sửa lỗi nhỏ (demo).", en: "Added animations and minor fixes (demo).", zh: "新增动画并修复小问题（演示）。" },
            files: {
              create: {
                storageKey: fileKey,
                filename: `${p.slug}-demo-readme.txt`,
                sizeBytes: body.byteLength,
                sha256: createHash("sha256").update(body).digest("hex"),
                mimeType: "text/plain",
              },
            },
          },
        });
        currentId = row.id;
      }
      await db.product.update({ where: { id: product.id }, data: { currentVersionId: currentId } });
      process.stdout.write(".");
    }
    process.stdout.write("\n");

    const counts = await db.product.groupBy({ by: ["type"], where: { isDemoData: true }, _count: true });
    console.log(
      `✔ ${PRODUCTS.length} bộ asset demo:`,
      counts.map((c) => `${c.type}=${c._count}`).join(", "),
      `(${((Date.now() - started) / 1000).toFixed(1)}s)`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("✖ Seed thất bại:", error);
  process.exit(1);
});
