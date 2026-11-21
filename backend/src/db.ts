import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@backend/generated/prisma/client";
import { getEnv } from "./env";

/**
 * Single Prisma client per server instance, connected through DATABASE_URL
 * (the Neon *pooled* connection). Created lazily so pages that never touch the
 * database can render without credentials.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const { DATABASE_URL } = getEnv();
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL chưa được cấu hình (xem .env.example).");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });
}

export function getDb(): PrismaClient {
  // Cached on globalThis so dev hot-reload and warm serverless invocations reuse one client.
  globalForPrisma.prisma ??= createClient();
  return globalForPrisma.prisma;
}
