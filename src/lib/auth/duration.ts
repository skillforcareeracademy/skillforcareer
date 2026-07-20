/**
 * Token lifetimes come from env (`JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`)
 * and are consumed in three places: the JWT `exp` claim, the cookie `Max-Age`,
 * and the `RefreshToken.expiresAt` row. Parsing them in one place keeps those
 * three in lockstep — when they drift, the browser drops a cookie whose token is
 * still perfectly valid (or vice-versa) and the user is silently signed out.
 */

const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

/** Access tokens stay short — the proxy renews them silently, so the user
 *  never feels the expiry, and a leaked one is only briefly useful. */
export const DEFAULT_ACCESS_TTL = "15m";

/** The refresh token *is* the session. Long-lived and rolled forward on use, so
 *  a session ends when the user logs out — not on a timer. */
export const DEFAULT_REFRESH_TTL = "365d";

function parse(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(\d+)\s*([smhd])$/i.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * UNIT_SECONDS[match[2].toLowerCase()];
}

export function accessTtlSeconds(): number {
  return parse(process.env.JWT_ACCESS_EXPIRES_IN) ?? parse(DEFAULT_ACCESS_TTL)!;
}

export function refreshTtlSeconds(): number {
  return parse(process.env.JWT_REFRESH_EXPIRES_IN) ?? parse(DEFAULT_REFRESH_TTL)!;
}
