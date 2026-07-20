import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";
import { getMariaDbConfig } from "./db-config";

/**
 * Prisma client singleton.
 *
 * Prisma 7 has no built-in query engine — the connection is provided by the
 * mariadb driver adapter, which is where TiDB's TLS/timeout tuning lives
 * (src/lib/db-config.ts). A single instance is cached on `globalThis` in
 * development so Next.js Fast Refresh does not exhaust the connection pool.
 */
function createPrismaClient() {
  // db-config returns the root `mariadb` PoolConfig; the adapter bundles its own
  // mariadb copy whose PoolConfig type differs only in an optional `stream`
  // callback signature. They are structurally compatible for the fields we set,
  // so bridge the duplicate-package type mismatch at this single call site.
  const adapter = new PrismaMariaDb(
    getMariaDbConfig() as ConstructorParameters<typeof PrismaMariaDb>[0],
  );
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
  });
}

type PrismaClientSingleton = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined;
};

export const prisma: PrismaClientSingleton =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
