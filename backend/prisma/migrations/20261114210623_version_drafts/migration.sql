-- AlterTable
ALTER TABLE "ProductVersion" ALTER COLUMN "releasedAt" DROP NOT NULL,
ALTER COLUMN "releasedAt" DROP DEFAULT;

-- Versions of packs that were never on sale have not been released yet (their files may still change).
UPDATE "ProductVersion" v SET "releasedAt" = NULL
FROM "Product" p
WHERE v."productId" = p."id" AND p."publishedAt" IS NULL;

-- At most one draft (unreleased) version per pack.
CREATE UNIQUE INDEX "ProductVersion_one_draft" ON "ProductVersion"("productId") WHERE "releasedAt" IS NULL;
