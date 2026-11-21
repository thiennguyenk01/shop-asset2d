-- Hand-written (step 5.6): admin_coupons_settings repeated three Coupon CHECKs that the catalog migration already
-- has ("Coupon_value_range", "Coupon_window", "Coupon_counts_nonneg"). Drop the repeats and keep only the new rule:
-- a per-account limit, when set, is at least 1.
ALTER TABLE "Coupon" DROP CONSTRAINT "Coupon_value_by_kind";
ALTER TABLE "Coupon" DROP CONSTRAINT "Coupon_dates_ordered";
ALTER TABLE "Coupon" DROP CONSTRAINT "Coupon_limits_positive";
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_max_uses_per_user_positive" CHECK ("maxUsesPerUser" IS NULL OR "maxUsesPerUser" >= 1);
