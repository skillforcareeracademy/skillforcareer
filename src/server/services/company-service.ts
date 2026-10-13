import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { ROLES, type Role } from "@/config/roles";
import { assertSeatAvailable, seatUsage, type SeatRole } from "@/lib/auth/tenant";
import type { CompanyInput, CompanyPersonInput } from "@/lib/validations/company";
import type { CreateUserAdminInput } from "@/lib/validations/user";
import { createUserAdmin } from "@/server/services/user-service";

/**
 * Companies — the organisations the platform is sold to.
 *
 * Each runs its own training inside the academy's panel and sees nothing
 * outside itself. The academy is a company too, flagged `isOwner`: it is the
 * tenant with sight of all the others, and the one nobody may edit away.
 */

export interface CompanyRow {
  id: string;
  name: string;
  status: string;
  isOwner: boolean;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logoUrl: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  gstNumber: string | null;
  billingEmail: string | null;
  notes: string | null;
  plan: string | null;
  subscriptionEndsAt: string | null;
  /** How many accounts it has, by the kinds the academy meters. */
  seats: Record<SeatRole, number>;
  /** What it is allowed, in the same order. Null is no limit. */
  limits: Record<SeatRole, number | null>;
  users: number;
  createdAt: string;
}

const SELECT = {
  id: true,
  name: true,
  status: true,
  isOwner: true,
  contactName: true,
  email: true,
  phone: true,
  website: true,
  logoUrl: true,
  addressLine: true,
  city: true,
  state: true,
  postcode: true,
  gstNumber: true,
  billingEmail: true,
  notes: true,
  plan: true,
  subscriptionEndsAt: true,
  maxStudents: true,
  maxInstructors: true,
  maxAdmins: true,
  maxSalesAgents: true,
  createdAt: true,
} satisfies Prisma.CompanySelect;

type Row = Prisma.CompanyGetPayload<{ select: typeof SELECT }>;

function limitsOf(c: Row): Record<SeatRole, number | null> {
  return {
    [ROLES.STUDENT]: c.maxStudents,
    [ROLES.INSTRUCTOR]: c.maxInstructors,
    [ROLES.COMPANY_ADMIN]: c.maxAdmins,
    [ROLES.SALES_AGENT]: c.maxSalesAgents,
  };
}

/**
 * Every company, with how full each one is.
 *
 * The owner leads the list whatever it is called: it is the academy, and
 * reading past a dozen customers to find yourself is no way to run a panel.
 */
export async function listCompanies(): Promise<CompanyRow[]> {
  const rows = await prisma.company.findMany({
    orderBy: [{ isOwner: "desc" }, { name: "asc" }],
    select: SELECT,
  });

  // The owner's people are the accounts with no company at all, so its count
  // is the complement of everybody else's rather than a match on its own id.
  const [grouped, academyCount] = await Promise.all([
    prisma.user.groupBy({ by: ["companyId"], _count: { _all: true } }),
    prisma.user.count({ where: { companyId: null } }),
  ]);
  const countOf = new Map(
    grouped
      .filter((g) => g.companyId)
      .map((g) => [g.companyId as string, g._count._all]),
  );

  return Promise.all(
    rows.map(async (c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      isOwner: c.isOwner,
      contactName: c.contactName,
      email: c.email,
      phone: c.phone,
      website: c.website,
      logoUrl: c.logoUrl,
      addressLine: c.addressLine,
      city: c.city,
      state: c.state,
      postcode: c.postcode,
      gstNumber: c.gstNumber,
      billingEmail: c.billingEmail,
      notes: c.notes,
      plan: c.plan,
      subscriptionEndsAt: c.subscriptionEndsAt?.toISOString() ?? null,
      seats: c.isOwner
        ? ({} as Record<SeatRole, number>)
        : await seatUsage(c.id),
      limits: limitsOf(c),
      users: c.isOwner ? academyCount : (countOf.get(c.id) ?? 0),
      createdAt: c.createdAt.toISOString(),
    })),
  );
}

export async function getCompany(id: string): Promise<CompanyRow> {
  const c = await prisma.company.findUnique({ where: { id }, select: SELECT });
  if (!c) throw AppError.notFound("That company isn't here.");
  const users = c.isOwner
    ? await prisma.user.count({ where: { companyId: null } })
    : await prisma.user.count({ where: { companyId: id } });
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    isOwner: c.isOwner,
    contactName: c.contactName,
    email: c.email,
    phone: c.phone,
    website: c.website,
    logoUrl: c.logoUrl,
    addressLine: c.addressLine,
    city: c.city,
    state: c.state,
    postcode: c.postcode,
    gstNumber: c.gstNumber,
    billingEmail: c.billingEmail,
    notes: c.notes,
    plan: c.plan,
    subscriptionEndsAt: c.subscriptionEndsAt?.toISOString() ?? null,
    seats: c.isOwner ? ({} as Record<SeatRole, number>) : await seatUsage(id),
    limits: limitsOf(c),
    users,
    createdAt: c.createdAt.toISOString(),
  };
}

/** An unguessable token for a public enrol or enquiry URL. */
function token(): string {
  return randomBytes(24).toString("base64url");
}

function writable(input: CompanyInput) {
  return {
    name: input.name,
    status: input.status,
    contactName: input.contactName || null,
    email: input.email || null,
    phone: input.phone || null,
    website: input.website || null,
    logoUrl: input.logoUrl || null,
    notes: input.notes || null,
    addressLine: input.addressLine || null,
    city: input.city || null,
    state: input.state || null,
    postcode: input.postcode || null,
    gstNumber: input.gstNumber ? input.gstNumber.toUpperCase() : null,
    billingEmail: input.billingEmail || null,
    plan: input.plan || null,
    subscriptionEndsAt: input.subscriptionEndsAt
      ? new Date(input.subscriptionEndsAt)
      : null,
    maxStudents: input.maxStudents ?? null,
    maxInstructors: input.maxInstructors ?? null,
    maxAdmins: input.maxAdmins ?? null,
    maxSalesAgents: input.maxSalesAgents ?? null,
    razorpayKeyId: input.razorpayKeyId || null,
    whatsappPhoneId: input.whatsappPhoneId || null,
    senderEmail: input.senderEmail || null,
  };
}

export async function createCompany(input: CompanyInput): Promise<string> {
  const made = await prisma.company.create({
    data: {
      ...writable(input),
      // Only the seed makes an owner; nothing the panel does can mint a second.
      isOwner: false,
      subscribedAt: input.plan ? new Date() : null,
      enrolToken: token(),
      formToken: token(),
      ...(input.razorpayKeySecret
        ? { razorpayKeySecret: input.razorpayKeySecret }
        : {}),
      ...(input.whatsappToken ? { whatsappToken: input.whatsappToken } : {}),
    },
    select: { id: true },
  });
  return made.id;
}

export async function updateCompany(
  id: string,
  input: CompanyInput,
): Promise<void> {
  const existing = await prisma.company.findUnique({
    where: { id },
    select: { isOwner: true },
  });
  if (!existing) throw AppError.notFound("That company isn't here.");

  const data = writable(input);
  if (existing.isOwner) {
    // The academy is not a customer: it has no seat limit, no subscription and
    // cannot be suspended out of its own platform.
    data.status = "ACTIVE";
    data.plan = null;
    data.subscriptionEndsAt = null;
    data.maxStudents = null;
    data.maxInstructors = null;
    data.maxAdmins = null;
    data.maxSalesAgents = null;
  }

  await prisma.company.update({
    where: { id },
    data: {
      ...data,
      // A blank secret leaves the stored one alone — the form never shows it
      // back, so sending blank means "unchanged", not "clear it".
      ...(input.razorpayKeySecret
        ? { razorpayKeySecret: input.razorpayKeySecret }
        : {}),
      ...(input.whatsappToken ? { whatsappToken: input.whatsappToken } : {}),
    },
  });
}

/**
 * Close a company down.
 *
 * Refused while anybody still belongs to it: deleting the row would leave
 * their accounts pointing at nothing, and an account pointing at nothing is
 * an account that scopes to the academy. Suspend it instead, which locks
 * everyone out and keeps every record.
 */
export async function deleteCompany(id: string): Promise<void> {
  const c = await prisma.company.findUnique({
    where: { id },
    select: { isOwner: true },
  });
  if (!c) throw AppError.notFound("That company isn't here.");
  if (c.isOwner) throw AppError.forbidden("The academy can't be removed.");

  const people = await prisma.user.count({ where: { companyId: id } });
  if (people > 0) {
    throw AppError.badRequest(
      `${people} account${people === 1 ? " belongs" : "s belong"} to this company. Move or remove them first, or suspend the company instead.`,
    );
  }
  await prisma.company.delete({ where: { id } });
}

/** Fresh public tokens, which is how the old URLs are revoked. */
export async function rotateCompanyTokens(id: string): Promise<void> {
  await prisma.company.update({
    where: { id },
    data: { enrolToken: token(), formToken: token() },
  });
}

// ── Who belongs to a company ─────────────────────────────────────────────────

export interface CompanyPerson {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  avatarUrl: string | null;
  status: string;
}

const PERSON_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  status: true,
  role: { select: { slug: true, name: true } },
} satisfies Prisma.UserSelect;

type PersonRow = Prisma.UserGetPayload<{ select: typeof PERSON_SELECT }>;

const toPerson = (u: PersonRow): CompanyPerson => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role.slug,
  roleLabel: u.role.name,
  avatarUrl: u.avatarUrl,
  status: u.status,
});

/** Everyone who belongs to this company. */
export async function listCompanyPeople(
  companyId: string,
): Promise<CompanyPerson[]> {
  const rows = await prisma.user.findMany({
    where: { companyId },
    orderBy: [{ name: "asc" }],
    select: PERSON_SELECT,
    take: 500,
  });
  return rows.map(toPerson);
}

/**
 * The roles a company's own account may hold.
 *
 * An academy Admin is deliberately not one of them. Its role carries sections
 * that belong to the academy and no seat kind meters it, so moving one into a
 * company would hand a customer's staff the academy's own panel and cost the
 * customer nothing. A company's admin is a Company Admin.
 */
const COMPANY_ROLES: readonly string[] = [
  ROLES.COMPANY_ADMIN,
  ROLES.INSTRUCTOR,
  ROLES.STUDENT,
  ROLES.SALES_AGENT,
];

/**
 * Accounts that could be moved into a company.
 *
 * Only the academy's own people are offered — anybody already in a company
 * belongs to that one, and moving them between customers behind their back is
 * not something a search box should make easy.
 */
export async function listAssignableUsers(
  search: string,
): Promise<CompanyPerson[]> {
  const q = search.trim();
  const rows = await prisma.user.findMany({
    where: {
      companyId: null,
      role: { slug: { in: [...COMPANY_ROLES] } },
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { email: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: [{ name: "asc" }],
    select: PERSON_SELECT,
    take: 25,
  });
  return rows.map(toPerson);
}

/**
 * Move people into a company.
 *
 * Each one is checked against that company's seats for its own kind, one at a
 * time rather than in bulk: handing over five learners when four places are
 * left should place four and say why the fifth did not, instead of refusing
 * the lot or quietly exceeding the limit.
 */
export async function addPeopleToCompany(
  companyId: string,
  userIds: string[],
): Promise<{ added: number; skipped: { name: string; reason: string }[] }> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { isOwner: true },
  });
  if (!company) throw AppError.notFound("That company isn't here.");
  if (company.isOwner) {
    throw AppError.badRequest(
      "The academy's own people are everybody without a company — there is nothing to assign.",
    );
  }

  const people = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, companyId: true, role: { select: { slug: true } } },
  });

  let added = 0;
  const skipped: { name: string; reason: string }[] = [];
  for (const person of people) {
    if (person.companyId === companyId) continue;
    if (person.companyId) {
      skipped.push({ name: person.name, reason: "Already with another company" });
      continue;
    }
    if (!COMPANY_ROLES.includes(person.role.slug)) {
      skipped.push({
        name: person.name,
        reason: `A ${person.role.slug === ROLES.SUPER_ADMIN ? "super admin" : "academy admin"} cannot belong to a company`,
      });
      continue;
    }
    try {
      await assertSeatAvailable(companyId, person.role.slug as Role);
    } catch (error) {
      skipped.push({
        name: person.name,
        reason: error instanceof AppError ? error.message : "No seat left",
      });
      continue;
    }
    await prisma.user.updateMany({
      where: { id: person.id },
      data: { companyId },
    });
    added += 1;
  }
  return { added, skipped };
}

/**
 * Take somebody out of a company.
 *
 * They become one of the academy's own again rather than being deleted —
 * removing a person from a customer is an administrative move, not the end of
 * their account, their enrolments or their certificates.
 */
export async function removePersonFromCompany(
  companyId: string,
  userId: string,
): Promise<void> {
  const person = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  if (!person || person.companyId !== companyId) {
    throw AppError.notFound("That person isn't in this company.");
  }
  await prisma.user.updateMany({ where: { id: userId }, data: { companyId: null } });
}

/**
 * A brand-new account that starts inside a company.
 *
 * The company that has just been created has nobody in it and no free account
 * to move in, so this is how its first admin comes to exist — without it, a
 * new customer could be set up but never handed over.
 */
export async function createCompanyPerson(
  companyId: string,
  input: CompanyPersonInput,
): Promise<{ id: string }> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { isOwner: true },
  });
  if (!company) throw AppError.notFound("That company isn't here.");
  if (company.isOwner) {
    throw AppError.badRequest("Make the academy's own people under Users.");
  }
  await assertSeatAvailable(companyId, input.roleSlug as Role);
  // The company's own roles are a different set from the academy's, so the
  // shape widens here rather than in the general user form.
  return createUserAdmin(
    { ...input, status: "ACTIVE", roleSlug: input.roleSlug as CreateUserAdminInput["roleSlug"] },
    companyId,
  );
}
