/**
 * Create the `lms` application database on TiDB Cloud.
 *
 * TiDB's `sys` schema is unusable with Prisma (P3004), so we connect through the
 * always-present `test` schema (BOOTSTRAP_DATABASE_URL) and create `lms`.
 *
 * Usage:  node --env-file=.env scripts/create-db.mjs
 * (wired as `npm run db:create`)
 */
import mariadb from "mariadb";

const APP_DB = "lms";

function bootstrapUrl() {
  if (process.env.BOOTSTRAP_DATABASE_URL) return process.env.BOOTSTRAP_DATABASE_URL;
  if (!process.env.DATABASE_URL) {
    throw new Error("Neither BOOTSTRAP_DATABASE_URL nor DATABASE_URL is set.");
  }
  // Fall back to DATABASE_URL with its schema rewritten to `test`.
  const u = new URL(process.env.DATABASE_URL);
  u.pathname = "/test";
  return u.toString();
}

async function main() {
  const url = new URL(bootstrapUrl());

  const conn = await mariadb.createConnection({
    host: url.hostname,
    port: url.port ? Number(url.port) : 4000,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, "") || "test",
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectTimeout: 30_000,
  });

  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${APP_DB}\` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_general_ci;`,
    );
    const rows = await conn.query("SHOW DATABASES LIKE ?;", [APP_DB]);
    if (rows.length > 0) {
      console.log(`✅ Database \`${APP_DB}\` is ready on ${url.hostname}.`);
    } else {
      throw new Error(`Database \`${APP_DB}\` was not found after creation.`);
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("❌ Failed to create database:", err.message);
  process.exit(1);
});
