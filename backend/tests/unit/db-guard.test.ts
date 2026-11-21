import { describe, expect, it } from "vitest";
import { checkDbGuard, isNeonPooledHost } from "../../scripts/db-guard";

const DIRECT = "postgresql://u:p@ep-cool-dev-123.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const POOLED = "postgresql://u:p@ep-cool-dev-123-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const PROD_DIRECT_HOST = "ep-prod-999.ap-southeast-1.aws.neon.tech";

describe("db-guard", () => {
  it("allows migrate on a development branch with a direct connection", () => {
    expect(checkDbGuard("migrate", { DIRECT_URL: DIRECT, DATABASE_URL: POOLED })).toEqual([]);
  });

  it("refuses migrate and seed when APP_ENV=production", () => {
    expect(checkDbGuard("migrate", { APP_ENV: "production", DIRECT_URL: DIRECT })).not.toEqual([]);
    expect(checkDbGuard("seed", { APP_ENV: "production", DATABASE_URL: POOLED })).not.toEqual([]);
  });

  it("refuses when VERCEL_ENV=production", () => {
    expect(checkDbGuard("seed", { VERCEL_ENV: "production", DATABASE_URL: POOLED })).not.toEqual([]);
  });

  it("refuses a database listed in PRODUCTION_DATABASE_HOSTS (direct or pooled form)", () => {
    const prodPooled = `postgresql://u:p@ep-prod-999-pooler.ap-southeast-1.aws.neon.tech/db`;
    const problems = checkDbGuard("seed", { DATABASE_URL: prodPooled, PRODUCTION_DATABASE_HOSTS: PROD_DIRECT_HOST });
    expect(problems.join()).toMatch(/PRODUCTION_DATABASE_HOSTS/);
  });

  it("refuses migrate through a pooled connection", () => {
    expect(checkDbGuard("migrate", { DIRECT_URL: POOLED }).join()).toMatch(/pooler/);
  });

  it("refuses migrate without DIRECT_URL", () => {
    expect(checkDbGuard("migrate", { DATABASE_URL: POOLED }).join()).toMatch(/DIRECT_URL/);
  });

  it("detects Neon pooler hosts", () => {
    expect(isNeonPooledHost("ep-a-1-pooler.region.aws.neon.tech")).toBe(true);
    expect(isNeonPooledHost("ep-a-1.region.aws.neon.tech")).toBe(false);
  });
});
