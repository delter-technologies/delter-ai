import "server-only";
import { PrismaClient } from "@/generated/prisma";

/**
 * A single Prisma client for the whole server process.
 *
 * Next.js hot-reloads modules in development; without this guard every reload
 * would open a new pool of SQLite connections until the file handles ran out.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" && process.env.PRISMA_LOG === "1" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
