import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Email OTP helpers.
 *
 * The plaintext OTP is emailed to the user; only a SHA-256 hash is stored, so a
 * database leak never exposes live codes. Verification is constant-time.
 * Length / expiry / attempt limits come from env (validated in src/lib/env.ts).
 */
function otpLength(): number {
  return Number(process.env.OTP_LENGTH ?? 6);
}

export function otpExpiryMinutes(): number {
  return Number(process.env.OTP_EXPIRY_MINUTES ?? 10);
}

export function otpMaxAttempts(): number {
  return Number(process.env.OTP_MAX_ATTEMPTS ?? 5);
}

/** Cryptographically-random numeric OTP, zero-padded to the configured length. */
export function generateOtp(): string {
  const len = otpLength();
  const max = 10 ** len;
  return randomInt(0, max).toString().padStart(len, "0");
}

export function hashOtp(otp: string): string {
  return createHash("sha256").update(otp).digest("hex");
}

export function verifyOtp(otp: string, storedHash: string): boolean {
  const a = Buffer.from(hashOtp(otp), "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function otpExpiresAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + otpExpiryMinutes() * 60_000);
}
