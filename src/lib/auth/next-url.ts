import { ROLE_HOME, ROLES, type Role } from "@/config/roles";

/**
 * Where an auth screen sends someone once they're signed in.
 *
 * Two rules, both from the client's report that "sign in to enroll" dropped
 * buyers on their dashboard with the course forgotten:
 *
 * 1. A `?next=` on the URL wins — it carries the course, checkout or page the
 *    visitor was actually trying to reach.
 * 2. Failing that, a brand-new learner goes to the catalogue rather than an
 *    empty dashboard ("signup krke panel khula hai to course ka page khulna
 *    chahiye sabse pehle"). Staff still land on their own home.
 */

/** The catalogue inside the learner panel — a new learner's first stop. */
export const STUDENT_CATALOG = "/student/courses";

/**
 * Accept only same-site paths. An attacker-supplied `?next=https://evil.example`
 * would otherwise turn the sign-in page into an open redirect, and `//evil.com`
 * is a protocol-relative URL that browsers treat as absolute — hence both
 * checks rather than just the leading slash.
 */
export function safeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  return path;
}

/** Resolve the landing route for a freshly authenticated user. */
export function destinationFor(
  role: Role,
  next?: string | null,
  opts: { isNewAccount?: boolean } = {},
): string {
  const target = safeNext(next);
  if (target) return target;
  if (opts.isNewAccount && role === ROLES.STUDENT) return STUDENT_CATALOG;
  return ROLE_HOME[role] ?? "/student";
}
