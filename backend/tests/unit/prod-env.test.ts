import { parse } from "dotenv";
import { describe, expect, it } from "vitest";
import { checkProductionEnv, productionTemplate, readableEnvErrors } from "../../scripts/prod-env";

/** GĐ7.7 preparation: the live site's settings are checked before they go into Vercel's Production environment. */
const local = {
  DATABASE_URL: "postgresql://u:p@ep-dev-1-pooler.ap-southeast-1.aws.neon.tech/db?sslmode=require",
  R2_PUBLIC_BUCKET: "dev-public",
  R2_PRIVATE_BUCKET: "dev-private",
  AUTH_SECRET: "d".repeat(43),
  PRODUCTION_DATABASE_HOSTS: "ep-prod-9.ap-southeast-1.aws.neon.tech",
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
};
const preview = { R2_PUBLIC_BUCKET: "preview-public", R2_PRIVATE_BUCKET: "preview-private", AUTH_SECRET: "p".repeat(43) };
/** Everything right, except the mail service: the code can only write mails to files today. */
const prod = {
  APP_URL: "https://asset2d.vercel.app",
  DATABASE_URL: "postgresql://u:p@ep-prod-9-pooler.ap-southeast-1.aws.neon.tech/db?sslmode=verify-full",
  PRODUCTION_DATABASE_HOSTS: "ep-prod-9.ap-southeast-1.aws.neon.tech",
  AUTH_SECRET: "a".repeat(43),
  CRON_SECRET: "c".repeat(43),
  PAYMENT_PROVIDER: "sepay",
  SEPAY_MODE: "live",
  SEPAY_WEBHOOK_SECRET: "w".repeat(32),
  SEPAY_BANK_ACCOUNT: "0123456789",
  SEPAY_BANK_NAME: "MBBank",
  SEPAY_ACCOUNT_NAME: "SHOP",
  STORAGE_DRIVER: "r2",
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  R2_ACCESS_KEY_ID: "k",
  R2_SECRET_ACCESS_KEY: "s",
  R2_PUBLIC_BUCKET: "prod-public",
  R2_PRIVATE_BUCKET: "prod-private",
  R2_PUBLIC_BASE_URL: "https://media.example.com",
  MAIL_DRIVER: "resend",
  MAIL_FROM: "Shop <no-reply@example.com>",
};
const check = (over: Record<string, string>) => checkProductionEnv({ ...prod, ...over }, [local, preview]).join("\n");

describe("production env", () => {
  it("only the missing mail service remains when everything else is right", () => {
    const problems = checkProductionEnv(prod, [local, preview]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/MAIL_DRIVER=resend chưa có trong code/);
  });
  it("the app's own production rules: no Demo, no r2.dev, no mail outbox, a long CRON_SECRET", () => {
    expect(check({ PAYMENT_PROVIDER: "demo" })).toMatch(/demo/);
    expect(check({ R2_PUBLIC_BASE_URL: "https://pub-abc.r2.dev" })).toMatch(/r2\.dev/);
    expect(check({ MAIL_DRIVER: "outbox" })).toMatch(/outbox/);
    expect(check({ CRON_SECRET: "short" })).toMatch(/CRON_SECRET/);
    expect(check({ SEPAY_MODE: "test" })).toMatch(/live/);
  });
  it("the production branch, pooled; no direct connection on Vercel", () => {
    expect(check({ DATABASE_URL: "postgresql://u:p@ep-prod-9.ap-southeast-1.aws.neon.tech/db" })).toMatch(/pooled/);
    expect(check({ DATABASE_URL: local.DATABASE_URL })).toMatch(/PRODUCTION_DATABASE_HOSTS/);
    expect(check({ DIRECT_URL: "postgresql://u:p@ep-prod-9.ap-southeast-1.aws.neon.tech/db" })).toMatch(/bỏ DIRECT_URL/);
  });
  it("nothing shared with dev or the preview; the live address, not the preview one", () => {
    expect(check({ R2_PRIVATE_BUCKET: "preview-private" })).toMatch(/bucket của dev/);
    expect(check({ AUTH_SECRET: local.AUTH_SECRET })).toMatch(/AUTH_SECRET trùng/);
    expect(check({ APP_URL: "https://asset2d-git-main-team.vercel.app" })).toMatch(/bản thử/);
  });
  it("an empty value is reported once, as missing", () => {
    const problems = checkProductionEnv({ ...prod, APP_URL: "", MAIL_DRIVER: "" }, [local, preview]);
    expect(problems.filter((p) => p.includes("APP_URL"))).toEqual([".env.vercel-production: thiếu APP_URL."]);
    expect(problems.filter((p) => p.includes("MAIL_DRIVER"))).toEqual([".env.vercel-production: thiếu MAIL_DRIVER."]);
  });
  it("schema errors read as one line per value", () => {
    expect(readableEnvErrors("✖ Invalid URL\n  → at APP_URL\n- STORAGE_DRIVER phải là r2 trên production.")).toEqual([
      "APP_URL: Invalid URL",
      "STORAGE_DRIVER phải là r2 trên production.",
    ]);
  });
  it("template: random secrets, live payments and R2, the rest to fill in", () => {
    const t = parse(productionTemplate(local));
    expect(t.AUTH_SECRET).toMatch(/^[\w-]{43}$/);
    expect(t.CRON_SECRET).not.toBe(t.AUTH_SECRET);
    expect(t).toMatchObject({ PAYMENT_PROVIDER: "sepay", SEPAY_MODE: "live", STORAGE_DRIVER: "r2", APP_URL: "", DATABASE_URL: "" });
    expect(t.PRODUCTION_DATABASE_HOSTS).toBe(local.PRODUCTION_DATABASE_HOSTS);
  });
});
