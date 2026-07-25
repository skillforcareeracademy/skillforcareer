import { z } from "zod";

/**
 * Type-safe, validated access to environment variables.
 *
 * Server code should import `env` from here rather than reading
 * `process.env.*` directly, so a missing/invalid variable fails fast at
 * startup with a clear message instead of surfacing as an obscure runtime bug.
 *
 * Only `NEXT_PUBLIC_*` values are safe to read on the client.
 */

const serverSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BOOTSTRAP_DATABASE_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET is too short"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET is too short"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
  OTP_EXPIRY_MINUTES: z.coerce.number().int().positive().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  SMTP_HOST: z.string().default("smtp.gmail.com"),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .string()
    .transform((v) => v === "true")
    .default(false),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  SMTP_FROM_NAME: z.string().default("SkillForCareer"),
  SMTP_FROM_EMAIL: z.string().default(""),

  EVENT_SIGNING_SECRET: z.string().min(16).optional(),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage/uploads"),

  // Live signaling runs as its own process — SIGNAL_URL is where the browser
  // connects, SIGNAL_PORT/ALLOWED_ORIGINS configure that process itself.
  SIGNAL_URL: z.string().url().default("http://localhost:4001"),
  SIGNAL_PORT: z.coerce.number().int().positive().default(4001),
  ALLOWED_ORIGINS: z.string().default(""),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Shared secret for the scheduled-reminder cron endpoint (Bearer token).
  CRON_SECRET: z.string().optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("SkillForCareer"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

function formatIssues(issues: z.ZodIssue[]): string {
  return issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
}

function parseServerEnv() {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `❌ Invalid server environment variables:\n${formatIssues(
        parsed.error.issues,
      )}`,
    );
  }
  return parsed.data;
}

function parseClientEnv() {
  // NEXT_PUBLIC_* are inlined at build time; read them by name explicitly.
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!parsed.success) {
    throw new Error(
      `❌ Invalid client environment variables:\n${formatIssues(
        parsed.error.issues,
      )}`,
    );
  }
  return parsed.data;
}

const isServer = typeof window === "undefined";

/** Validated server environment. Do NOT import from client components. */
export const env = isServer
  ? { ...parseServerEnv(), ...parseClientEnv() }
  : (parseClientEnv() as ReturnType<typeof parseServerEnv> &
      ReturnType<typeof parseClientEnv>);

export type Env = typeof env;
