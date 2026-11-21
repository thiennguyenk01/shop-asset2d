import "server-only";
import { getDb } from "@backend/db";

/** Size of the database this app is connected to (its Neon branch), in bytes. */
export async function databaseBytes(): Promise<number> {
  const [row] = await getDb().$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`;
  return Number(row.bytes);
}

/** The largest tables (data + indexes), biggest first. */
export async function largestTables(take: number): Promise<{ name: string; bytes: number }[]> {
  const rows = await getDb().$queryRaw<{ name: string; bytes: bigint }[]>`
    SELECT c.relname AS name, pg_total_relation_size(c.oid) AS bytes
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY bytes DESC LIMIT ${take}`;
  return rows.map((r) => ({ name: r.name, bytes: Number(r.bytes) }));
}

/** Mails the shop sent since `since`: today the only mail is the password reset link, one per token. */
export function countMailsSince(since: Date): Promise<number> {
  return getDb().passwordResetToken.count({ where: { createdAt: { gte: since } } });
}
