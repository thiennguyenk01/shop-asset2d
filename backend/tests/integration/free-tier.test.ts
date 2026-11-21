import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setFreeTierOnly } from "@backend/modules/settings/admin-service";
import { databaseBlockedByFreeTier, freeTierOnly, uploadBlockedByFreeTier } from "@backend/modules/usage/guard";
import { cleanup, createUser, db, newTag } from "./fixtures";

/**
 * "Free plans only" (user choice 2026-11-22) on the dev database: the Admin switch (typed OPEN to turn it off, logged)
 * and the guards. The dev database and buckets are far below the allowances, so only a huge upload is refused.
 * The switch is put back as it was.
 */
const tag = newTag();
let adminId: string;
let before: boolean | undefined;

beforeAll(async () => {
  adminId = (await createUser(tag, "admin")).id;
  before = (await db().shopSettings.findUnique({ where: { id: 1 }, select: { freeTierOnly: true } }))?.freeTierOnly;
});

afterAll(async () => {
  if (before !== undefined) await db().shopSettings.update({ where: { id: 1 }, data: { freeTierOnly: before } });
  await cleanup(tag);
});

describe("free plans only", () => {
  it("on: a normal upload passes, one past 90 % of R2 is refused; sign-ups and orders go on", async () => {
    await setFreeTierOnly(true, null, adminId);
    expect(await freeTierOnly()).toBe(true);
    expect(await uploadBlockedByFreeTier(1_000_000)).toBe(false);
    expect(await uploadBlockedByFreeTier(20e9)).toBe(true);
    expect(await databaseBlockedByFreeTier()).toBe(false);
  });

  it("turning it off needs OPEN and is logged; then nothing is refused; turning it on needs nothing", async () => {
    expect(await setFreeTierOnly(false, "nope", adminId)).toEqual({ ok: false, error: "confirm" });
    expect(await freeTierOnly()).toBe(true);

    expect(await setFreeTierOnly(false, " open ", adminId)).toEqual({ ok: true, changed: true });
    expect(await freeTierOnly()).toBe(false);
    expect(await uploadBlockedByFreeTier(20e9)).toBe(false);
    expect(await setFreeTierOnly(false, "OPEN", adminId)).toEqual({ ok: true, changed: false });

    expect(await setFreeTierOnly(true, null, adminId)).toEqual({ ok: true, changed: true });
    expect(await freeTierOnly()).toBe(true);

    const logs = await db().auditLog.findMany({
      where: { adminId, action: "settings.freeTier" },
      orderBy: { createdAt: "asc" },
      select: { diff: true },
    });
    expect(logs.map((l) => l.diff)).toEqual([
      { freeTierOnly: { before: true, after: false } },
      { freeTierOnly: { before: false, after: true } },
    ]);
  });
});
