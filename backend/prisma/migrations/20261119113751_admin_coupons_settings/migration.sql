-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN     "maxUsesPerUser" INTEGER;

-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "extraDownloadsCount" INTEGER NOT NULL,
    "extraDownloadsPriceVnd" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("id")
);

-- Hand-written (step 5.6, DECISIONS #35): the database refuses impossible values even if the app is bypassed.
-- One settings row only; limits match src/lib/admin/settings-rules.ts.
ALTER TABLE "ShopSettings" ADD CONSTRAINT "ShopSettings_single_row" CHECK ("id" = 1);
ALTER TABLE "ShopSettings" ADD CONSTRAINT "ShopSettings_extra_count" CHECK ("extraDownloadsCount" BETWEEN 1 AND 100);
ALTER TABLE "ShopSettings" ADD CONSTRAINT "ShopSettings_extra_price" CHECK ("extraDownloadsPriceVnd" BETWEEN 1000 AND 10000000);

-- Coupons: limits match src/lib/admin/coupon-rules.ts.
-- Note: "Coupon_value_by_kind" compares the enum column "kind" — drop it before changing that enum.
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_value_by_kind" CHECK (
  ("kind" = 'PERCENT' AND "value" BETWEEN 1 AND 100) OR ("kind" = 'FIXED' AND "value" >= 1)
);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_limits_positive" CHECK (
  "minTotalVnd" >= 0 AND "usedCount" >= 0
  AND ("maxUses" IS NULL OR "maxUses" >= 1)
  AND ("maxUsesPerUser" IS NULL OR "maxUsesPerUser" >= 1)
);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_dates_ordered" CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "startsAt" < "endsAt");
