import { getEnv } from "@backend/env";
import { getSessionUser } from "@backend/auth/guards";
import { LocalStorage } from "@backend/storage/local";
import { verifyUploadTicket } from "@backend/storage/upload-ticket";

/**
 * Dev-only stand-in for an R2 presigned PUT (GĐ5.3): receives the bytes of ONE Admin upload described by a
 * ticket the upload service signed (bucket, server-chosen key, max size, Admin id). Checks, in order:
 * the local driver is in use, the ticket is ours and not expired, the caller is that same Admin (re-read from
 * the DB by the session callback), nothing was uploaded under that key yet (a ticket is used once), the size.
 * It only stores bytes — the finish action then sniffs them and creates the database row.
 */
const reply = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

export async function PUT(request: Request, { params }: RouteContext<"/api/admin/uploads/[ticket]">) {
  const env = getEnv();
  if (env.STORAGE_DRIVER !== "local") return reply(404);

  const ticket = verifyUploadTicket((await params).ticket, env.AUTH_SECRET);
  if (!ticket) return reply(404);

  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN" || user.id !== ticket.u) return reply(403);

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > ticket.m) return reply(413);
  if (!request.body) return reply(400);

  const storage = new LocalStorage(env.STORAGE_LOCAL_ROOT);
  if (await storage.exists(ticket.b, ticket.k)) return reply(409);
  const written = await storage.writeStream(ticket.b, ticket.k, request.body, ticket.m);
  if (!written.ok) return reply(written.error === "tooLarge" ? 413 : 500);
  if (written.sizeBytes === 0) {
    await storage.remove(ticket.b, ticket.k);
    return reply(400);
  }
  return reply(204);
}
