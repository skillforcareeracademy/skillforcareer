import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { notifyStaff } from "./notification-service";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { ROLES } from "@/config/roles";
import type { Role } from "@/config/roles";
import { parseCsv } from "@/lib/csv";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  LEAD_CLASS_MODES,
  LEAD_CLASS_MODE_LABELS,
  LEAD_QUALITIES,
  LEAD_QUALITY_LABELS,
  LEAD_SUB_STATUSES,
  OPEN_LEAD_STAGES,
  INTERESTED_LEAD_STAGES,
  contactHref,
  contactNumber,
  parseAmount,
} from "@/lib/validations/lead";
import type {
  EnquiryInput,
  CreateLeadInput,
  UpdateLeadInput,
  FollowUpInput,
  LeadDocumentInput,
  ImportLeadsInput,
  RemoveDuplicatesInput,
  LeadSource,
  LeadStage,
  LeadClassMode,
  LeadContactChannel,
  LeadQuality,
  LeadSort,
  LeadStatCard,
  LeadViewParams,
} from "@/lib/validations/lead";

/** Legacy 5-value status kept in sync so old rows/reports don't go blank. */
const LEGACY_STATUS: Record<
  LeadStage,
  "NEW" | "CONTACTED" | "QUALIFIED" | "CONVERTED" | "LOST"
> = {
  FRESH_LEAD: "NEW",
  CONTACTED: "CONTACTED",
  INTERESTED: "QUALIFIED",
  COUNSELLING_DEMO: "QUALIFIED",
  FOLLOW_UP: "QUALIFIED",
  ADMISSION_PENDING: "QUALIFIED",
  CONVERTED: "CONVERTED",
  NOT_INTERESTED: "LOST",
  INVALID_LEAD: "LOST",
};

const blank = (v: string | undefined | null) =>
  v && v.trim() ? v.trim() : null;

/**
 * Phone numbers are compared on their last 10 digits throughout: the same
 * person arrives as "9812300011", "09812300011" and "+91 9812300011" depending
 * on who typed the sheet.
 */
const phoneKeyOf = (phone: string) => phone.replace(/\D/g, "").slice(-10);

/** Ceiling on a whole-table duplicate scan. */
const MAX_DUPLICATE_SCAN = 20_000;

// ── Days ─────────────────────────────────────────────────────────────────────

/**
 * The academy works on Indian time, so "today", "received on 1 Sep" and the
 * dates in a download follow the IST calendar whatever timezone the server
 * runs in (UTC on Vercel). IST boundaries suit both shapes a lead's dates come
 * in: a day picked in a form or read from a sheet is stored as UTC midnight —
 * 05:30 IST, the same calendar day — while a website enquiry's `leadDate` is
 * the instant it arrived, which only reads right against IST days.
 */
const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** IST midnight of `ymd` ("2026-09-20"), or of today when omitted. */
function istDayStart(ymd?: string): Date | undefined {
  if (ymd === undefined) {
    const now = new Date(Date.now() + IST_OFFSET_MS);
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
        IST_OFFSET_MS,
    );
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return undefined;
  return new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - IST_OFFSET_MS,
  );
}

/** "2026-09-20" — the IST calendar day an instant falls on. */
const istDay = (d: Date | null) =>
  d ? new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10) : "";

/** "2026-09-20 16:05" in IST, for timestamps in a download. */
const istDateTime = (d: Date) =>
  new Date(d.getTime() + IST_OFFSET_MS)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");

// ── Lead numbers ─────────────────────────────────────────────────────────────

const LEAD_PREFIX = "SFC";

/**
 * The next free `SFC<n>`. Read as a single MAX() rather than counting rows, so
 * deleting a lead never hands its number to somebody else. Two counsellors
 * saving at the same instant can still land on the same number — the unique
 * index catches that and `createLead` retries.
 */
async function nextLeadSeq(): Promise<number> {
  // `Lead` is a reserved word in MySQL 8 / TiDB (the LEAD() window function),
  // so the table name has to stay backticked in raw SQL.
  const rows = await prisma.$queryRaw<{ maxNo: bigint | number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(leadNo, ${LEAD_PREFIX.length + 1}) AS UNSIGNED)) AS maxNo
    FROM \`Lead\`
    WHERE leadNo LIKE ${`${LEAD_PREFIX}%`}
  `;
  return Number(rows[0]?.maxNo ?? 0) + 1;
}

const leadNoFor = (seq: number) => `${LEAD_PREFIX}${seq}`;

const isDuplicateKey = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

// ── Writes ───────────────────────────────────────────────────────────────────

/** Shared mapping from validated input to Prisma columns. */
function leadData(input: UpdateLeadInput) {
  const data:
    Prisma.LeadUncheckedCreateInput | Prisma.LeadUncheckedUpdateInput = {};
  const set = <K extends keyof typeof data>(
    key: K,
    value: (typeof data)[K],
  ) => {
    if (value !== undefined) data[key] = value;
  };

  if (input.name !== undefined) set("name", input.name.trim());
  if (input.phone !== undefined) set("phone", input.phone.trim());
  if (input.whatsapp !== undefined) set("whatsapp", blank(input.whatsapp));
  if (input.email !== undefined) set("email", blank(input.email));
  if (input.leadDate) set("leadDate", input.leadDate);
  if (input.courseId !== undefined) set("courseId", blank(input.courseId));
  if (input.courseInterest !== undefined)
    set("courseInterest", blank(input.courseInterest));
  if (input.whyThisCourse !== undefined)
    set("whyThisCourse", blank(input.whyThisCourse));
  // "" and null both mean "take it off" — see `clearableText` in validations.
  if (input.classMode !== undefined) set("classMode", input.classMode || null);
  if (input.quality !== undefined) set("quality", input.quality || null);
  if (input.leadScore !== undefined) set("leadScore", input.leadScore ?? null);
  if (input.qualification !== undefined)
    set("qualification", blank(input.qualification));
  if (input.jobStatus !== undefined) set("jobStatus", blank(input.jobStatus));
  if (input.experiencedIn !== undefined)
    set("experiencedIn", blank(input.experiencedIn));
  if (input.address !== undefined) set("address", blank(input.address));
  if (input.expectedVisit !== undefined)
    set("expectedVisit", blank(input.expectedVisit));
  if (input.visitDate !== undefined) set("visitDate", input.visitDate ?? null);
  if (input.visitTime !== undefined) set("visitTime", blank(input.visitTime));
  if (input.followUpDate !== undefined)
    set("followUpDate", input.followUpDate ?? null);
  if (input.followUpTime !== undefined)
    set("followUpTime", blank(input.followUpTime));
  if (input.message !== undefined) set("message", blank(input.message));
  if (input.feesOffered !== undefined)
    set("feesOffered", input.feesOffered ?? null);
  if (input.finalFees !== undefined) set("finalFees", input.finalFees ?? null);
  if (input.emiCount !== undefined) set("emiCount", input.emiCount ?? null);
  if (input.assignedToId !== undefined)
    set("assignedToId", blank(input.assignedToId));
  if (input.stage !== undefined) {
    set("stage", input.stage);
    set("status", LEGACY_STATUS[input.stage]);
  }
  if (input.subStatus !== undefined) set("subStatus", blank(input.subStatus));

  return data;
}

export async function createLead(
  input: CreateLeadInput | EnquiryInput,
  source: LeadSource,
): Promise<string> {
  const base = leadData(input as UpdateLeadInput);
  const stage = (input as CreateLeadInput).stage ?? "FRESH_LEAD";

  let seq = await nextLeadSeq();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const lead = await prisma.lead.create({
        data: {
          ...base,
          name: input.name.trim(),
          phone: input.phone.trim(),
          leadNo: leadNoFor(seq),
          source,
          stage,
          status: LEGACY_STATUS[stage],
        } as Prisma.LeadUncheckedCreateInput,
        select: { id: true },
      });

      if (source === "WEBSITE") {
        await notifyStaff({
          type: "SYSTEM",
          title: "New enquiry",
          message: `${input.name}${input.courseInterest ? ` — interested in ${input.courseInterest}` : ""} (${input.phone})`,
          actionUrl: "/admin/leads",
        });
      }
      return lead.id;
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      seq += 1; // somebody took that number between the read and the write
    }
  }
  throw AppError.badRequest(
    "Couldn't allocate a lead number. Please try again.",
  );
}

export async function updateLead(
  id: string,
  input: UpdateLeadInput,
): Promise<void> {
  const existing = await prisma.lead.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw AppError.notFound("Lead not found.");

  const data = leadData(input) as Prisma.LeadUncheckedUpdateInput;
  if (input.source !== undefined) data.source = input.source;
  if (Object.keys(data).length === 0) return;

  await prisma.lead.update({ where: { id }, data });
}

/** Add a follow-up remark; optionally snapshots + advances the stage. */
export async function addFollowUp(
  leadId: string,
  input: FollowUpInput,
  userId: string,
): Promise<string> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true },
  });
  if (!lead) throw AppError.notFound("Lead not found.");

  const followUp = await prisma.leadFollowUp.create({
    data: {
      leadId,
      note: input.note,
      stage: input.stage ?? null,
      subStatus: blank(input.subStatus) ?? null,
      status: input.stage ? LEGACY_STATUS[input.stage] : null,
      createdById: userId,
      // The call-back this remark booked, kept on the remark itself: the lead
      // only holds the latest one, and the history should show each promise.
      nextFollowUpDate: input.followUpDate ?? null,
      nextFollowUpTime: blank(input.followUpTime),
    },
    select: { id: true },
  });

  const next: Prisma.LeadUncheckedUpdateInput = { updatedAt: new Date() };
  if (input.stage) {
    next.stage = input.stage;
    next.status = LEGACY_STATUS[input.stage];
    if (input.subStatus) next.subStatus = input.subStatus.trim();
  }
  if (input.followUpDate !== undefined)
    next.followUpDate = input.followUpDate ?? null;
  if (input.followUpTime !== undefined)
    next.followUpTime = blank(input.followUpTime);
  await prisma.lead.update({ where: { id: leadId }, data: next });

  return followUp.id;
}

export async function deleteLead(id: string): Promise<void> {
  const existing = await prisma.lead.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw AppError.notFound("Lead not found.");
  await prisma.leadFollowUp.deleteMany({ where: { leadId: id } });
  await prisma.leadDocument.deleteMany({ where: { leadId: id } });
  await prisma.lead.delete({ where: { id } });
}

// ── Documents ────────────────────────────────────────────────────────────────

export async function addLeadDocument(
  leadId: string,
  input: LeadDocumentInput,
  userId: string,
): Promise<string> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true },
  });
  if (!lead) throw AppError.notFound("Lead not found.");
  const doc = await prisma.leadDocument.create({
    data: {
      leadId,
      name: input.name.trim(),
      url: input.url.trim(),
      mime: blank(input.mime),
      size: input.size ?? null,
      uploadedById: userId,
    },
    select: { id: true },
  });
  return doc.id;
}

export async function deleteLeadDocument(
  leadId: string,
  documentId: string,
): Promise<void> {
  const doc = await prisma.leadDocument.findUnique({
    where: { id: documentId },
    select: { id: true, leadId: true },
  });
  if (!doc || doc.leadId !== leadId)
    throw AppError.notFound("Document not found.");
  await prisma.leadDocument.delete({ where: { id: documentId } });
}

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * The list's filters and sort as they arrive in a URL, plus who is looking —
 * `assignedToId=me` resolves against `viewerId`.
 */
export type LeadFilters = LeadViewParams & { viewerId?: string };

export interface LeadListQuery extends LeadFilters {
  page: number;
  pageSize: number;
}

/** `from`/`to` bounds as IST days; anything else that parses is taken as-is. */
function dayBound(value: string | undefined, end: boolean): Date | undefined {
  if (!value) return undefined;
  const start = istDayStart(value);
  if (start) return end ? new Date(start.getTime() + DAY_MS - 1) : start;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function buildWhere(q: LeadFilters): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [];
  if (q.search) {
    and.push({
      OR: [
        { leadNo: { contains: q.search } },
        { name: { contains: q.search } },
        { phone: { contains: q.search } },
        { email: { contains: q.search } },
        { courseInterest: { contains: q.search } },
      ],
    });
  }
  if (q.stage) and.push({ stage: q.stage as LeadStage });
  if (q.subStatus) and.push({ subStatus: q.subStatus });
  if (q.source) and.push({ source: q.source as LeadSource });
  if (q.classMode) and.push({ classMode: q.classMode as LeadClassMode });
  if (q.quality) and.push({ quality: q.quality as LeadQuality });
  if (q.minScore) {
    const min = Number(q.minScore);
    if (Number.isFinite(min)) and.push({ leadScore: { gte: min } });
  }
  if (q.courseId) and.push({ courseId: q.courseId });
  if (q.assignedToId) {
    and.push(
      q.assignedToId === "unassigned"
        ? { assignedToId: null }
        : q.assignedToId === "me"
          ? // Nobody signed in can't own a lead — match nothing rather than all.
            { assignedToId: q.viewerId ?? "" }
          : { assignedToId: q.assignedToId },
    );
  }
  if (q.due) {
    // A converted or dropped lead with an old call-back date isn't "overdue",
    // so every due window looks at open leads only — the same rule the stat
    // cards count by.
    const today = istDayStart()!;
    const open: Prisma.LeadWhereInput = {
      stage: { in: [...OPEN_LEAD_STAGES] },
    };
    if (q.due === "overdue") {
      and.push(open, { followUpDate: { lt: today } });
    } else if (q.due === "today") {
      and.push(open, {
        followUpDate: { gte: today, lt: new Date(today.getTime() + DAY_MS) },
      });
    } else if (q.due === "week") {
      and.push(open, {
        followUpDate: {
          gte: today,
          lt: new Date(today.getTime() + 8 * DAY_MS),
        },
      });
    }
  }
  // "Date of lead received" (`leadDate`) and "Lead upload date" (`createdAt`).
  const from = dayBound(q.from, false);
  if (from) and.push({ leadDate: { gte: from } });
  const to = dayBound(q.to, true);
  if (to) and.push({ leadDate: { lte: to } });
  const uploadedFrom = dayBound(q.uploadedFrom, false);
  if (uploadedFrom) and.push({ createdAt: { gte: uploadedFrom } });
  const uploadedTo = dayBound(q.uploadedTo, true);
  if (uploadedTo) and.push({ createdAt: { lte: uploadedTo } });
  return and.length ? { AND: and } : {};
}

/**
 * Every order ends on `id`. A sheet import gives all its rows the same
 * `leadDate`, and without a tiebreak the database may return those in a
 * different order from one page to the next — a lead could show on two pages
 * or none, and the detail sheet's next / previous would skip or repeat.
 */
function orderFor(
  sort: string | undefined,
): Prisma.LeadOrderByWithRelationInput[] {
  switch (sort as LeadSort | undefined) {
    case "received_asc":
      return [{ leadDate: "asc" }, { id: "asc" }];
    case "uploaded_desc":
      return [{ createdAt: "desc" }, { id: "desc" }];
    case "followup_asc":
      return [
        { followUpDate: { sort: "asc", nulls: "last" } },
        { followUpTime: { sort: "asc", nulls: "last" } },
        { id: "asc" },
      ];
    case "score_desc":
      return [
        { leadScore: { sort: "desc", nulls: "last" } },
        { leadDate: "desc" },
        { id: "desc" },
      ];
    case "name_asc":
      return [{ name: "asc" }, { id: "asc" }];
    default:
      return [{ leadDate: "desc" }, { id: "desc" }];
  }
}

const money = (d: Prisma.Decimal | null) => (d == null ? null : Number(d));

export async function listLeadsAdmin(q: LeadListQuery) {
  const where = buildWhere(q);
  const [total, rows] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: orderFor(q.sort),
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        assignedTo: { select: { name: true } },
        course: { select: { title: true } },
        _count: { select: { followUps: true, documents: true } },
        // Just the latest outreach: the row shows "called 2h ago", and pulling
        // the whole history for every lead on the page would be a needless
        // fan-out.
        contacts: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            channel: true,
            createdAt: true,
            user: { select: { name: true } },
          },
        },
      },
    }),
  ]);
  return {
    total,
    leads: rows.map((l) => ({
      id: l.id,
      leadNo: l.leadNo,
      leadDate: l.leadDate.toISOString(),
      name: l.name,
      email: l.email,
      phone: l.phone,
      whatsapp: l.whatsapp,
      lastContact: l.contacts[0]
        ? {
            channel: l.contacts[0].channel,
            at: l.contacts[0].createdAt.toISOString(),
            by: l.contacts[0].user.name,
          }
        : null,
      course: l.course?.title ?? l.courseInterest,
      source: l.source,
      stage: l.stage,
      subStatus: l.subStatus,
      quality: l.quality,
      leadScore: l.leadScore,
      classMode: l.classMode,
      expectedVisit: l.expectedVisit,
      visitDate: l.visitDate?.toISOString() ?? null,
      visitTime: l.visitTime,
      followUpDate: l.followUpDate?.toISOString() ?? null,
      followUpTime: l.followUpTime,
      feesOffered: money(l.feesOffered),
      finalFees: money(l.finalFees),
      assignedToId: l.assignedToId,
      assignedToName: l.assignedTo?.name ?? null,
      followUps: l._count.followUps,
      documents: l._count.documents,
      createdAt: l.createdAt.toISOString(),
    })),
  };
}

/**
 * One page of lead ids in list order — how the detail sheet's previous / next
 * crosses a page boundary without loading whole rows.
 */
export async function leadIdsPage(
  q: LeadListQuery,
): Promise<{ total: number; ids: string[] }> {
  const where = buildWhere(q);
  const [total, rows] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: orderFor(q.sort),
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: { id: true },
    }),
  ]);
  return { total, ids: rows.map((r) => r.id) };
}

export type LeadStats = Record<LeadStatCard, number>;

/**
 * Every stat card in one pass over the table — a single round-trip however
 * many cards a counsellor has switched on, so the choice costs nothing.
 */
export async function leadStats(viewerId: string): Promise<LeadStats> {
  const today = istDayStart()!;
  const tomorrow = new Date(today.getTime() + DAY_MS);
  const weekAgo = new Date(today.getTime() - 6 * DAY_MS);
  const open = Prisma.join([...OPEN_LEAD_STAGES]);
  const worked = Prisma.join(
    OPEN_LEAD_STAGES.filter((s) => s !== "FRESH_LEAD"),
  );
  const interested = Prisma.join([...INTERESTED_LEAD_STAGES]);

  // `Lead` is a reserved word in MySQL 8 / TiDB — keep it backticked.
  const [row] = await prisma.$queryRaw<Record<LeadStatCard, unknown>[]>`
    SELECT
      COUNT(*) AS total,
      SUM(stage = 'FRESH_LEAD') AS fresh,
      SUM(stage IN (${worked})) AS inProgress,
      SUM(stage IN (${interested})) AS interested,
      SUM(stage = 'CONVERTED') AS converted,
      SUM(stage IN ('NOT_INTERESTED', 'INVALID_LEAD')) AS notInterested,
      SUM(stage IN (${open}) AND followUpDate >= ${today} AND followUpDate < ${tomorrow}) AS followUpsToday,
      SUM(stage IN (${open}) AND followUpDate < ${today}) AS overdue,
      SUM(stage IN (${open}) AND visitDate >= ${today} AND visitDate < ${tomorrow}) AS visitsToday,
      SUM(stage IN (${open}) AND quality = 'HOT') AS hot,
      SUM(assignedToId IS NULL) AS unassigned,
      SUM(assignedToId = ${viewerId}) AS mine,
      SUM(leadDate >= ${weekAgo}) AS receivedThisWeek
    FROM \`Lead\`
  `;
  // SUM() comes back as a DECIMAL (NULL on an empty table), COUNT() as a
  // BIGINT — both read cleanly through their string form.
  const n = (v: unknown) => Number(String(v ?? 0)) || 0;
  return {
    total: n(row?.total),
    fresh: n(row?.fresh),
    inProgress: n(row?.inProgress),
    interested: n(row?.interested),
    converted: n(row?.converted),
    notInterested: n(row?.notInterested),
    followUpsToday: n(row?.followUpsToday),
    overdue: n(row?.overdue),
    visitsToday: n(row?.visitsToday),
    hot: n(row?.hot),
    unassigned: n(row?.unassigned),
    mine: n(row?.mine),
    receivedThisWeek: n(row?.receivedThisWeek),
  };
}

export async function getLeadDetail(id: string) {
  const l = await prisma.lead.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true } },
      course: { select: { id: true, title: true } },
      followUps: {
        orderBy: { createdAt: "desc" },
        include: { createdBy: { select: { name: true, avatarUrl: true } } },
      },
      documents: { orderBy: { createdAt: "desc" } },
      contacts: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { user: { select: { name: true, avatarUrl: true } } },
      },
    },
  });
  if (!l) throw AppError.notFound("Lead not found.");

  return {
    id: l.id,
    leadNo: l.leadNo,
    leadDate: l.leadDate.toISOString(),
    name: l.name,
    email: l.email,
    phone: l.phone,
    whatsapp: l.whatsapp,
    courseId: l.courseId,
    courseTitle: l.course?.title ?? null,
    courseInterest: l.courseInterest,
    whyThisCourse: l.whyThisCourse,
    source: l.source,
    stage: l.stage,
    subStatus: l.subStatus,
    quality: l.quality,
    leadScore: l.leadScore,
    classMode: l.classMode,
    qualification: l.qualification,
    jobStatus: l.jobStatus,
    experiencedIn: l.experiencedIn,
    address: l.address,
    expectedVisit: l.expectedVisit,
    visitDate: l.visitDate?.toISOString() ?? null,
    visitTime: l.visitTime,
    followUpDate: l.followUpDate?.toISOString() ?? null,
    followUpTime: l.followUpTime,
    message: l.message,
    feesOffered: money(l.feesOffered),
    finalFees: money(l.finalFees),
    emiCount: l.emiCount,
    assignedTo: l.assignedTo,
    lastRemindedAt: l.lastRemindedAt?.toISOString() ?? null,
    createdAt: l.createdAt.toISOString(),
    documents: l.documents.map((d) => ({
      id: d.id,
      name: d.name,
      url: d.url,
      mime: d.mime,
      size: d.size,
      createdAt: d.createdAt.toISOString(),
    })),
    followUps: l.followUps.map((f) => ({
      id: f.id,
      note: f.note,
      stage: f.stage,
      subStatus: f.subStatus,
      // The counsellor who wrote the remark — never the lead.
      authorName: f.createdBy.name,
      authorAvatar: f.createdBy.avatarUrl,
      nextFollowUpDate: f.nextFollowUpDate?.toISOString() ?? null,
      nextFollowUpTime: f.nextFollowUpTime,
      createdAt: f.createdAt.toISOString(),
    })),
    contacts: l.contacts.map((c) => ({
      id: c.id,
      channel: c.channel,
      target: c.target,
      agentName: c.user.name,
      agentAvatar: c.user.avatarUrl,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

/**
 * Record that a counsellor reached out, and hand back the link their device
 * should open.
 *
 * The log is written first and the browser navigates afterwards: the platform
 * never learns whether the call connected, so the attempt is the only thing it
 * can honestly report, and losing it because a `tel:` handoff swallowed the
 * request would defeat the point.
 */
export async function logLeadContact(
  leadId: string,
  userId: string,
  channel: LeadContactChannel,
): Promise<{ channel: LeadContactChannel; target: string; href: string }> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { phone: true, whatsapp: true },
  });
  if (!lead) throw AppError.notFound("Lead not found.");

  const target = contactNumber(lead, channel);
  await prisma.leadContact.create({
    data: { leadId, userId, channel, target },
  });

  return { channel, target, href: contactHref(target, channel) };
}

/** The people who work leads: sales agents, admins and super admins. */
const ASSIGNEE_ROLES: Role[] = [
  ROLES.SALES_AGENT,
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN,
];

export interface LeadAssignee {
  id: string;
  name: string;
  role: Role;
}

/**
 * Everyone a lead can be assigned to (and filtered by). Primary role only, and
 * active accounts only — a suspended counsellor shouldn't be handed new leads.
 */
export async function listAssignees(): Promise<LeadAssignee[]> {
  const rows = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      role: { slug: { in: ASSIGNEE_ROLES } },
    },
    select: { id: true, name: true, role: { select: { slug: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role.slug as Role,
  }));
}

/** Courses for the enquiry dropdown. */
export async function listLeadCourses() {
  return prisma.course.findMany({
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
}

// ── CSV export / import ──────────────────────────────────────────────────────

/**
 * Column order for both directions. Export writes these headers and import
 * reads them, so a counsellor can export, edit in Excel and import straight
 * back. `Lead No.` and `Lead Upload Date` are echoed on export but ignored on
 * import — numbers are always allocated by us, and the upload date is when a
 * row entered this system, which an import stamps for itself.
 */
const CSV_COLUMNS = [
  "Lead No.",
  "Date of Lead Received",
  "Lead Upload Date",
  "Lead Source",
  "Lead Quality",
  "Lead Score",
  "Name",
  "Number",
  "WhatsApp",
  "Email",
  "Course",
  "Why this course",
  "Stage",
  "Status",
  "Qualification",
  "Job Status",
  "Experienced in",
  "Address",
  "Class Mode",
  "Expected visit",
  "Visit date",
  "Visit time",
  "Follow-up date",
  "Follow-up time",
  "Notes",
  "Fees Offered",
  "Final Fees",
  "No. of EMI",
  "Assigned to",
  "Documents",
] as const;

export const LEAD_CSV_HEADERS: readonly string[] = CSV_COLUMNS;

const day = istDay;

/** The list's current filters and sort, with the columns import accepts. */
export async function leadsForExport(q: LeadFilters) {
  const where = buildWhere(q);
  const rows = await prisma.lead.findMany({
    where,
    orderBy: orderFor(q.sort),
    take: 5000,
    include: {
      assignedTo: { select: { name: true } },
      course: { select: { title: true } },
      _count: { select: { documents: true } },
    },
  });

  const data = rows.map((l) => [
    l.leadNo ?? "",
    day(l.leadDate),
    istDateTime(l.createdAt),
    LEAD_SOURCE_LABELS[l.source as LeadSource] ?? l.source,
    l.quality
      ? (LEAD_QUALITY_LABELS[l.quality as LeadQuality] ?? l.quality)
      : "",
    l.leadScore ?? "",
    l.name,
    l.phone,
    l.whatsapp ?? "",
    l.email ?? "",
    l.course?.title ?? l.courseInterest ?? "",
    l.whyThisCourse ?? "",
    LEAD_STAGE_LABELS[l.stage as LeadStage] ?? l.stage,
    l.subStatus ?? "",
    l.qualification ?? "",
    l.jobStatus ?? "",
    l.experiencedIn ?? "",
    l.address ?? "",
    l.classMode
      ? (LEAD_CLASS_MODE_LABELS[l.classMode as LeadClassMode] ?? l.classMode)
      : "",
    l.expectedVisit ?? "",
    day(l.visitDate),
    l.visitTime ?? "",
    day(l.followUpDate),
    l.followUpTime ?? "",
    l.message ?? "",
    money(l.feesOffered) ?? "",
    money(l.finalFees) ?? "",
    l.emiCount ?? "",
    l.assignedTo?.name ?? "",
    l._count.documents,
  ]);

  return { headers: [...CSV_COLUMNS], data };
}

/** A blank sheet with the headers filled in, for "Download template". */
export function leadImportTemplate(): { headers: string[]; data: string[][] } {
  return {
    headers: [...CSV_COLUMNS],
    data: [
      [
        "",
        istDay(new Date()),
        "",
        "Manual",
        "Hot",
        "80",
        "Jitendra Kumar",
        "9876543210",
        "9876543210",
        "jitendra@example.com",
        "Full Stack Development",
        "Career switch to IT",
        "Fresh Lead",
        "New Lead",
        "B.Tech",
        "Fresher",
        "",
        "Sector 62, Noida",
        "Offline",
        "This Saturday",
        "",
        "16:30",
        "2026-09-01",
        "11:00",
        "Walked in after a Google search",
        "35000",
        "",
        "3",
        "",
        "",
      ],
    ],
  };
}

/** Header aliases → our field key. Compared case- and punctuation-insensitively. */
const IMPORT_ALIASES: Record<string, string[]> = {
  leadDate: [
    "date of lead received",
    "lead received date",
    "lead received",
    "date received",
    "received date",
    "lead date",
    "date",
    "enquiry date",
    "created",
  ],
  source: ["lead source", "source"],
  quality: ["lead quality", "quality"],
  leadScore: ["lead score", "score"],
  name: ["name", "full name", "student name", "lead name"],
  phone: [
    "number",
    "phone",
    "mobile",
    "mobile number",
    "contact",
    "contact number",
    "phone number",
  ],
  whatsapp: ["whatsapp", "whatsapp number", "whats app", "wa number"],
  email: ["email", "email id", "email address"],
  course: ["course", "course interest", "interest", "course name"],
  whyThisCourse: ["why this course", "why course", "reason"],
  stage: ["stage", "lead stage", "lead status"],
  subStatus: ["status", "sub status", "sub-status"],
  qualification: ["qualification", "education"],
  jobStatus: ["job status", "employment", "employment status"],
  experiencedIn: ["experienced in", "experience", "experience in"],
  address: ["address", "location", "city"],
  classMode: ["class mode", "mode", "preferred mode"],
  expectedVisit: ["expected visit", "expected visit date", "visit expectation"],
  visitDate: ["visit date"],
  visitTime: ["visit time"],
  followUpDate: [
    "follow up date",
    "followup date",
    "next follow up",
    "next follow up date",
  ],
  followUpTime: ["follow up time", "followup time", "next follow up time"],
  message: ["notes", "note", "message", "remarks", "remark"],
  feesOffered: ["fees offered", "fee offered", "offered fees", "fees"],
  finalFees: ["final fees", "final fee"],
  emiCount: ["no. of emi", "no of emi", "emi", "emi count", "number of emi"],
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function mapHeaders(headers: string[]): Record<string, string> {
  const byField: Record<string, string> = {};
  for (const header of headers) {
    const key = norm(header);
    for (const [field, aliases] of Object.entries(IMPORT_ALIASES)) {
      if (byField[field]) continue;
      if (aliases.some((a) => norm(a) === key)) {
        byField[field] = header;
        break;
      }
    }
  }
  return byField;
}

/** Match a label ("Fresh Lead", "fresh_lead", "FRESH LEAD") back to its enum. */
function matchEnum<T extends string>(
  value: string,
  values: readonly T[],
  labels: Record<T, string>,
): T | undefined {
  const key = norm(value);
  if (!key) return undefined;
  return values.find((v) => norm(v) === key || norm(labels[v]) === key);
}

function matchSubStatus(stage: LeadStage, value: string): string | null {
  const key = norm(value);
  if (!key) return null;
  return (
    LEAD_SUB_STATUSES[stage].find((s) => norm(s) === key) ??
    value.trim().slice(0, 60)
  );
}

function parseDate(value: string): Date | undefined {
  const v = value.trim();
  if (!v) return undefined;
  // dd/mm/yyyy and dd-mm-yyyy are what Indian sheets export; ISO parses natively.
  // Both branches land on UTC midnight: `new Date(y, m, d)` would be *local*
  // midnight, which reads back a day earlier from an IST server once the value
  // is rendered as an ISO date — 25/08 exported as 2026-08-24.
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
  const d = dmy
    ? new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])))
    : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Shared with the admin form via `parseAmount`, then range-checked. */
function parseMoney(value: string): number | undefined {
  const n = parseAmount(value);
  return n !== undefined && n >= 0 && n <= 10_000_000 ? n : undefined;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

const MAX_IMPORT_ROWS = 2000;

/**
 * Bulk-load leads from a CSV. Rows that can't be read are reported by line
 * number rather than aborting the run — a 300-row sheet with two bad phone
 * numbers should import 298 leads, not nothing.
 */
export async function importLeads(
  input: ImportLeadsInput,
): Promise<ImportResult> {
  const { headers, rows } = parseCsv(input.csv);
  if (!headers.length)
    throw AppError.badRequest("That file has no header row.");

  const column = mapHeaders(headers);
  if (!column.name || !column.phone) {
    throw AppError.badRequest(
      'The sheet needs at least a "Name" and a "Number" column. Download the template to see the expected headers.',
    );
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw AppError.badRequest(
      `That file has ${rows.length} rows — import up to ${MAX_IMPORT_ROWS} at a time.`,
    );
  }

  const errors: ImportResult["errors"] = [];
  const parsed: (Prisma.LeadUncheckedCreateInput & { phoneKey: string })[] = [];
  const seenInFile = new Set<string>();

  const value = (row: Record<string, string>, field: string) =>
    (column[field] ? (row[column[field]] ?? "") : "").trim();

  const [courses, staff] = await Promise.all([
    prisma.course.findMany({ select: { id: true, title: true } }),
    // Instructors stay matchable alongside the assignee roles: leads handed to
    // one before sales agents existed must survive an export → import.
    prisma.user.findMany({
      where: {
        role: { slug: { in: [...ASSIGNEE_ROLES, ROLES.INSTRUCTOR] } },
      },
      select: { id: true, name: true },
    }),
  ]);
  const courseByTitle = new Map(courses.map((c) => [norm(c.title), c.id]));
  const staffByName = new Map(staff.map((s) => [norm(s.name), s.id]));
  const assignedHeader = headers.find((h) => norm(h) === "assigned to");

  rows.forEach((row, index) => {
    const line = index + 2; // +1 for the header, +1 for 1-based line numbers
    const name = value(row, "name");
    const phone = value(row, "phone").replace(/\s+/g, "");

    if (!name || name.length < 2) {
      errors.push({ row: line, message: "Name is missing." });
      return;
    }
    if (phone.replace(/\D/g, "").length < 6) {
      errors.push({
        row: line,
        message: `"${name}" has no usable phone number.`,
      });
      return;
    }

    const phoneKey = phoneKeyOf(phone);
    if (input.skipDuplicatePhones && seenInFile.has(phoneKey)) {
      errors.push({
        row: line,
        message: `"${name}" repeats a number already in this file.`,
      });
      return;
    }
    seenInFile.add(phoneKey);

    const stage =
      matchEnum(value(row, "stage"), LEAD_STAGES, LEAD_STAGE_LABELS) ??
      ("FRESH_LEAD" as LeadStage);
    const courseText = value(row, "course");
    const courseId = courseText
      ? (courseByTitle.get(norm(courseText)) ?? null)
      : null;
    const assignedName = assignedHeader
      ? (row[assignedHeader] ?? "").trim()
      : "";

    parsed.push({
      phoneKey,
      leadNo: "", // allocated below, once we know how many survived
      name: name.slice(0, 80),
      phone: phone.slice(0, 20),
      whatsapp: value(row, "whatsapp").replace(/\s+/g, "").slice(0, 20) || null,
      email: value(row, "email").slice(0, 120) || null,
      leadDate: parseDate(value(row, "leadDate")) ?? new Date(),
      source:
        matchEnum(value(row, "source"), LEAD_SOURCES, LEAD_SOURCE_LABELS) ??
        input.source,
      quality:
        matchEnum(value(row, "quality"), LEAD_QUALITIES, LEAD_QUALITY_LABELS) ??
        null,
      leadScore: (() => {
        const n = Math.trunc(Number(value(row, "leadScore")));
        return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
      })(),
      courseId,
      courseInterest: courseId ? null : courseText.slice(0, 120) || null,
      whyThisCourse: value(row, "whyThisCourse").slice(0, 1000) || null,
      stage,
      status: LEGACY_STATUS[stage],
      subStatus: matchSubStatus(stage, value(row, "subStatus")),
      classMode:
        matchEnum(
          value(row, "classMode"),
          LEAD_CLASS_MODES,
          LEAD_CLASS_MODE_LABELS,
        ) ?? null,
      qualification: value(row, "qualification").slice(0, 120) || null,
      jobStatus: value(row, "jobStatus").slice(0, 120) || null,
      experiencedIn: value(row, "experiencedIn").slice(0, 160) || null,
      address: value(row, "address").slice(0, 500) || null,
      expectedVisit: value(row, "expectedVisit").slice(0, 160) || null,
      visitDate: parseDate(value(row, "visitDate")) ?? null,
      visitTime: value(row, "visitTime").slice(0, 12) || null,
      followUpDate: parseDate(value(row, "followUpDate")) ?? null,
      followUpTime: value(row, "followUpTime").slice(0, 12) || null,
      message: value(row, "message").slice(0, 2000) || null,
      feesOffered: parseMoney(value(row, "feesOffered")) ?? null,
      finalFees: parseMoney(value(row, "finalFees")) ?? null,
      emiCount: (() => {
        const n = Math.trunc(Number(value(row, "emiCount")));
        return Number.isFinite(n) && n > 0 && n <= 60 ? n : null;
      })(),
      assignedToId: assignedName
        ? (staffByName.get(norm(assignedName)) ?? null)
        : null,
    });
  });

  let candidates = parsed;
  let skipped = 0;

  if (input.skipDuplicatePhones && candidates.length) {
    // Compared on the last 10 digits, not the raw string: the same person is
    // written "9812300011", "09812300011" and "+91 9812300011" across sheets,
    // and an `in` on the literal text would let every variant through.
    const existing = await prisma.lead.findMany({
      take: MAX_DUPLICATE_SCAN,
      select: { phone: true },
    });
    const known = new Set(existing.map((e) => phoneKeyOf(e.phone)));
    const kept = candidates.filter((c) => !known.has(c.phoneKey));
    skipped = candidates.length - kept.length;
    candidates = kept;
  }

  if (!candidates.length) {
    return { imported: 0, skipped, errors };
  }

  let seq = await nextLeadSeq();
  const data = candidates.map((candidate) => {
    const lead = { ...candidate, leadNo: leadNoFor(seq++) };
    delete (lead as Partial<typeof candidate>).phoneKey; // in-memory dedupe key only
    return lead as Prisma.LeadCreateManyInput;
  });

  const { count } = await prisma.lead.createMany({
    data,
    skipDuplicates: true,
  });
  return { imported: count, skipped, errors };
}

// ── Duplicates ───────────────────────────────────────────────────────────────

/**
 * Two leads are the same person if they share a phone number or an email. The
 * scan runs in JS over three light columns rather than in SQL, which keeps it
 * off TiDB-specific regex functions and gives the same answer either way.
 */
export interface DuplicateLead {
  id: string;
  leadNo: string | null;
  name: string;
  phone: string;
  email: string | null;
  stage: string;
  subStatus: string | null;
  source: string;
  leadDate: string;
  followUps: number;
  documents: number;
}

export interface DuplicateGroup {
  key: string;
  matchedOn: "phone" | "email";
  leads: DuplicateLead[];
}

export async function findDuplicateLeads(): Promise<{
  groups: DuplicateGroup[];
  scanned: number;
  duplicates: number;
}> {
  const all = await prisma.lead.findMany({
    take: MAX_DUPLICATE_SCAN,
    select: { id: true, phone: true, email: true },
  });

  const byPhone = new Map<string, string[]>();
  const byEmail = new Map<string, string[]>();
  for (const lead of all) {
    const phone = phoneKeyOf(lead.phone);
    if (phone.length >= 6)
      byPhone.set(phone, [...(byPhone.get(phone) ?? []), lead.id]);
    const email = lead.email?.trim().toLowerCase();
    if (email) byEmail.set(email, [...(byEmail.get(email) ?? []), lead.id]);
  }

  const claimed = new Set<string>();
  const keys: { key: string; matchedOn: "phone" | "email"; ids: string[] }[] =
    [];

  for (const [key, ids] of byPhone) {
    if (ids.length < 2) continue;
    keys.push({ key, matchedOn: "phone", ids });
    ids.forEach((id) => claimed.add(id));
  }
  for (const [key, ids] of byEmail) {
    // A pair already caught by phone doesn't need reporting twice.
    if (ids.length < 2 || ids.every((id) => claimed.has(id))) continue;
    keys.push({ key, matchedOn: "email", ids });
    ids.forEach((id) => claimed.add(id));
  }

  if (!keys.length) return { groups: [], scanned: all.length, duplicates: 0 };

  const rows = await prisma.lead.findMany({
    where: { id: { in: [...claimed] } },
    orderBy: { leadDate: "asc" },
    select: {
      id: true,
      leadNo: true,
      name: true,
      phone: true,
      email: true,
      stage: true,
      subStatus: true,
      source: true,
      leadDate: true,
      _count: { select: { followUps: true, documents: true } },
    },
  });
  const byId = new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        leadNo: r.leadNo,
        name: r.name,
        phone: r.phone,
        email: r.email,
        stage: r.stage as string,
        subStatus: r.subStatus,
        source: r.source as string,
        leadDate: r.leadDate.toISOString(),
        followUps: r._count.followUps,
        documents: r._count.documents,
      },
    ]),
  );

  const groups = keys
    .map((g) => ({
      key: g.key,
      matchedOn: g.matchedOn,
      // Oldest first: that's the row the "keep the original" default points at.
      leads: g.ids
        .map((id) => byId.get(id))
        .filter((l): l is DuplicateLead => Boolean(l))
        .sort((a, b) => a.leadDate.localeCompare(b.leadDate)),
    }))
    .filter((g) => g.leads.length > 1)
    .sort((a, b) => b.leads.length - a.leads.length);

  return {
    groups,
    scanned: all.length,
    duplicates: groups.reduce((n, g) => n + g.leads.length - 1, 0),
  };
}

/**
 * Delete the leads the admin picked. Follow-ups and documents go with them —
 * relationMode = "prisma" means cascades are ours to perform, not the DB's.
 */
export async function removeDuplicateLeads(
  input: RemoveDuplicatesInput,
): Promise<{ removed: number }> {
  const ids = [...new Set(input.ids)];
  if (!ids.length) return { removed: 0 };

  const existing = await prisma.lead.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  const found = existing.map((l) => l.id);
  if (!found.length) return { removed: 0 };

  await prisma.leadFollowUp.deleteMany({ where: { leadId: { in: found } } });
  await prisma.leadDocument.deleteMany({ where: { leadId: { in: found } } });
  const { count } = await prisma.lead.deleteMany({
    where: { id: { in: found } },
  });
  return { removed: count };
}

// ── Reports ──────────────────────────────────────────────────────────────────

const label = <T extends string>(
  value: string | null,
  labels: Record<T, string>,
) => (value ? (labels[value as T] ?? value) : "—");

const DUE_LABELS: Record<string, string> = {
  overdue: "Overdue",
  today: "Due today",
  week: "Next 7 days",
};

/** "1 Sep 2026" for a `YYYY-MM-DD` filter value. */
function filterDay(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return value;
  // A local-midnight Date prints its own fields whatever the server's zone.
  return format(
    new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
    "d MMM yyyy",
  );
}

function dayRange(from?: string, to?: string): string | null {
  if (from && to) return `${filterDay(from)} – ${filterDay(to)}`;
  if (from) return `from ${filterDay(from)}`;
  if (to) return `up to ${filterDay(to)}`;
  return null;
}

/**
 * The filters behind a download, in words — printed at the top of the report
 * so a sheet passed round the office says which leads it counts.
 */
async function describeLeadFilters(q: LeadFilters): Promise<string[]> {
  const needsAssignee =
    q.assignedToId && q.assignedToId !== "unassigned" ? q.assignedToId : null;
  const assigneeId = needsAssignee === "me" ? q.viewerId : needsAssignee;
  const [course, assignee] = await Promise.all([
    q.courseId
      ? prisma.course.findUnique({
          where: { id: q.courseId },
          select: { title: true },
        })
      : null,
    assigneeId
      ? prisma.user.findUnique({
          where: { id: assigneeId },
          select: { name: true },
        })
      : null,
  ]);

  const parts: string[] = [];
  if (q.search) parts.push(`Search: "${q.search}"`);
  if (q.stage) parts.push(`Stage: ${label(q.stage, LEAD_STAGE_LABELS)}`);
  if (q.subStatus) parts.push(`Status: ${q.subStatus}`);
  if (q.source) parts.push(`Source: ${label(q.source, LEAD_SOURCE_LABELS)}`);
  if (q.classMode)
    parts.push(`Class mode: ${label(q.classMode, LEAD_CLASS_MODE_LABELS)}`);
  if (q.courseId) parts.push(`Course: ${course?.title ?? "(removed course)"}`);
  if (q.assignedToId) {
    parts.push(
      `Assigned to: ${
        q.assignedToId === "unassigned"
          ? "Unassigned"
          : `${assignee?.name ?? "(unknown)"}${q.assignedToId === "me" ? " (me)" : ""}`
      }`,
    );
  }
  if (q.quality)
    parts.push(`Quality: ${label(q.quality, LEAD_QUALITY_LABELS)}`);
  if (q.minScore) parts.push(`Lead score ≥ ${q.minScore}`);
  if (q.due) parts.push(`Follow-up: ${DUE_LABELS[q.due] ?? q.due}`);
  const received = dayRange(q.from, q.to);
  if (received) parts.push(`Lead received ${received}`);
  const uploaded = dayRange(q.uploadedFrom, q.uploadedTo);
  if (uploaded) parts.push(`Lead uploaded ${uploaded}`);
  return parts;
}

/**
 * A summary report over whatever the list is currently filtered to: totals,
 * then a breakdown by stage, status, quality, source, class mode, course and
 * counsellor. Rendered as CSV so it opens in Excel like every other download.
 */
export async function leadReport(
  q: LeadFilters,
): Promise<{ headers: string[]; data: (string | number)[][] }> {
  const where = buildWhere(q);

  const [
    filters,
    [total, byStage, bySubStatus, byQuality, bySource, byMode, rows],
  ] = await Promise.all([
    describeLeadFilters(q),
    Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.groupBy({ by: ["stage"], where, _count: { _all: true } }),
      prisma.lead.groupBy({ by: ["subStatus"], where, _count: { _all: true } }),
      prisma.lead.groupBy({ by: ["quality"], where, _count: { _all: true } }),
      prisma.lead.groupBy({ by: ["source"], where, _count: { _all: true } }),
      prisma.lead.groupBy({ by: ["classMode"], where, _count: { _all: true } }),
      prisma.lead.findMany({
        where,
        take: 5000,
        select: {
          finalFees: true,
          feesOffered: true,
          stage: true,
          course: { select: { title: true } },
          courseInterest: true,
          assignedTo: { select: { name: true } },
        },
      }),
    ]),
  ]);

  const pct = (n: number) =>
    total ? `${((n / total) * 100).toFixed(1)}%` : "0%";
  const data: (string | number)[][] = [];
  const section = (title: string) => {
    if (data.length) data.push(["", "", ""]);
    data.push([title, "Leads", "Share"]);
  };

  const converted =
    byStage.find((g) => g.stage === "CONVERTED")?._count._all ?? 0;
  const revenue = rows
    .filter((r) => r.stage === "CONVERTED")
    .reduce(
      (sum, r) => sum + (money(r.finalFees) ?? money(r.feesOffered) ?? 0),
      0,
    );

  data.push([
    "Filters applied",
    filters.length ? filters.join(" · ") : "None — every lead",
    "",
  ]);
  data.push(["Generated", `${istDateTime(new Date())} IST`, ""]);
  data.push(["", "", ""]);

  data.push(["Total leads", total, "100%"]);
  data.push(["Converted", converted, pct(converted)]);
  data.push([
    "Confirmed fees from converted leads",
    `₹${revenue.toLocaleString("en-IN")}`,
    "",
  ]);

  section("By stage");
  for (const stage of LEAD_STAGES) {
    const n = byStage.find((g) => g.stage === stage)?._count._all ?? 0;
    data.push([LEAD_STAGE_LABELS[stage], n, pct(n)]);
  }

  section("By status");
  for (const g of [...bySubStatus].sort(
    (a, b) => b._count._all - a._count._all,
  )) {
    data.push([
      g.subStatus ?? "— no status —",
      g._count._all,
      pct(g._count._all),
    ]);
  }

  section("By lead quality");
  for (const g of byQuality) {
    data.push([
      label(g.quality, LEAD_QUALITY_LABELS),
      g._count._all,
      pct(g._count._all),
    ]);
  }

  section("By source");
  for (const g of bySource) {
    data.push([
      label(g.source, LEAD_SOURCE_LABELS),
      g._count._all,
      pct(g._count._all),
    ]);
  }

  section("By class mode");
  for (const g of byMode) {
    data.push([
      label(g.classMode, LEAD_CLASS_MODE_LABELS),
      g._count._all,
      pct(g._count._all),
    ]);
  }

  const tally = (pick: (r: (typeof rows)[number]) => string) => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(pick(r), (counts.get(pick(r)) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  };

  section("By course");
  for (const [name, n] of tally(
    (r) => r.course?.title ?? r.courseInterest ?? "— not decided —",
  )) {
    data.push([name, n, pct(n)]);
  }

  section("By counsellor");
  for (const [name, n] of tally(
    (r) => r.assignedTo?.name ?? "— unassigned —",
  )) {
    data.push([name, n, pct(n)]);
  }

  if (rows.length < total) {
    data.push(["", "", ""]);
    data.push([
      `Course and counsellor rows cover the first ${rows.length} of ${total} leads.`,
      "",
      "",
    ]);
  }

  return { headers: ["Lead report", "Leads", "Share"], data };
}
