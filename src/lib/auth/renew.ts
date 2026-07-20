import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { signToken, verifyToken, type AuthClaims } from "./jwt";
import { refreshTtlSeconds } from "./duration";

/**
 * Silent session renewal.
 *
 * Access tokens are deliberately short-lived, so on their own they would sign a
 * user out every 15 minutes. This mints a replacement from the long-lived
 * refresh cookie, which is what the proxy calls on every request whose access
 * token has lapsed. The user never sees it; the session ends only on an
 * explicit logout (or when the refresh token is revoked server-side).
 *
 * Runs in the Node.js runtime — Next 16's proxy defaults to Node, so the DB
 * revocation check below is reachable from there.
 */

/** Refresh tokens are stored hashed, so a leaked DB dump can't resume sessions. */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface RenewedSession {
  accessToken: string;
  /** Set only when the refresh token was rolled forward this request. */
  refreshToken?: string;
  claims: AuthClaims;
}

/** Roll the refresh token forward once it is inside this much of its expiry. */
const ROLL_FORWARD_WINDOW_SECONDS = 30 * 86400; // 30 days

export async function renewFromRefreshToken(
  refreshToken: string,
): Promise<RenewedSession | null> {
  let payload;
  try {
    payload = await verifyToken(refreshToken, "refresh");
  } catch {
    return null; // expired, tampered with, or signed by a rotated secret
  }

  // Signature alone isn't enough: logout and password-reset revoke tokens in the
  // DB, and those revocations have to be honoured here or they'd never bite.
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashRefreshToken(refreshToken) },
    select: { revokedAt: true, expiresAt: true },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) return null;

  const claims: AuthClaims = {
    sub: payload.sub,
    email: payload.email,
    role: payload.role,
  };
  const accessToken = await signToken(claims, "access");

  const secondsLeft = (stored.expiresAt.getTime() - Date.now()) / 1000;
  if (secondsLeft > ROLL_FORWARD_WINDOW_SECONDS) return { accessToken, claims };

  // Approaching the hard expiry — issue a successor so an in-use session never
  // lapses. The current token is intentionally left valid rather than revoked:
  // a page load fires several requests at once, and revoking here would let the
  // first one invalidate the token its siblings are still presenting. The old
  // row simply ages out on its own `expiresAt`.
  const rolled = await signToken(claims, "refresh");
  await prisma.refreshToken.create({
    data: {
      userId: claims.sub,
      tokenHash: hashRefreshToken(rolled),
      expiresAt: new Date(Date.now() + refreshTtlSeconds() * 1000),
    },
  });
  return { accessToken, refreshToken: rolled, claims };
}
