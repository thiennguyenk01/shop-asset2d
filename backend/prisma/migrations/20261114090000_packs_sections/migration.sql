-- Packs A→Z (CLAUDE.md §13, 2026-11-14): each product is a complete game asset pack whose
-- categories are sections inside it. Bundles are removed; Product no longer has a category.
--
-- Data cleanup first: rows using the removed BUNDLE enum values must be gone before the
-- enum is rebuilt. Only demo data existed when this was written (no orders/entitlements).
DELETE FROM "BundleItem";
DELETE FROM "Entitlement" WHERE "source" = 'BUNDLE';
DELETE FROM "Product" WHERE "type" = 'BUNDLE';

-- AlterEnum
BEGIN;
CREATE TYPE "EntitlementSource_new" AS ENUM ('PURCHASE', 'FREE_CLAIM', 'ADMIN_GRANT');
ALTER TABLE "Entitlement" ALTER COLUMN "source" TYPE "EntitlementSource_new" USING ("source"::text::"EntitlementSource_new");
ALTER TYPE "EntitlementSource" RENAME TO "EntitlementSource_old";
ALTER TYPE "EntitlementSource_new" RENAME TO "EntitlementSource";
DROP TYPE "public"."EntitlementSource_old";
COMMIT;

-- CHECK constraints compare "type" with enum literals; drop them while the enum is rebuilt.
ALTER TABLE "Product" DROP CONSTRAINT "Product_free_is_zero";
ALTER TABLE "Product" DROP CONSTRAINT "Product_paid_is_positive";

-- AlterEnum
BEGIN;
CREATE TYPE "ProductType_new" AS ENUM ('FREE', 'PREMIUM');
ALTER TABLE "Product" ALTER COLUMN "type" TYPE "ProductType_new" USING ("type"::text::"ProductType_new");
ALTER TABLE "OrderItem" ALTER COLUMN "productType" TYPE "ProductType_new" USING ("productType"::text::"ProductType_new");
ALTER TYPE "ProductType" RENAME TO "ProductType_old";
ALTER TYPE "ProductType_new" RENAME TO "ProductType";
DROP TYPE "public"."ProductType_old";
COMMIT;

ALTER TABLE "Product" ADD CONSTRAINT "Product_free_is_zero" CHECK ("type" <> 'FREE' OR "priceVnd" = 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_paid_is_positive" CHECK ("type" = 'FREE' OR "priceVnd" > 0);

-- DropForeignKey
ALTER TABLE "BundleItem" DROP CONSTRAINT "BundleItem_bundleId_fkey";

-- DropForeignKey
ALTER TABLE "BundleItem" DROP CONSTRAINT "BundleItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_categoryId_fkey";

-- DropIndex
DROP INDEX "Product_categoryId_status_idx";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "categoryId";

-- AlterTable
ALTER TABLE "ProductMedia" ADD COLUMN     "sectionId" TEXT;

-- DropTable
DROP TABLE "BundleItem";

-- CreateTable
CREATE TABLE "ProductSection" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "assetCount" INTEGER NOT NULL DEFAULT 0,
    "resolution" TEXT,
    "fileFormats" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSectionTranslation" (
    "sectionId" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "summary" TEXT NOT NULL,
    "contentsList" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSectionTranslation_pkey" PRIMARY KEY ("sectionId","locale")
);

-- CreateIndex
CREATE INDEX "ProductSection_categoryId_idx" ON "ProductSection"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSection_productId_categoryId_key" ON "ProductSection"("productId", "categoryId");

-- CreateIndex
CREATE INDEX "ProductMedia_sectionId_sortOrder_idx" ON "ProductMedia"("sectionId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ProductSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSection" ADD CONSTRAINT "ProductSection_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSection" ADD CONSTRAINT "ProductSection_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSectionTranslation" ADD CONSTRAINT "ProductSectionTranslation_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ProductSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ───── Hand-written constraints (Prisma cannot express these) ─────
ALTER TABLE "ProductSection" ADD CONSTRAINT "ProductSection_asset_count_nonneg" CHECK ("assetCount" >= 0);
-- A section's media must belong to the same product (enforced in the seed/admin service too).
