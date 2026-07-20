import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { ROLES } from "@/config/roles";
import { LEAD_STATUS_LABELS, LEAD_SOURCE_LABELS } from "@/lib/validations/lead";
import type {
  EnquiryInput,
  CreateLeadInput,
  UpdateLeadInput,
  FollowUpInput,
  LeadSource,
  LeadStatus,
} from "@/lib/validations/lead";

// ── Writes ───────────────────────────────────────────────────────────────────

export async function createLead(input: CreateLeadInput | EnquiryInput, source: LeadSource): Promise<string> {
  const lead = await prisma.lead.create({
    data: {
      name: input.name,
      email: input.email || null,
      phone: input.phone,
      courseInterest: input.courseInterest || null,
      message: input.message || null,
      source,
      status: "NEW",
    },
    select: { id: true },
  });
  return lead.id;
}

export async function updateLead(id: string, input: UpdateLeadInput): Promise<void> {
  const existing = await prisma.lead.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Lead not found.");
  const data: Prisma.LeadUpdateInput = {};
  if (input.status) data.status = input.status;
  if (input.assignedToId !== undefined) {
    data.assignedTo = input.assignedToId
      ? { connect: { id: input.assignedToId } }
      : { disconnect: true };
  }
  await prisma.lead.update({ where: { id }, data });
}

/** Add a follow-up remark; optionally snapshots + advances the lead status. */
export async function addFollowUp(
  leadId: string,
  input: FollowUpInput,
  userId: string,
): Promise<string> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true } });
  if (!lead) throw AppError.notFound("Lead not found.");
  const followUp = await prisma.leadFollowUp.create({
    data: { leadId, note: input.note, status: input.status ?? null, createdById: userId },
    select: { id: true },
  });
  if (input.status) {
    await prisma.lead.update({ where: { id: leadId }, data: { status: input.status } });
  } else {
    await prisma.lead.update({ where: { id: leadId }, data: { updatedAt: new Date() } });
  }
  return followUp.id;
}

export async function deleteLead(id: string): Promise<void> {
  const existing = await prisma.lead.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Lead not found.");
  await prisma.leadFollowUp.deleteMany({ where: { leadId: id } });
  await prisma.lead.delete({ where: { id } });
}

// ── Reads ────────────────────────────────────────────────────────────────────

export interface LeadListQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  source?: string;
}

function buildWhere(q: Pick<LeadListQuery, "search" | "status" | "source">): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [];
  if (q.search) {
    and.push({
      OR: [
        { name: { contains: q.search } },
        { phone: { contains: q.search } },
        { email: { contains: q.search } },
      ],
    });
  }
  if (q.status) and.push({ status: q.status as LeadStatus });
  if (q.source) and.push({ source: q.source as LeadSource });
  return and.length ? { AND: and } : {};
}

export async function listLeadsAdmin(q: LeadListQuery) {
  const where = buildWhere(q);
  const [total, rows] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        assignedTo: { select: { name: true } },
        _count: { select: { followUps: true } },
      },
    }),
  ]);
  return {
    total,
    leads: rows.map((l) => ({
      id: l.id,
      name: l.name,
      email: l.email,
      phone: l.phone,
      courseInterest: l.courseInterest,
      source: l.source,
      status: l.status,
      assignedToName: l.assignedTo?.name ?? null,
      followUps: l._count.followUps,
      createdAt: l.createdAt.toISOString(),
    })),
  };
}

export interface LeadStats {
  total: number;
  newLeads: number;
  inProgress: number;
  converted: number;
  lost: number;
}

export async function leadStats(): Promise<LeadStats> {
  const [total, newLeads, contacted, qualified, converted, lost] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { status: "NEW" } }),
    prisma.lead.count({ where: { status: "CONTACTED" } }),
    prisma.lead.count({ where: { status: "QUALIFIED" } }),
    prisma.lead.count({ where: { status: "CONVERTED" } }),
    prisma.lead.count({ where: { status: "LOST" } }),
  ]);
  return { total, newLeads, inProgress: contacted + qualified, converted, lost };
}

export async function getLeadDetail(id: string) {
  const l = await prisma.lead.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true } },
      followUps: {
        orderBy: { createdAt: "desc" },
        include: { createdBy: { select: { name: true, avatarUrl: true } } },
      },
    },
  });
  if (!l) throw AppError.notFound("Lead not found.");
  return {
    id: l.id,
    name: l.name,
    email: l.email,
    phone: l.phone,
    courseInterest: l.courseInterest,
    message: l.message,
    source: l.source,
    status: l.status,
    assignedTo: l.assignedTo,
    createdAt: l.createdAt.toISOString(),
    followUps: l.followUps.map((f) => ({
      id: f.id,
      note: f.note,
      status: f.status,
      authorName: f.createdBy.name,
      authorAvatar: f.createdBy.avatarUrl,
      createdAt: f.createdAt.toISOString(),
    })),
  };
}

/** Staff/instructors a lead can be assigned to. */
export async function listAssignees() {
  return prisma.user.findMany({
    where: { role: { slug: { in: [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.INSTRUCTOR] } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

// ── CSV export ───────────────────────────────────────────────────────────────

export async function leadsForExport(q: Pick<LeadListQuery, "search" | "status" | "source">) {
  const where = buildWhere(q);
  const rows = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: { assignedTo: { select: { name: true } } },
  });
  const headers = [
    "Name",
    "Phone",
    "Email",
    "Course interest",
    "Source",
    "Status",
    "Assigned to",
    "Created",
  ];
  const data = rows.map((l) => [
    l.name,
    l.phone,
    l.email ?? "",
    l.courseInterest ?? "",
    LEAD_SOURCE_LABELS[l.source as LeadSource] ?? l.source,
    LEAD_STATUS_LABELS[l.status as LeadStatus] ?? l.status,
    l.assignedTo?.name ?? "",
    l.createdAt.toISOString().slice(0, 10),
  ]);
  return { headers, data };
}
