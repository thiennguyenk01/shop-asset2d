import { z } from "zod";
import { MOMO_LIVE_ENDPOINT, MOMO_TEST_ENDPOINT } from "./lib/payment/momo-endpoints";

/**
 * Runtime environment validation (CLAUDE.md §2, §6, §13).
 *
 * `parseEnv` is a pure function so the production safety rules can be unit-tested.
 * `getEnv` caches the result and is called from `src/instrumentation.ts`, so the
 * server refuses to start when the configuration is unsafe.
 */

export const APP_ENVS = ["development", "test", "preview", "production"] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export const PAYMENT_PROVIDERS = ["demo", "payos", "vnpay", "momo", "sepay"] as const;
/** SePay: `test` = SePay Test mode (simulated transfers, orders marked Demo) · `live` = real bank transfers. */
export const SEPAY_MODES = ["test", "live"] as const;
export const STORAGE_DRIVERS = ["local", "r2"] as const;
/**
 * GĐ6 (DECISIONS #38): in development mail is written to files (`outbox`), never sent. GĐ7.7: the real service
 * is Resend (user choice; backend/src/mail/resend.ts). `smtp` stays reserved and is refused until implemented.
 */
export const MAIL_DRIVERS = ["outbox", "resend", "smtp"] as const;

type RawEnv = Record<string, string | undefined>;

/** R2 bucket names: 3–63 characters, lowercase letters, digits and hyphens, not starting / ending with a hyphen. */
const R2_BUCKET_NAME = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

/**
 * `R2_PUBLIC_BASE_URL` → its origin without a trailing slash ("https://media.example.com"). Only an https origin
 * (no path, query, user or port): object keys are appended to it as-is.
 */
export function parsePublicBaseUrl(
  raw: string | undefined,
): { ok: true; url: string; r2dev: boolean } | { ok: false; error: string } {
  const error =
    "R2_PUBLIC_BASE_URL là bắt buộc khi STORAGE_DRIVER=r2: địa chỉ https của tên miền gắn vào bucket ảnh (vd. https://media.tenmien.com), hoặc địa chỉ https://pub-….r2.dev khi đang thử.";
  if (!raw) return { ok: false, error };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error };
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) {
    return { ok: false, error };
  }
  return { ok: true, url: u.origin, r2dev: u.hostname.endsWith(".r2.dev") };
}

/**
 * Resolve the logical environment. `VERCEL_ENV=production` always wins so a
 * mis-set `APP_ENV` can never downgrade a real production deployment.
 * NOTE: NODE_ENV is deliberately ignored — Vercel previews also run with NODE_ENV=production.
 */
export function resolveAppEnv(raw: RawEnv): AppEnv {
  if (raw.VERCEL_ENV === "production") return "production";
  const explicit = raw.APP_ENV;
  if (explicit) {
    if (!(APP_ENVS as readonly string[]).includes(explicit)) {
      throw new Error(`APP_ENV không hợp lệ: "${explicit}". Giá trị cho phép: ${APP_ENVS.join(", ")}`);
    }
    return explicit as AppEnv;
  }
  if (raw.VERCEL_ENV === "preview") return "preview";
  return "development";
}

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const baseSchema = z.object({
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: optionalString,
  DIRECT_URL: optionalString,
  AUTH_SECRET: optionalString,
  /**
   * "Continue with Google" (user choice 2026-11-26): the OAuth client of the shop's Google Cloud project. Both or
   * neither: without them the button is hidden and only email + password sign-in exists. Only in .env.local / the
   * host's settings, never in the repo.
   */
  AUTH_GOOGLE_ID: optionalString,
  AUTH_GOOGLE_SECRET: optionalString,
  PAYMENT_PROVIDER: z.enum(PAYMENT_PROVIDERS).default("demo"),
  STORAGE_DRIVER: z.enum(STORAGE_DRIVERS).default("local"),
  STORAGE_LOCAL_ROOT: z.string().default(".storage"),
  R2_ACCOUNT_ID: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_PUBLIC_BUCKET: optionalString,
  R2_PRIVATE_BUCKET: optionalString,
  /**
   * GĐ7.5: where the browser loads preview media of the PUBLIC bucket: the custom domain connected to it
   * (DECISIONS: "tên miền riêng"), or its r2.dev address while testing (rate-limited, refused in production).
   */
  R2_PUBLIC_BASE_URL: optionalString,
  MAIL_DRIVER: z.enum(MAIL_DRIVERS).default("outbox"),
  MAIL_OUTBOX_DIR: z.string().default(".mail-outbox"),
  MAIL_FROM: z.string().min(3).default("Asset Game MMORPG 2D <no-reply@localhost>"),
  /** GĐ7.7 (MAIL_DRIVER=resend): Resend API key ("re_…"). Only in .env.local / the host's settings. */
  RESEND_API_KEY: optionalString,
  /** GĐ6.3: the scheduled jobs (/api/cron/*) answer only `Authorization: Bearer <CRON_SECRET>`. */
  CRON_SECRET: optionalString,
  /** GĐ6.4 MoMo (PAYMENT_PROVIDER=momo). Keys only in .env.local / the host's settings, never in the repo. */
  MOMO_ENDPOINT: z.url().default(MOMO_TEST_ENDPOINT),
  MOMO_PARTNER_CODE: optionalString,
  MOMO_ACCESS_KEY: optionalString,
  MOMO_SECRET_KEY: optionalString,
  /**
   * SePay bank transfers (PAYMENT_PROVIDER=sepay, user choice 2026-11-20). The webhook secret only in
   * .env.local / the host's settings, never in the repo. Bank account + bank short name are shown to buyers.
   */
  SEPAY_MODE: z.enum(SEPAY_MODES).default("test"),
  SEPAY_WEBHOOK_SECRET: optionalString,
  SEPAY_BANK_ACCOUNT: optionalString,
  SEPAY_BANK_NAME: optionalString,
  /** Account holder's name shown next to the account number (optional). */
  SEPAY_ACCOUNT_NAME: optionalString,
});

export type Env = z.infer<typeof baseSchema> & { APP_ENV: AppEnv };

export function parseEnv(raw: RawEnv): Env {
  const appEnv = resolveAppEnv(raw);
  const parsed = baseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Cấu hình môi trường không hợp lệ:\n${z.prettifyError(parsed.error)}`);
  }
  const env: Env = { ...parsed.data, APP_ENV: appEnv };
  const problems: string[] = [];
  const deployed = appEnv === "preview" || appEnv === "production";

  if (deployed) {
    if (!env.DATABASE_URL) problems.push("DATABASE_URL là bắt buộc trên môi trường preview/production.");
    if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
      problems.push("AUTH_SECRET là bắt buộc và phải dài tối thiểu 32 ký tự.");
    }
  }

  if (appEnv === "production") {
    // CLAUDE.md §6: Demo Payment is forbidden in production.
    if (env.PAYMENT_PROVIDER === "demo") {
      problems.push("PAYMENT_PROVIDER=demo bị CẤM trên production (không giả lập thanh toán thật).");
    }
    // CLAUDE.md §2: production must use R2, never the local storage driver.
    if (env.STORAGE_DRIVER !== "r2") {
      problems.push("STORAGE_DRIVER phải là r2 trên production.");
    }
    // GĐ6: the dev outbox only writes files; on production a customer would never get the mail.
    if (env.MAIL_DRIVER === "outbox") {
      problems.push("MAIL_DRIVER=outbox chỉ dùng ở dev (thư chỉ được ghi ra file); production cần dịch vụ gửi thật (resend).");
    }
    // The sender must be the shop's own verified domain: localhost never delivers, and Resend's test sender
    // (onboarding@resend.dev) only reaches the Resend account's own address.
    const fromDomain = /@([^\s>]+)>?\s*$/.exec(env.MAIL_FROM)?.[1]?.toLowerCase();
    if (!fromDomain || fromDomain === "localhost" || fromDomain === "resend.dev") {
      problems.push("MAIL_FROM trên production phải là địa chỉ thuộc tên miền của cửa hàng (đã xác minh ở dịch vụ gửi thư), không phải localhost hay resend.dev.");
    }
    // GĐ6.3: without it the scheduled jobs never run (every call is refused).
    if (!env.CRON_SECRET || env.CRON_SECRET.length < 32) {
      problems.push("CRON_SECRET là bắt buộc trên production và phải dài tối thiểu 32 ký tự (bảo vệ /api/cron/*).");
    }
  }

  if (!env.AUTH_GOOGLE_ID !== !env.AUTH_GOOGLE_SECRET) {
    problems.push("AUTH_GOOGLE_ID và AUTH_GOOGLE_SECRET phải điền cả hai (bật đăng nhập Google) hoặc bỏ trống cả hai.");
  }

  if (env.MAIL_DRIVER === "resend" && !env.RESEND_API_KEY?.startsWith("re_")) {
    problems.push("RESEND_API_KEY là bắt buộc khi MAIL_DRIVER=resend (khoá API của Resend, bắt đầu bằng re_).");
  }
  if (env.MAIL_DRIVER === "smtp") {
    problems.push("MAIL_DRIVER=smtp chưa có trong code: dùng resend (hoặc outbox ở dev).");
  }

  if (env.PAYMENT_PROVIDER === "momo") {
    for (const key of ["MOMO_PARTNER_CODE", "MOMO_ACCESS_KEY", "MOMO_SECRET_KEY"] as const) {
      if (!env[key]) problems.push(`${key} là bắt buộc khi PAYMENT_PROVIDER=momo.`);
    }
    const endpoint = env.MOMO_ENDPOINT.replace(/\/+$/, "");
    if (endpoint !== MOMO_TEST_ENDPOINT && endpoint !== MOMO_LIVE_ENDPOINT) {
      problems.push(`MOMO_ENDPOINT phải là ${MOMO_TEST_ENDPOINT} (môi trường thử) hoặc ${MOMO_LIVE_ENDPOINT} (thật).`);
    }
    // A production shop on MoMo's test environment would take orders that are never really paid.
    if (appEnv === "production" && endpoint !== MOMO_LIVE_ENDPOINT) {
      problems.push(`MOMO_ENDPOINT trên production phải là ${MOMO_LIVE_ENDPOINT} (môi trường thử của MoMo không có tiền thật).`);
    }
    env.MOMO_ENDPOINT = endpoint;
  }

  if (env.PAYMENT_PROVIDER === "sepay") {
    if (!env.SEPAY_WEBHOOK_SECRET || env.SEPAY_WEBHOOK_SECRET.length < 16) {
      problems.push("SEPAY_WEBHOOK_SECRET là bắt buộc khi PAYMENT_PROVIDER=sepay (khoá HMAC-SHA256 của webhook SePay, tối thiểu 16 ký tự).");
    }
    if (!env.SEPAY_BANK_ACCOUNT || !/^[0-9A-Za-z]{4,30}$/.test(env.SEPAY_BANK_ACCOUNT)) {
      problems.push("SEPAY_BANK_ACCOUNT là bắt buộc khi PAYMENT_PROVIDER=sepay (số tài khoản nhận tiền, chỉ chữ và số).");
    }
    if (!env.SEPAY_BANK_NAME || !/^[0-9A-Za-z .-]{2,40}$/.test(env.SEPAY_BANK_NAME)) {
      problems.push("SEPAY_BANK_NAME là bắt buộc khi PAYMENT_PROVIDER=sepay (tên viết tắt của ngân hàng, ví dụ MBBank, Vietcombank).");
    }
    // A production shop on SePay Test mode would show buyers an account that never confirms real money.
    if (appEnv === "production" && env.SEPAY_MODE !== "live") {
      problems.push("SEPAY_MODE trên production phải là live (Test mode của SePay không có tiền thật).");
    }
  }

  if (env.STORAGE_DRIVER === "r2") {
    for (const key of [
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_PUBLIC_BUCKET",
      "R2_PRIVATE_BUCKET",
    ] as const) {
      if (!env[key]) problems.push(`${key} là bắt buộc khi STORAGE_DRIVER=r2.`);
    }
    if (env.R2_ACCOUNT_ID && !/^[0-9a-f]{32}$/.test(env.R2_ACCOUNT_ID)) {
      problems.push("R2_ACCOUNT_ID phải là mã tài khoản Cloudflare (32 ký tự 0-9 a-f).");
    }
    for (const key of ["R2_PUBLIC_BUCKET", "R2_PRIVATE_BUCKET"] as const) {
      const name = env[key];
      if (name && !R2_BUCKET_NAME.test(name)) problems.push(`${key} không phải tên bucket R2 hợp lệ (3–63 ký tự a-z 0-9 -).`);
    }
    if (env.R2_PUBLIC_BUCKET && env.R2_PUBLIC_BUCKET === env.R2_PRIVATE_BUCKET) {
      // One bucket for both would put the sellable files behind the public domain.
      problems.push("R2_PUBLIC_BUCKET và R2_PRIVATE_BUCKET phải là hai bucket khác nhau (file bán không bao giờ nằm ở bucket công khai).");
    }
    const base = parsePublicBaseUrl(env.R2_PUBLIC_BASE_URL);
    if (!base.ok) {
      problems.push(base.error);
    } else {
      env.R2_PUBLIC_BASE_URL = base.url;
      if (appEnv === "production" && base.r2dev) {
        problems.push("R2_PUBLIC_BASE_URL trên production phải là tên miền riêng gắn vào bucket (địa chỉ r2.dev chỉ để thử, bị giới hạn tốc độ).");
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Cấu hình môi trường không an toàn (${appEnv}):\n- ${problems.join("\n- ")}`);
  }
  return env;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
