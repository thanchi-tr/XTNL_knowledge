import { PrismaClient } from "@prisma/client";

// Next.js dev mode hot-reloads modules on every request, which would create
// a new PrismaClient (and a new connection pool) on every reload without
// this. Standard Prisma+Next.js singleton pattern.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
