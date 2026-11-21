import { describe, expect, it } from "vitest";
import { parseEnv, resolveAppEnv } from "@backend/env";

const prodBase = {
  APP_ENV: "production",
  DATABASE_URL: "postgresql://u:p@ep-x-pooler.region.aws.neon.tech/db",
  AUTH_SECRET: "x".repeat(32),
  PAYMENT_PROVIDER: "payos",
  STORAGE_DRIVER: "r2",
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  R2_ACCESS_KEY_ID: "b",
  R2_SECRET_ACCESS_KEY: "c",
  R2_PUBLIC_BUCKET: "pub",
  R2_PRIVATE_BUCKET: "priv",
  R2_PUBLIC_BASE_URL: "https://media.example.com",
  MAIL_DRIVER: "resend",
  CRON_SECRET: "c".repeat(32),
};

describe("resolveAppEnv", () => {
  it("defaults to development", () => {
    expect(resolveAppEnv({})).toBe("development");
  });
  it("ignores NODE_ENV (Vercel previews also run with NODE_ENV=production)", () => {
    expect(resolveAppEnv({ NODE_ENV: "production" })).toBe("development");
    expect(resolveAppEnv({ NODE_ENV: "production", VERCEL_ENV: "preview" })).toBe("preview");
  });
  it("VERCEL_ENV=production cannot be downgraded by APP_ENV", () => {
    expect(resolveAppEnv({ VERCEL_ENV: "production", APP_ENV: "development" })).toBe("production");
  });
  it("rejects unknown APP_ENV values", () => {
    expect(() => resolveAppEnv({ APP_ENV: "prod" })).toThrow();
  });
});

describe("parseEnv", () => {
  it("accepts an empty development environment with safe defaults", () => {
    const env = parseEnv({});
    expect(env.APP_ENV).toBe("development");
    expect(env.PAYMENT_PROVIDER).toBe("demo");
    expect(env.STORAGE_DRIVER).toBe("local");
  });

  it("accepts a complete production configuration", () => {
    expect(() => parseEnv(prodBase)).not.toThrow();
  });

  it("refuses Demo Payment in production", () => {
    expect(() => parseEnv({ ...prodBase, PAYMENT_PROVIDER: "demo" })).toThrow(/demo/);
  });

  it("refuses Demo Payment when PAYMENT_PROVIDER is unset in production (default is demo)", () => {
    const rest: Record<string, string> = { ...prodBase };
    delete rest.PAYMENT_PROVIDER;
    expect(() => parseEnv(rest)).toThrow(/demo/);
  });

  it("refuses Demo Payment on a Vercel production deployment even if APP_ENV says otherwise", () => {
    expect(() =>
      parseEnv({ ...prodBase, APP_ENV: "development", VERCEL_ENV: "production", PAYMENT_PROVIDER: "demo" }),
    ).toThrow(/demo/);
  });

  it("refuses local storage in production", () => {
    expect(() => parseEnv({ ...prodBase, STORAGE_DRIVER: "local" })).toThrow(/STORAGE_DRIVER/);
  });

  it("mail: writes files in development; the file outbox is refused in production (GĐ6)", () => {
    expect(parseEnv({}).MAIL_DRIVER).toBe("outbox");
    expect(parseEnv({}).MAIL_OUTBOX_DIR).toBe(".mail-outbox");
    expect(() => parseEnv({ ...prodBase, MAIL_DRIVER: "outbox" })).toThrow(/MAIL_DRIVER/);
    const rest: Record<string, string> = { ...prodBase };
    delete rest.MAIL_DRIVER; // unset → outbox → refused
    expect(() => parseEnv(rest)).toThrow(/MAIL_DRIVER/);
    expect(() => parseEnv({ MAIL_DRIVER: "sendgrid" })).toThrow();
  });

  it("scheduled jobs: production needs a CRON_SECRET of 32+ characters; development may leave it unset (GĐ6.3)", () => {
    expect(parseEnv({}).CRON_SECRET).toBeUndefined();
    expect(() => parseEnv({ ...prodBase, CRON_SECRET: "" })).toThrow(/CRON_SECRET/);
    expect(() => parseEnv({ ...prodBase, CRON_SECRET: "short" })).toThrow(/CRON_SECRET/);
  });

  it("requires DATABASE_URL and a strong AUTH_SECRET outside development", () => {
    expect(() => parseEnv({ ...prodBase, DATABASE_URL: "" })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ ...prodBase, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/);
  });

  it("requires all R2 settings when STORAGE_DRIVER=r2", () => {
    expect(() => parseEnv({ STORAGE_DRIVER: "r2" })).toThrow(/R2_PRIVATE_BUCKET/);
    expect(() => parseEnv({ STORAGE_DRIVER: "r2" })).toThrow(/R2_PUBLIC_BASE_URL/);
  });

  // GĐ7.5
  const r2Dev = { ...prodBase, APP_ENV: "development", PAYMENT_PROVIDER: "demo" };
  it("accepts a valid R2 configuration and keeps only the origin of R2_PUBLIC_BASE_URL", () => {
    expect(parseEnv({ ...r2Dev, R2_PUBLIC_BASE_URL: "https://media.example.com/" }).R2_PUBLIC_BASE_URL).toBe(
      "https://media.example.com",
    );
  });
  it("rejects a malformed account id, bucket names, or one bucket for both", () => {
    expect(() => parseEnv({ ...r2Dev, R2_ACCOUNT_ID: "abc" })).toThrow(/R2_ACCOUNT_ID/);
    expect(() => parseEnv({ ...r2Dev, R2_PUBLIC_BUCKET: "Public_Media" })).toThrow(/R2_PUBLIC_BUCKET/);
    expect(() => parseEnv({ ...r2Dev, R2_PRIVATE_BUCKET: "pub" })).toThrow(/hai bucket khác nhau/);
  });
  it("R2_PUBLIC_BASE_URL must be a bare https origin", () => {
    for (const bad of ["http://media.example.com", "https://media.example.com/img", "https://media.example.com:8443", "media.example.com", "https://u:p@media.example.com"])
      expect(() => parseEnv({ ...r2Dev, R2_PUBLIC_BASE_URL: bad }), bad).toThrow(/R2_PUBLIC_BASE_URL/);
  });
  it("allows r2.dev while testing but not in production", () => {
    const r2dev = "https://pub-0123456789abcdef0123456789abcdef.r2.dev";
    expect(() => parseEnv({ ...r2Dev, R2_PUBLIC_BASE_URL: r2dev })).not.toThrow();
    expect(() => parseEnv({ ...prodBase, R2_PUBLIC_BASE_URL: r2dev })).toThrow(/tên miền riêng/);
    expect(() => parseEnv(prodBase)).not.toThrow();
  });

  it("allows Demo Payment on preview deployments", () => {
    expect(() => parseEnv({ ...prodBase, APP_ENV: "preview", PAYMENT_PROVIDER: "demo" })).not.toThrow();
  });
});
