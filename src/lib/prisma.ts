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
  const client = new PrismaClient({
    adapter,
    log:
      process.env.DEBUG_SQL === "1"
        ? [{ emit: "event", level: "query" }, "error", "warn"]
        : process.env.NODE_ENV === "development"
          ? ["error", "warn"]
          : ["error"],
  });
  if (process.env.DEBUG_SQL === "1") {
    // Round-trip counter for perf work: `DEBUG_SQL=1 npm start` prints one line
    // per query, so a page's true round-trip count is greppable from the log.
    client.$on("query", (e: { query: string; duration: number }) => {
      console.log(`[sql ${e.duration}ms] ${e.query.slice(0, 120)}`);
    });
  }
  return client;
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
