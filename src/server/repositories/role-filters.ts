import type { Prisma } from "@/generated/prisma/client";
import { ROLES, type Role } from "@/config/roles";

/**
 * "Is this person a student / an instructor?" as a `User` filter.
 *
 * A person's primary role lives on `User.roleId`, but since phase 9 they can
 * hold extra roles too (`UserRole`) — an instructor who is also enrolled as a
 * learner, a student who assists on a batch. Every picker that asks "who is a
 * student?" has to look at both, or it either misses those people or, worse,
 * offers staff where only learners belong.
 *
 * Relation filters compile to SQL sub-queries, so this stays one round trip
 * even under `relationMode = "prisma"`.
 */
export function holdsRole(slug: Role): Prisma.UserWhereInput {
  return {
    OR: [{ role: { slug } }, { extraRoles: { some: { role: { slug } } } }],
  };
}

/** Active learners: primary or extra STUDENT role, account in good standing. */
export function activeStudentWhere(): Prisma.UserWhereInput {
  return { AND: [holdsRole(ROLES.STUDENT), { status: "ACTIVE" }] };
}

/** Active teachers: primary or extra INSTRUCTOR role. */
export function activeInstructorWhere(): Prisma.UserWhereInput {
  return { AND: [holdsRole(ROLES.INSTRUCTOR), { status: "ACTIVE" }] };
}
