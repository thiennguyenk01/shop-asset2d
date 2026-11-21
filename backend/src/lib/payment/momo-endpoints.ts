/**
 * MoMo's two environments. No imports: backend/src/env.ts (also loaded by next.config.ts, where the path aliases do
 * not resolve) reads them with a relative import.
 */
export const MOMO_TEST_ENDPOINT = "https://test-payment.momo.vn";
export const MOMO_LIVE_ENDPOINT = "https://payment.momo.vn";
