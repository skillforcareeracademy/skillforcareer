import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { ROLES, type Role } from "@/config/roles";

export {
  COMPANY_ADMIN_SECTIONS,
  companyAdminMayOpen,
} from "./tenant-sections";

/**
 * Keeping one company's data away from another's.
 *
 * The platform is sold to companies who train their own staff through the
 * academy, and a company admin must see nothing outside its own company —
 * "they can not see anything about any other company admin or related batches
 * or instructor, students, payments or anything."
 *
 * Two rules make that true rather than hoped for.
 *
 * **Null is the academy.** Every account that existed before companies did
 * carries no company, and so does every account the academy itself creates.
 * Scoping only ever narrows, and only for an account that has a company, so
 * nothing about the academy's own panel changed when this arrived.
 *
 * **Deny by default.** A screen that has not been taught to scope itself is
 * closed to company admins altogether (see `COMPANY_ADMIN_SECTIONS`), rather
 * than left open and trusted to filter. A tenant leak is not a bug you find
 * in testing — it is one a customer finds in your other customer's data — so
 * the failure mode here is a company admin being told "not available" about a
 * page that is still being scoped, never being shown someone else's rows.
 */

/**
 * Who is asking, as little of them as the rules need.
 *
 * `companyId` is required, not optional, and deliberately so: when it was
 * optional, passing a session object that did not carry one type-checked
 * perfectly and silently disabled every check in this file. A missing tenant
 * must be a compile error, never a quiet "allow".
 */
export interface Caller {
  id: string;
  role: Role;
  companyId: string | null;
}

/** True when this account belongs to a client company rather than the academy. */
export function isTenant(user: Caller): boolean {
  return Boolean(user.companyId);
}

/** The academy's own staff, who see everything. */
export function isAcademyStaff(user: Caller): boolean {
  return (
    !user.companyId &&
    (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.ADMIN)
  );
}

/**
 * The company filter for any model that carries `companyId` directly.
 *
 * `{}` for the academy's own people — they see everything, which is what
 * super admin asked for: "super admin can see company user and their profiles
 * and their performances".
 */
export function companyScope(user: Caller): { companyId?: string } {
  return user.companyId ? { companyId: user.companyId } : {};
}

/**
 * The same filter for a model that reaches its company through its owner —
 * a payment, an enrolment, a lead. Returns `{}` for the academy.
 */
export function ownerCompanyScope(user: Caller): {
  user?: { companyId: string };
} {
  return user.companyId ? { user: { companyId: user.companyId } } : {};
}

/**
 * Refuse unless the row belongs to the caller's company.
 *
 * The filter above protects a list. This protects everything reached by id,
 * which is where tenant isolation is actually lost: a company admin who edits
 * the URL of `/admin/users/<id>` must be refused, not served.
 */
export function assertSameCompany(
  user: Caller,
  rowCompanyId: string | null | undefined,
): void {
  if (!user.companyId) return; // the academy may reach anything
  if (rowCompanyId !== user.companyId) {
    // Deliberately the same message as a missing row: whether a given id
    // exists in another company is itself something they must not learn.
    throw AppError.notFound("That isn't here.");
  }
}

/** Load a user and refuse unless they are in the caller's company. */
export async function assertOwnsUser(
  user: Caller,
  targetUserId: string,
): Promise<void> {
  if (!user.companyId) return;
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { companyId: true },
  });
  assertSameCompany(user, target?.companyId);
}

/**
 * The seats a company has been given, by role — "super admin can restrict how
 * many users they are allowed to create". Null is no limit; zero forbids.
 */
export const SEAT_FIELDS = {
  [ROLES.STUDENT]: "maxStudents",
  [ROLES.INSTRUCTOR]: "maxInstructors",
  [ROLES.COMPANY_ADMIN]: "maxAdmins",
  [ROLES.SALES_AGENT]: "maxSalesAgents",
} as const satisfies Partial<Record<Role, string>>;

export type SeatRole = keyof typeof SEAT_FIELDS;

/**
 * Refuse to create one more account of this kind when the company is full.
 *
 * Counted at the moment of asking rather than kept as a running total: a
 * stored counter and a real row count drift apart the first time anything is
 * deleted outside this path, and the number that matters is the real one.
 */
export async function assertSeatAvailable(
  companyId: string,
  role: Role,
): Promise<void> {
  const field = SEAT_FIELDS[role as SeatRole];
  if (!field) return; // a kind the academy does not meter

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { status: true, [field]: true } as { status: true },
  });
  if (!company) throw AppError.notFound("That company isn't here.");
  if (company.status === "SUSPENDED") {
    throw AppError.forbidden("This company is suspended.");
  }

  const limit = (company as unknown as Record<string, number | null>)[field];
  if (limit == null) return; // no limit set

  const used = await prisma.user.count({
    where: { companyId, role: { slug: role } },
  });
  if (used >= limit) {
    throw AppError.badRequest(
      limit === 0
        ? "This company isn't allowed accounts of that kind."
        : `This company has used all ${limit} of its ${role.toLowerCase().replace("_", " ")} places.`,
    );
  }
}

/** How many of each metered kind a company has used, for the seats panel. */
export async function seatUsage(
  companyId: string,
): Promise<Record<SeatRole, number>> {
  const rows = await prisma.user.groupBy({
    by: ["roleId"],
    where: { companyId },
    _count: { _all: true },
  });
  const roles = await prisma.role.findMany({
    where: { id: { in: rows.map((r) => r.roleId) } },
    select: { id: true, slug: true },
  });
  const slugOf = new Map(roles.map((r) => [r.id, r.slug]));

  const out = {
    [ROLES.STUDENT]: 0,
    [ROLES.INSTRUCTOR]: 0,
    [ROLES.COMPANY_ADMIN]: 0,
    [ROLES.SALES_AGENT]: 0,
  } as Record<SeatRole, number>;

  for (const row of rows) {
    const slug = slugOf.get(row.roleId) as SeatRole | undefined;
    if (slug && slug in out) out[slug] += row._count._all;
  }
  return out;
}
