import type { PoolConfig } from "mariadb";

/**
 * TiDB Cloud Serverless connection tuning for the mariadb driver adapter.
 *
 * Two TiDB-specific gotchas are handled here (both fail at a different layer
 * with a misleading error, so they are documented in one place):
 *
 *   1. TLS must be enabled *explicitly* in the driver config. The `?ssl=...` /
 *      `sslaccept=strict` URL parameters are Prisma-isms — the mariadb driver
 *      does not read them, so without an explicit `ssl` option the handshake to
 *      the gateway is attempted in plaintext and rejected.
 *
 *   2. The driver's default `connectTimeout` (~1s) is too low for the TLS
 *      handshake to the `ap-southeast-1` gateway, which intermittently fails the
 *      pool on cold start. We raise it well above the default.
 *
 * The application database is `lms`. TiDB's `sys` schema is a system database
 * that Prisma refuses (P3004), so DATABASE_URL must never point at it.
 */

/**
 * One handshake attempt. Deliberately *shorter* than the acquire budget below:
 * a serverless cluster that is resuming refuses or hangs the first connection,
 * and when both timeouts were 30s that single attempt consumed the whole budget
 * and the page died with "failed to retrieve a connection from pool
 * (active=0 idle=0)". At 10s the pool gets several attempts per request, which
 * is enough to ride out a resume — a warm handshake measures ~2s.
 */
const CONNECT_TIMEOUT_MS = 10_000;
/** How long a request waits for a connection, across retries. */
const ACQUIRE_TIMEOUT_MS = 30_000;
const POOL_CONNECTION_LIMIT = 10;

function parseDatabaseUrl(rawUrl: string): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
} {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(
      "DATABASE_URL is not a valid connection URL. Expected: mysql://user:pass@host:port/db",
    );
  }

  const database = url.pathname.replace(/^\//, "");

  if (database === "sys") {
    throw new Error(
      "DATABASE_URL points at TiDB's `sys` schema, which Prisma cannot use (P3004). " +
        "Point it at the application database `lms` instead — run scripts/create-db.mjs to create it.",
    );
  }

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 4000,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}

/**
 * Build a mariadb `PoolConfig` from a connection URL with TiDB-safe defaults.
 * Defaults to `process.env.DATABASE_URL`; pass an explicit URL for bootstrap
 * tasks that connect through the `test` schema.
 */
export function getMariaDbConfig(connectionUrl?: string): PoolConfig {
  const rawUrl = connectionUrl ?? process.env.DATABASE_URL;

  if (!rawUrl) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  }

  const { host, port, user, password, database } = parseDatabaseUrl(rawUrl);

  return {
    host,
    port,
    user,
    password,
    database,
    // (1) explicit TLS — required for TiDB Cloud, ignored via URL params.
    ssl: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },
    // (2) generous timeouts for the cross-region TLS handshake, with room to
    //     retry inside a single request (see the constants above).
    connectTimeout: CONNECT_TIMEOUT_MS,
    acquireTimeout: ACQUIRE_TIMEOUT_MS,
    // Keep the pool trying to open a connection for the whole acquire window
    // instead of giving up on the first failure while a caller is still waiting.
    initializationTimeout: ACQUIRE_TIMEOUT_MS,
    connectionLimit: POOL_CONNECTION_LIMIT,
    // TiDB is MySQL-compatible; keep BigInt/decimal as strings to avoid
    // precision loss, and normalise timezone handling.
    bigIntAsNumber: false,
    insertIdAsNumber: false,
    timezone: "Z",
  };
}
