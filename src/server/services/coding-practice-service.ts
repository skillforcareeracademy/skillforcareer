import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { ROLES } from "@/config/roles";
import type { Settings } from "@/lib/validations/settings";
import type { PublicUser } from "./auth-service";

/**
 * Single sign-on into Coding Practice, the separate medical-coding practice
 * product. The link in the panels hits `/api/coding-practice/launch`, which
 * mints a one-minute token and sends the browser to the product's `/sso/lms`,
 * where it is verified and exchanged for a session there. Nobody types a second
 * password.
 *
 * The product is sold to other companies too, so the token only ever says who
 * this person is in the LMS. Which company they land in, and with what role, is
 * decided on the product's side: the LMS can sign people in to Skill For
 * Career's own company there and nowhere else.
 *
 * The token must match the product's verifier exactly — issuer, audience,
 * HS256, a `jti` it remembers so the link can't be replayed.
 */

const ISSUER = "skillforcareer-lms";
const AUDIENCE = "skillforcareer-coding";
/** Long enough for a redirect, short enough that a leaked link is useless. */
const TOKEN_TTL = "60s";

/** Why the link couldn't sign someone in — named after what they're missing. */
export type CodingPracticeUnavailable = "off" | "setup" | "enrolled" | "staff" | "account";

type Viewer = Pick<PublicUser, "id" | "role" | "status">;

function isStaff(role: string): boolean {
  return role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN;
}

/**
 * Whether this person falls inside the audience picked in Settings. Only the
 * "enrolled" audience costs a query, and only for non-staff.
 */
export async function inCodingPracticeAudience(
  user: Viewer,
  audience: Settings["codingPracticeAudience"],
): Promise<boolean> {
  if (audience === "everyone") return true;
  if (isStaff(user.role)) return true;
  if (audience === "staff") return false;
  const enrolment = await prisma.enrollment.findFirst({
    where: { userId: user.id, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { id: true },
  });
  return enrolment !== null;
}

/** Whether the panels should show this person the Coding Practice link. */
export async function showsCodingPractice(user: Viewer, settings: Settings): Promise<boolean> {
  if (!settings.codingPracticeEnabled) return false;
  return inCodingPracticeAudience(user, settings.codingPracticeAudience);
}

/** The product's address — Settings first, then the server environment. */
function productUrl(settings: Settings): string | null {
  const url = settings.codingPracticeUrl || env.CODING_PRACTICE_URL || "";
  return url ? url.replace(/\/+$/, "") : null;
}

/**
 * Work out where the launch link should send this person: straight into the
 * product with a fresh token, or the reason they can't go.
 */
export async function prepareCodingPracticeLaunch(
  user: PublicUser,
  settings: Settings,
  next: string | null,
): Promise<{ url: string } | { unavailable: CodingPracticeUnavailable }> {
  if (!settings.codingPracticeEnabled) return { unavailable: "off" };
  if (user.status !== "ACTIVE") return { unavailable: "account" };

  const secret = env.CODING_PRACTICE_SSO_SECRET;
  const base = productUrl(settings);
  if (!secret || !base) return { unavailable: "setup" };

  if (!(await inCodingPracticeAudience(user, settings.codingPracticeAudience))) {
    return { unavailable: settings.codingPracticeAudience === "staff" ? "staff" : "enrolled" };
  }

  const token = await new SignJWT({
    email: user.email.toLowerCase(),
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .setJti(randomUUID())
    .sign(new TextEncoder().encode(secret));

  const target = new URL(`${base}/sso/lms`);
  target.searchParams.set("token", token);
  if (next) target.searchParams.set("next", next);
  return { url: target.toString() };
}
