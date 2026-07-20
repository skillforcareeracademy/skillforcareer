import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { Role } from "@/config/roles";
import { accessTtlSeconds, refreshTtlSeconds } from "./duration";

/**
 * JWT signing/verification via `jose` — works in both the Node.js and Edge
 * (middleware) runtimes, unlike `jsonwebtoken`. Two token types:
 *   • access  — short-lived, carries identity + role for authorization
 *   • refresh — long-lived, used only to mint new access tokens
 */

export type TokenType = "access" | "refresh";

/** Identity claims we put into a token (kept free of JWTPayload's index signature). */
export interface AuthClaims {
  sub: string; // user id
  email: string;
  role: Role;
}

export interface AuthTokenPayload extends JWTPayload {
  sub: string; // user id
  email: string;
  role: Role;
  type: TokenType;
}

const encoder = new TextEncoder();

function secretFor(type: TokenType): Uint8Array {
  const secret =
    type === "access"
      ? process.env.JWT_ACCESS_SECRET
      : process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error(
      `Missing ${type === "access" ? "JWT_ACCESS_SECRET" : "JWT_REFRESH_SECRET"}`,
    );
  }
  return encoder.encode(secret);
}

/** Relative lifetime for `setExpirationTime` — jose reads `"900s"` as "900
 *  seconds from now", so seconds keep this identical to the cookie's Max-Age. */
function expiryFor(type: TokenType): string {
  const seconds = type === "access" ? accessTtlSeconds() : refreshTtlSeconds();
  return `${seconds}s`;
}

export async function signToken(
  payload: AuthClaims,
  type: TokenType,
): Promise<string> {
  return new SignJWT({ ...payload, type })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiryFor(type))
    .setSubject(payload.sub)
    .sign(secretFor(type));
}

export async function verifyToken(
  token: string,
  type: TokenType,
): Promise<AuthTokenPayload> {
  const { payload } = await jwtVerify(token, secretFor(type));
  if (payload.type !== type) {
    throw new Error("Token type mismatch");
  }
  return payload as AuthTokenPayload;
}

export async function signAuthTokens(
  user: AuthClaims,
): Promise<{ accessToken: string; refreshToken: string }> {
  const [accessToken, refreshToken] = await Promise.all([
    signToken(user, "access"),
    signToken(user, "refresh"),
  ]);
  return { accessToken, refreshToken };
}
