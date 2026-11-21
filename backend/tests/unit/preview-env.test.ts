import { parse } from "dotenv";
import { describe, expect, it } from "vitest";
import { checkPreviewEnv, PREVIEW_REQUIRED, previewTemplate } from "../../scripts/preview-env";

/** GĐ7.6: the preview environment file is checked before anything touches its database or buckets. */
const local = {
  DATABASE_URL: "postgresql://u:p@ep-dev-1-pooler.ap-southeast-1.aws.neon.tech/db?sslmode=require",
  DIRECT_URL: "postgresql://u:p@ep-dev-1.ap-southeast-1.aws.neon.tech/db?sslmode=require",
  PRODUCTION_DATABASE_HOSTS: "ep-prod-9.ap-southeast-1.aws.neon.tech",
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  R2_PUBLIC_BUCKET: "dev-public",
  R2_PRIVATE_BUCKET: "dev-private",
};
const good = {
  APP_URL: "https://shop-git-main-me.vercel.app",
  DATABASE_URL: "postgresql://u:p@ep-prev-2-pooler.ap-southeast-1.aws.neon.tech/db?sslmode=require",
  DIRECT_URL: "postgresql://u:p@ep-prev-2.ap-southeast-1.aws.neon.tech/db?sslmode=require",
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  R2_ACCESS_KEY_ID: "id",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_PUBLIC_BUCKET: "preview-public",
  R2_PRIVATE_BUCKET: "preview-private",
  R2_PUBLIC_BASE_URL: "https://pub-x.r2.dev",
  AUTH_SECRET: "x".repeat(43),
  PAYMENT_PROVIDER: "demo",
  STORAGE_DRIVER: "r2",
};

describe("preview env", () => {
  it("a complete file on its own branch and buckets passes", () => {
    expect(checkPreviewEnv(good, local)).toEqual([]);
  });
  it("names every missing value", () => {
    const problems = checkPreviewEnv({}, local);
    for (const key of PREVIEW_REQUIRED) expect(problems.some((p) => p.includes(key))).toBe(true);
  });
  it("never the production database (hosts from .env.local), never the dev branch", () => {
    const prod = { ...good, DIRECT_URL: "postgresql://u:p@ep-prod-9.ap-southeast-1.aws.neon.tech/db" };
    expect(checkPreviewEnv(prod, local).join("\n")).toMatch(/PRODUCTION_DATABASE_HOSTS/);
    const dev = { ...good, DATABASE_URL: local.DATABASE_URL, DIRECT_URL: local.DIRECT_URL };
    expect(checkPreviewEnv(dev, local).join("\n")).toMatch(/nhánh dev/);
  });
  it("runtime connection pooled, migrations direct; own buckets; https address; Demo + R2 only", () => {
    expect(checkPreviewEnv({ ...good, DATABASE_URL: good.DIRECT_URL }, local).join("\n")).toMatch(/pooled/);
    expect(checkPreviewEnv({ ...good, DIRECT_URL: good.DATABASE_URL }, local).join("\n")).toMatch(/pooler/);
    expect(checkPreviewEnv({ ...good, R2_PRIVATE_BUCKET: "dev-private" }, local).join("\n")).toMatch(/bucket của dev/);
    expect(checkPreviewEnv({ ...good, APP_URL: "http://localhost:3000" }, local).join("\n")).toMatch(/https/);
    expect(checkPreviewEnv({ ...good, PAYMENT_PROVIDER: "sepay" }, local).join("\n")).toMatch(/PAYMENT_PROVIDER/);
    expect(checkPreviewEnv({ ...good, STORAGE_DRIVER: "local" }, local).join("\n")).toMatch(/STORAGE_DRIVER/);
  });
  it("template: fresh random secrets, fixed values, the user fills the rest", () => {
    const a = parse(previewTemplate(local));
    const b = parse(previewTemplate(local));
    expect(a.AUTH_SECRET).toMatch(/^[\w-]{43}$/);
    expect(a.AUTH_SECRET).not.toBe(b.AUTH_SECRET);
    expect(a.CRON_SECRET).not.toBe(a.AUTH_SECRET);
    expect(a).toMatchObject({ PAYMENT_PROVIDER: "demo", STORAGE_DRIVER: "r2", MAIL_OUTBOX_DIR: "/tmp/mail-outbox", APP_URL: "", DATABASE_URL: "", R2_ACCOUNT_ID: local.R2_ACCOUNT_ID });
    expect(a.PRODUCTION_DATABASE_HOSTS).toBe(local.PRODUCTION_DATABASE_HOSTS);
  });
});
