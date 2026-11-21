-- CreateEnum
CREATE TYPE "OrderItemKind" AS ENUM ('PACK', 'EXTRA_DOWNLOADS');

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "extraDownloads" INTEGER,
ADD COLUMN     "kind" "OrderItemKind" NOT NULL DEFAULT 'PACK';

-- CreateTable
CREATE TABLE "DownloadCredit" (
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "extraDownloads" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DownloadCredit_pkey" PRIMARY KEY ("userId","productId")
);

-- CreateIndex
CREATE INDEX "DownloadCredit_productId_idx" ON "DownloadCredit"("productId");

-- AddForeignKey
ALTER TABLE "DownloadCredit" ADD CONSTRAINT "DownloadCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadCredit" ADD CONSTRAINT "DownloadCredit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (CLAUDE.md §4): rules Prisma cannot express.
-- Note: these CHECKs compare enum columns ("kind", "productType") — drop them before changing those enums.
ALTER TABLE "DownloadCredit" ADD CONSTRAINT "DownloadCredit_nonneg" CHECK ("extraDownloads" >= 0);
-- A pack line has no download count; a download line adds a positive count to a FREE pack.
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_kind_shape" CHECK (
  ("kind" = 'PACK' AND "extraDownloads" IS NULL)
  OR ("kind" = 'EXTRA_DOWNLOADS' AND "extraDownloads" > 0 AND "productType" = 'FREE')
);
