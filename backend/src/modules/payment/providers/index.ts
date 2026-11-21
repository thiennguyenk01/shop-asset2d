import "server-only";
import { getEnv } from "@backend/env";
import { demoProvider } from "./demo";
import { createMomoProvider } from "./momo";
import { createSepayProvider } from "./sepay";
import type { PaymentProviderAdapter } from "./types";

export type { CreatedPayment, PaymentEvent, PaymentProviderAdapter, ProviderId } from "./types";
export { ACKNOWLEDGED } from "./types";
export { PaymentUnavailableError } from "./momo";

let momo: PaymentProviderAdapter | undefined;
let sepay: PaymentProviderAdapter | undefined;

/**
 * The ONE active payment provider (env PAYMENT_PROVIDER). Webhooks for any other provider are refused, so a
 * demo webhook can never settle an order on a site configured for a real gateway (and demo is refused in
 * production at startup). MoMo: step 6.4 (DECISIONS #38). SePay bank transfers: user choice 2026-11-20.
 * PayOS / VNPay: when the shop has accounts.
 */
export function getActiveProvider(): PaymentProviderAdapter {
  const env = getEnv();
  if (env.PAYMENT_PROVIDER === "demo") return demoProvider;
  if (env.PAYMENT_PROVIDER === "momo") {
    // backend/src/env.ts already refused to start without the three keys.
    momo ??= createMomoProvider({
      endpoint: env.MOMO_ENDPOINT,
      partnerCode: env.MOMO_PARTNER_CODE!,
      accessKey: env.MOMO_ACCESS_KEY!,
      secretKey: env.MOMO_SECRET_KEY!,
    });
    return momo;
  }
  if (env.PAYMENT_PROVIDER === "sepay") {
    // backend/src/env.ts already refused to start without the secret, account and bank.
    sepay ??= createSepayProvider({
      webhookSecret: env.SEPAY_WEBHOOK_SECRET!,
      bankAccount: env.SEPAY_BANK_ACCOUNT!,
      bankName: env.SEPAY_BANK_NAME!,
      testMode: env.SEPAY_MODE === "test",
    });
    return sepay;
  }
  throw new Error(`Cổng thanh toán "${env.PAYMENT_PROVIDER}" chưa được triển khai.`);
}

/** The Demo gateway (our own fake payment page) is active. */
export function isDemoMode(): boolean {
  return getEnv().PAYMENT_PROVIDER === "demo" && getEnv().APP_ENV !== "production";
}
