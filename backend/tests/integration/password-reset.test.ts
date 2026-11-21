import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RESET_MAX_PER_HOUR } from "@backend/lib/auth/password-reset";
import { hashPassword, verifyPassword } from "@backend/auth/password";
import { getEnv } from "@backend/env";
import {
  isResetLinkUsable,
  requestPasswordReset,
  resetPasswordWithToken,
} from "@backend/modules/user/password-reset-service";
import { cleanup, createUser, db, newTag } from "./fixtures";

/**
 * Forgot / reset password (GĐ6.2) against the real services, the dev database and the dev mail outbox: the link
 * only exists in the mail (read back from `.mail-outbox/`), works once, for 30 minutes, cancels older links, and
 * the new password signs every session out. Unknown or locked accounts get no mail and no different answer.
 */
const tag = newTag();
const outbox = () => path.resolve(getEnv().MAIL_OUTBOX_DIR);

/** Mails written to the outbox for one address, oldest first: subject + the token of the link. */
async function mailsTo(email: string) {
  const files = (await readdir(outbox()).catch(() => [] as string[])).filter((f) => f.endsWith(".json")).sort();
  const out: { id: string; subject: string; locale: string; token: string }[] = [];
  for (const f of files) {
    const meta = JSON.parse(await readFile(path.join(outbox(), f), "utf8"));
    if (meta.to !== email) continue;
    const html = await readFile(path.join(outbox(), `${meta.id}.html`), "utf8");
    out.push({
      id: meta.id,
      subject: meta.subject,
      locale: meta.locale,
      token: /\/reset-password\/([A-Za-z0-9_-]{43})"/.exec(html)![1],
    });
  }
  return out;
}

let user: { id: string; email: string };

beforeAll(async () => {
  user = await createUser(tag, "reset");
  await db().user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword("matkhau-cu-123") } });
});

afterAll(async () => {
  // Remove this run's mails from the dev outbox, then the rows.
  for (const label of ["reset", "locked", "flood"]) {
    for (const m of await mailsTo(`it-${tag}-${label}@example.test`)) {
      for (const ext of ["html", "txt", "json"]) await rm(path.join(outbox(), `${m.id}.${ext}`), { force: true });
    }
  }
  await db().passwordResetToken.deleteMany({ where: { user: { email: { startsWith: `it-${tag}-` } } } });
  await cleanup(tag);
  expect(await db().user.count({ where: { email: { startsWith: `it-${tag}-` } } })).toBe(0);
});

describe("Forgot / reset password (GĐ6.2)", () => {
  it("an unknown email gets the same silent end: no link, no mail", async () => {
    const before = await db().passwordResetToken.count();
    await requestPasswordReset(`it-${tag}-nobody@example.test`, "vi");
    expect(await db().passwordResetToken.count()).toBe(before);
    expect(await mailsTo(`it-${tag}-nobody@example.test`)).toEqual([]);
  });

  it("sends one link in the customer's language; only the hash is stored; a newer link cancels the older one", async () => {
    await requestPasswordReset(user.email, "en");
    const [first] = await mailsTo(user.email);
    expect(first.locale).toBe("en");
    expect(first.subject).toBe("Reset your Asset Game MMORPG 2D password");
    const rows = await db().passwordResetToken.findMany({
      where: { userId: user.id },
      select: { tokenHash: true, expiresAt: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toContain(first.token);
    const minutes = (rows[0].expiresAt.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30);
    expect(await isResetLinkUsable(first.token)).toBe(true);

    await requestPasswordReset(user.email, "vi");
    const [, second] = await mailsTo(user.email);
    expect(second.locale).toBe("vi");
    expect(await isResetLinkUsable(first.token)).toBe(false);
    expect(await isResetLinkUsable(second.token)).toBe(true);
  });

  it("the link sets the new password once, and every session of the account ends", async () => {
    const [, link] = await mailsTo(user.email);
    const before = await db().user.findUniqueOrThrow({ where: { id: user.id }, select: { sessionVersion: true } });
    expect(await resetPasswordWithToken(link.token, "matkhau-moi-456")).toEqual({ ok: true, email: user.email });
    const after = await db().user.findUniqueOrThrow({
      where: { id: user.id },
      select: { sessionVersion: true, passwordHash: true },
    });
    expect(after.sessionVersion).toBe(before.sessionVersion + 1);
    expect(await verifyPassword(after.passwordHash!, "matkhau-moi-456")).toBe(true);
    expect(await verifyPassword(after.passwordHash!, "matkhau-cu-123")).toBe(false);

    // Used up: the page shows "no longer works", a second submit changes nothing.
    expect(await isResetLinkUsable(link.token)).toBe(false);
    expect(await resetPasswordWithToken(link.token, "matkhau-khac-789")).toEqual({ ok: false, error: "invalidLink" });
    expect(await resetPasswordWithToken("__none__", "matkhau-khac-789")).toEqual({ ok: false, error: "invalidLink" });
  });

  it("a link is dead after 30 minutes", async () => {
    await requestPasswordReset(user.email, "vi", new Date(Date.now() - 31 * 60_000));
    const mails = await mailsTo(user.email);
    expect(await isResetLinkUsable(mails[mails.length - 1].token)).toBe(false);
    expect(await resetPasswordWithToken(mails[mails.length - 1].token, "matkhau-tre-123")).toEqual({
      ok: false,
      error: "invalidLink",
    });
  });

  it("a locked account gets no mail, and a link sent before the lock stops working", async () => {
    const locked = await createUser(tag, "locked");
    await requestPasswordReset(locked.email, "vi");
    const [link] = await mailsTo(locked.email);
    await db().user.update({ where: { id: locked.id }, data: { status: "LOCKED" } });
    expect(await isResetLinkUsable(link.token)).toBe(false);
    expect(await resetPasswordWithToken(link.token, "matkhau-moi-456")).toEqual({ ok: false, error: "invalidLink" });
    await requestPasswordReset(locked.email, "vi");
    expect(await mailsTo(locked.email)).toHaveLength(1);
  });

  it(`at most ${RESET_MAX_PER_HOUR} links per account per hour; more requests end silently`, async () => {
    const flood = await createUser(tag, "flood");
    for (let i = 0; i < RESET_MAX_PER_HOUR + 2; i++) await requestPasswordReset(flood.email, "vi");
    expect(await db().passwordResetToken.count({ where: { userId: flood.id } })).toBe(RESET_MAX_PER_HOUR);
    expect(await mailsTo(flood.email)).toHaveLength(RESET_MAX_PER_HOUR);
  });
});
