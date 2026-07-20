import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/**
 * Admin impersonation ("secret login") state.
 *
 * When an admin signs in as another user we swap the normal auth cookies for
 * the target's session, and additionally set this cookie — a JWT signed with
 * the server-only `JWT_ACCESS_SECRET` — that binds the impersonation back to
 * the admin who started it. Because it's signed, the impersonated user cannot
 * forge or tamper with it to escalate privileges; the "return to my account"
 * flow trusts only the admin id inside this verified token.
 */
export const IMPERSONATION_COOKIE = "sfc_imp";

const IMP_MAX_AGE = 60 * 60 * 12; // 12h — a bounded impersonation window
const isProd = process.env.NODE_ENV === "production";
const encoder = new TextEncoder();

function secret(): Uint8Array {
  const s = process.env.JWT_ACCESS_SECRET;
  if (!s) throw new Error("Missing JWT_ACCESS_SECRET");
  return encoder.encode(s);
}

async function signImpersonationToken(adminId: string): Promise<string> {
  return new SignJWT({ imp: adminId, type: "impersonation" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .setSubject(adminId)
    .sign(secret());
}

/** Persist a tamper-proof record of who started the current impersonation. */
export async function setImpersonationCookie(adminId: string): Promise<void> {
  const store = await cookies();
  store.set(IMPERSONATION_COOKIE, await signImpersonationToken(adminId), {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: IMP_MAX_AGE,
  });
}

export async function clearImpersonationCookie(): Promise<void> {
  const store = await cookies();
  store.delete(IMPERSONATION_COOKIE);
}

/**
 * The verified id of the admin behind the current impersonation, or null when
 * not impersonating (cookie absent, forged, or expired).
 */
export async function readImpersonator(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(IMPERSONATION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.type !== "impersonation") return null;
    return typeof payload.imp === "string" ? payload.imp : null;
  } catch {
    return null;
  }
}
