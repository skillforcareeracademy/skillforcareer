import { withRoute } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";

// The mariadb driver needs the Node.js runtime; never render this statically.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — liveness + database connectivity probe.
 * Also serves as the Step-1 smoke test that the TiDB adapter is wired up.
 */
export const GET = withRoute(async () => {
  let database = false;
  let latencyMs: number | null = null;

  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
    latencyMs = Date.now() - started;
  } catch {
    database = false;
  }

  return ok({
    status: database ? "ok" : "degraded",
    services: {
      database: { connected: database, latencyMs },
    },
    version: process.env.npm_package_version ?? "0.1.0",
    timestamp: new Date().toISOString(),
  });
});
