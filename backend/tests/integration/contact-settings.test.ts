import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@backend/generated/prisma/client";
import { getAdminSettings, saveContactChannels } from "@backend/modules/settings/admin-service";
import { cleanup, createUser, db, newTag } from "./fixtures";

/**
 * Contact channels of the chat button (user choice 2026-11-26) against the dev database. The channels are the one
 * shared settings row: what was there before is put back at the end.
 */
const tag = newTag();
let admin: { id: string };
let before: unknown;

beforeAll(async () => {
  admin = await createUser(tag, "admin");
  before =
    (await db().shopSettings.findUnique({ where: { id: 1 }, select: { contactChannels: true } }))?.contactChannels ??
    null;
});

afterAll(async () => {
  await db().shopSettings.updateMany({
    where: { id: 1 },
    data: { contactChannels: before === null ? Prisma.DbNull : (before as Prisma.InputJsonValue) },
  });
  await cleanup(tag); // also removes the audit rows of the test Admin
});

describe("Admin contact channels", () => {
  it("saves normalized values in the chosen order with an audit row; the same again changes nothing", async () => {
    const form = {
      order: ["telegram", "hotline"],
      values: { telegram: "@shop_asset2d", hotline: "+84 912 345 678", email: "HELP@Example.test" },
      enabled: { telegram: true, hotline: true, email: false },
    };
    expect(await saveContactChannels(form, admin.id)).toEqual({ ok: true, changed: true });
    const s = await getAdminSettings();
    expect(s.contacts.slice(0, 2)).toEqual([
      { kind: "telegram", value: "shop_asset2d", enabled: true },
      { kind: "hotline", value: "0912345678", enabled: true },
    ]);
    expect(s.contacts.find((c) => c.kind === "email")).toEqual({
      kind: "email",
      value: "help@example.test",
      enabled: false,
    });
    const log = await db().auditLog.findMany({ where: { adminId: admin.id, action: "settings.contact" } });
    expect(log).toHaveLength(1);

    expect(await saveContactChannels(form, admin.id)).toEqual({ ok: true, changed: false });
    expect(await db().auditLog.count({ where: { adminId: admin.id, action: "settings.contact" } })).toBe(1);
  });

  it("a bad value saves nothing", async () => {
    const stored = (await db().shopSettings.findUnique({ where: { id: 1 }, select: { contactChannels: true } }))
      ?.contactChannels;
    expect(
      await saveContactChannels({ order: [], values: { zalo: "not a number" }, enabled: { zalo: true } }, admin.id),
    ).toEqual({
      ok: false,
      fields: { zalo: "invalid" },
    });
    expect(
      (await db().shopSettings.findUnique({ where: { id: 1 }, select: { contactChannels: true } }))?.contactChannels,
    ).toEqual(stored);
  });
});
