import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 configuration (CLI: generate / db push / migrate / studio).
 *
 * In Prisma 7 the connection URL is no longer allowed in schema.prisma. The
 * runtime client gets its connection via the mariadb driver adapter
 * (src/lib/prisma.ts); the CLI's schema engine gets it from `datasource.url`
 * here.
 *
 * A config file is present, so Prisma does not auto-load .env — do it manually.
 * TiDB Cloud Serverless requires TLS, which the schema engine reads from the
 * URL via `sslaccept=strict`.
 */
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // .env is optional in CI / when vars are already in the environment.
}

function withTiDbTls(url: string | undefined): string | undefined {
  if (!url) return url;
  if (url.includes("sslaccept")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}sslaccept=strict`;
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: withTiDbTls(process.env.DATABASE_URL),
  },
});
