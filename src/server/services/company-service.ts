import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { ROLES } from "@/config/roles";
import { seatUsage, type SeatRole } from "@/lib/auth/tenant";
import type { CompanyInput } from "@/lib/validations/company";

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
