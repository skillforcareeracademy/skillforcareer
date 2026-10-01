import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/api/errors";
import { ROLES } from "@/config/roles";
import { sendMail } from "@/lib/mail/mailer";
import { broadcastEmail } from "@/lib/mail/templates/broadcast";
import { mailBrand } from "./mail-brand";
import { notify } from "./notification-service";
import {
  AUDIENCES_NEEDING_TARGETS,
  INSTRUCTOR_AUDIENCES,
  type BroadcastAudience,
  type PreviewAudienceInput,
  type SendBroadcastInput,
} from "@/lib/validations/broadcast";

/**
 * Broadcasting an announcement to a chosen audience.
 *
 * The academy's list of audiences — "batch wise, student wise, all student,
 * only instructor, notification for both, sales agent, placement partner,
 * course wise, hiring partner, candidate for placement … and more scenarios" —
 * collapses to two questions: *which platform users*, and *which outside
 * contacts*. Roles carry most of it: roles are rows an admin can add to, so
 * "all students", "instructors only", "both" and any role invented later are
 * the same audience with a different pick, and "more scenarios" needs no code.
 *
 * Everything that leaves the building is resolved here, once, so the preview
 * count and the actual send can never disagree.
 */

/** Who is sending, and therefore what they are allowed to reach. */
export interface Sender {
  id: string;
  /** Staff reach everyone; an instructor reaches their own teaching only. */
  staff: boolean;
}

/** A recipient with no account — a partner company or an applicant. */
interface Contact {
  email: string;
  name: string;
}

export interface ResolvedAudience {
  /** People with accounts: they get the bell, and email if asked for. */
  userIds: string[];
  /** Outside contacts: email only, because they have no dashboard. */
  contacts: Contact[];
  total: number;
}

// ── What an instructor is allowed to touch ───────────────────────────────────

/** Batches a given instructor teaches: lead teacher, associate, or course owner. */
function ownBatchWhere(instructorId: string) {
  return {
    OR: [
      { instructorId },
      { course: { instructorId } },
      { associates: { some: { userId: instructorId } } },
    ],
  };
}

async function ownBatchIds(instructorId: string): Promise<string[]> {
  const rows = await prisma.batch.findMany({
    where: ownBatchWhere(instructorId),
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function ownCourseIds(instructorId: string): Promise<string[]> {
  const rows = await prisma.course.findMany({
    where: { instructorId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Narrow the ids an instructor picked to the ones that are actually theirs.
 * Silently dropping the rest is deliberate: the composer only ever offers them
 * their own, so anything else arrived by hand.
 */
async function allowedTargets(
  audience: BroadcastAudience,
  targetIds: string[],
  sender: Sender,
): Promise<string[]> {
  if (sender.staff) return targetIds;
  if (!INSTRUCTOR_AUDIENCES.includes(audience)) {
    throw AppError.forbidden("You can message your own batches, courses and learners.");
  }
  if (audience === "BATCHES") {
    const mine = new Set(await ownBatchIds(sender.id));
    return targetIds.filter((id) => mine.has(id));
  }
  if (audience === "COURSES") {
    const mine = new Set(await ownCourseIds(sender.id));
    return targetIds.filter((id) => mine.has(id));
  }
  // USERS: only people enrolled on something this instructor teaches.
  const [batchIds, courseIds] = await Promise.all([
    ownBatchIds(sender.id),
    ownCourseIds(sender.id),
  ]);
  const reachable = await prisma.enrollment.findMany({
    where: {
      userId: { in: targetIds },
      OR: [{ batchId: { in: batchIds } }, { courseId: { in: courseIds } }],
    },
    select: { userId: true },
  });
  const mine = new Set(reachable.map((r) => r.userId));
  return targetIds.filter((id) => mine.has(id));
}

// ── Resolving an audience ────────────────────────────────────────────────────

/**
 * Who may be written to.
 *
 * `PENDING` counts: that is someone who registered and was enrolled but has not
 * finished verifying their email, and dropping them would mean a learner who
 * paid for a seat silently misses "class has moved to 4pm" — the very thing
 * this feature exists for. The batch-add email already reaches them for the
 * same reason. Accounts deliberately switched off do not count.
 */
async function usersWhere(where: object): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { ...where, status: { in: ["ACTIVE", "PENDING"] } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function enrolledUserIds(key: "batchId" | "courseId", ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.enrollment.findMany({
    where: { [key]: { in: ids }, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

/**
 * Turn an audience plus its picks into the actual recipients.
 *
 * A role match looks at the person's main role *and* their extra ones: an
 * instructor who is also enrolled as a student holds both, and "only
 * instructors" has to reach them.
 */
export async function resolveAudience(
  input: PreviewAudienceInput,
  sender: Sender,
): Promise<ResolvedAudience> {
  const targetIds = await allowedTargets(input.audience, input.targetIds, sender);

  if (AUDIENCES_NEEDING_TARGETS.includes(input.audience) && targetIds.length === 0) {
    return { userIds: [], contacts: [], total: 0 };
  }

  const none: Contact[] = [];

  switch (input.audience) {
    case "ALL_USERS":
      return done(await usersWhere({}), none);

    case "ROLES":
      return done(
        await usersWhere({
          OR: [
            { roleId: { in: targetIds } },
            { extraRoles: { some: { roleId: { in: targetIds } } } },
          ],
        }),
        none,
      );

    case "BATCHES": {
      const [enrolled, teaching] = await Promise.all([
        enrolledUserIds("batchId", targetIds),
        // The people who run the batch should hear a schedule change too.
        prisma.batch.findMany({
          where: { id: { in: targetIds } },
          select: { instructorId: true, associates: { select: { userId: true } } },
        }),
      ]);
      const staffIds = teaching.flatMap((b) => [
        ...(b.instructorId ? [b.instructorId] : []),
        ...b.associates.map((a) => a.userId),
      ]);
      return done(await usersWhere({ id: { in: [...enrolled, ...staffIds] } }), none);
    }

    case "COURSES":
      return done(
        await usersWhere({ id: { in: await enrolledUserIds("courseId", targetIds) } }),
        none,
      );

    case "USERS":
      return done(await usersWhere({ id: { in: targetIds } }), none);

    case "PLACEMENT_PARTNERS":
      return done([], await partnerContacts("placement"));

    case "HIRING_PARTNERS":
      return done([], await partnerContacts("hiring"));

    case "PLACEMENT_CANDIDATES":
      return candidateAudience(targetIds);

    default:
      return { userIds: [], contacts: [], total: 0 };
  }
}

function done(userIds: string[], contacts: Contact[]): ResolvedAudience {
  const ids = [...new Set(userIds)].filter(Boolean);
  const seen = new Set<string>();
  const unique = contacts.filter((c) => {
    const key = c.email.toLowerCase();
    if (!c.email || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { userIds: ids, contacts: unique, total: ids.length + unique.length };
}

async function partnerContacts(kind: "placement" | "hiring"): Promise<Contact[]> {
  const where = { isActive: true, email: { not: null } };
  const rows =
    kind === "placement"
      ? await prisma.placementPartner.findMany({
          where,
          select: { name: true, email: true, contactPerson: true },
        })
      : await prisma.hiringPartner.findMany({
          where,
          select: { name: true, email: true, contactPerson: true },
        });
  return rows
    .filter((r): r is typeof r & { email: string } => Boolean(r.email))
    .map((r) => ({ email: r.email, name: r.contactPerson || r.name }));
}

/**
 * Candidates on the placement desk. `targetIds` holds the statuses picked, or
 * nothing for every candidate. One who already has an account gets the bell as
 * well as the email; the rest only ever applied through the careers page.
 */
async function candidateAudience(statuses: string[]): Promise<ResolvedAudience> {
  const rows = await prisma.jobApplication.findMany({
    where: statuses.length > 0 ? { status: { in: statuses as never[] } } : {},
    select: { name: true, email: true, userId: true },
  });

  const withAccount = rows.map((r) => r.userId).filter((id): id is string => Boolean(id));
  const liveAccounts = new Set(await usersWhere({ id: { in: withAccount } }));

  const contacts = rows
    .filter((r) => !(r.userId && liveAccounts.has(r.userId)))
    .map((r) => ({ email: r.email, name: r.name }));

  return done([...liveAccounts], contacts);
}

// ── Sending ──────────────────────────────────────────────────────────────────

/** A few at a time: the SMTP pool holds three connections. */
const SEND_CONCURRENCY = 3;

export interface BroadcastResult {
  id: string;
  recipientCount: number;
  notifiedCount: number;
  /** How many emails were queued — they go out after the response. */
  queuedEmails: number;
  message: string;
}

export async function sendBroadcast(
  input: SendBroadcastInput,
  sender: Sender,
): Promise<BroadcastResult> {
  const audience = await resolveAudience(
    { audience: input.audience, targetIds: input.targetIds },
    sender,
  );

  if (audience.total === 0) {
    throw AppError.badRequest("Nobody matches that audience, so there is no one to send to.");
  }

  const notifiedCount = input.toDashboard
    ? await notify({
        userIds: audience.userIds,
        type: "ANNOUNCEMENT",
        title: input.title,
        message: input.message,
        actionUrl: input.actionUrl || undefined,
      })
    : 0;

  const emailTargets = input.toEmail ? audience.userIds.length + audience.contacts.length : 0;

  const row = await prisma.broadcast.create({
    data: {
      title: input.title,
      message: input.message,
      actionUrl: input.actionUrl || null,
      audience: input.audience,
      targetIds: input.targetIds,
      toDashboard: input.toDashboard,
      toEmail: input.toEmail,
      recipientCount: audience.total,
      notifiedCount,
      // Filled in once the mail actually goes; the response must not wait.
      emailedCount: 0,
      sentById: sender.id,
    },
    select: { id: true },
  });

  if (input.toEmail) queueEmails(row.id, input, audience);

  return {
    id: row.id,
    recipientCount: audience.total,
    notifiedCount,
    queuedEmails: emailTargets,
    message: summarise(audience.total, notifiedCount, emailTargets),
  };
}

function summarise(total: number, notified: number, emails: number): string {
  const parts: string[] = [];
  if (notified > 0) parts.push(`${notified} on their dashboard`);
  if (emails > 0) parts.push(`${emails} by email`);
  const who = `${total} recipient${total === 1 ? "" : "s"}`;
  return parts.length > 0 ? `Sent to ${who} — ${parts.join(", ")}.` : `Sent to ${who}.`;
}

/**
 * Send the emails once the response has gone out. A broadcast to a whole course
 * is hundreds of messages, and the sender should not sit on a spinner for them.
 * Outside a request there is no `after`, so it simply runs in the background.
 */
function queueEmails(
  broadcastId: string,
  input: SendBroadcastInput,
  audience: ResolvedAudience,
): void {
  const run = () => deliverEmails(broadcastId, input, audience);
  try {
    after(run);
  } catch {
    void run();
  }
}

async function deliverEmails(
  broadcastId: string,
  input: SendBroadcastInput,
  audience: ResolvedAudience,
): Promise<void> {
  try {
    const [brand, users] = await Promise.all([
      mailBrand(),
      audience.userIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: audience.userIds } },
            select: { name: true, email: true },
          })
        : Promise.resolve([]),
    ]);

    const everyone: Contact[] = [
      ...users.map((u) => ({ email: u.email, name: u.name })),
      ...audience.contacts,
    ];

    let sent = 0;
    for (let i = 0; i < everyone.length; i += SEND_CONCURRENCY) {
      const results = await Promise.all(
        everyone.slice(i, i + SEND_CONCURRENCY).map((person) => {
          const mail = broadcastEmail({
            name: person.name,
            title: input.title,
            message: input.message,
            actionUrl: input.actionUrl,
            brand,
          });
          return sendMail({ to: person.email, ...mail });
        }),
      );
      sent += results.filter(Boolean).length;
    }

    await prisma.broadcast.update({
      where: { id: broadcastId },
      data: { emailedCount: sent },
    });
    logger.info("broadcast.emails", { broadcastId, attempted: everyone.length, sent });
  } catch (error) {
    logger.error("broadcast.emails_failed", {
      broadcastId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ── Reading back ─────────────────────────────────────────────────────────────

export interface BroadcastRow {
  id: string;
  title: string;
  message: string;
  audience: BroadcastAudience;
  toDashboard: boolean;
  toEmail: boolean;
  recipientCount: number;
  notifiedCount: number;
  emailedCount: number;
  sentBy: string;
  createdAt: string;
}

/** What has been sent. An instructor sees their own sends, staff see them all. */
export async function listBroadcasts(
  sender: Sender,
  page = 1,
  pageSize = 20,
): Promise<{ rows: BroadcastRow[]; total: number }> {
  const where = sender.staff ? {} : { sentById: sender.id };
  const [rows, total] = await Promise.all([
    prisma.broadcast.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        message: true,
        audience: true,
        toDashboard: true,
        toEmail: true,
        recipientCount: true,
        notifiedCount: true,
        emailedCount: true,
        createdAt: true,
        sentBy: { select: { name: true } },
      },
    }),
    prisma.broadcast.count({ where }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      title: r.title,
      message: r.message,
      audience: r.audience as BroadcastAudience,
      toDashboard: r.toDashboard,
      toEmail: r.toEmail,
      recipientCount: r.recipientCount,
      notifiedCount: r.notifiedCount,
      emailedCount: r.emailedCount,
      sentBy: r.sentBy.name,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
  };
}

// ── What the composer offers ─────────────────────────────────────────────────

export interface BroadcastOptions {
  audiences: BroadcastAudience[];
  roles: { id: string; name: string }[];
  batches: { id: string; name: string }[];
  courses: { id: string; name: string }[];
  candidateStatuses: string[];
}

const CANDIDATE_STATUSES = [
  "NEW",
  "SHORTLISTED",
  "REFERRED",
  "INTERVIEWING",
  "PLACED",
  "NOT_PLACED",
  "ON_HOLD",
];

/** Everything the composer needs to fill its pickers, scoped to the sender. */
export async function broadcastOptions(sender: Sender): Promise<BroadcastOptions> {
  const [roles, batches, courses] = await Promise.all([
    sender.staff
      ? prisma.role.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    prisma.batch.findMany({
      where: sender.staff ? {} : ownBatchWhere(sender.id),
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, name: true, code: true },
    }),
    prisma.course.findMany({
      where: sender.staff ? {} : { instructorId: sender.id },
      orderBy: { title: "asc" },
      take: 500,
      select: { id: true, title: true },
    }),
  ]);

  return {
    audiences: sender.staff
      ? [
          "ROLES",
          "BATCHES",
          "COURSES",
          "USERS",
          "ALL_USERS",
          "PLACEMENT_PARTNERS",
          "HIRING_PARTNERS",
          "PLACEMENT_CANDIDATES",
        ]
      : INSTRUCTOR_AUDIENCES,
    roles,
    batches: batches.map((b) => ({ id: b.id, name: b.code ? `${b.name} (${b.code})` : b.name })),
    courses: courses.map((c) => ({ id: c.id, name: c.title })),
    candidateStatuses: CANDIDATE_STATUSES,
  };
}

/**
 * People to pick from for the "chosen people" audience. An instructor only ever
 * sees their own learners.
 */
export async function broadcastPeople(sender: Sender, search: string): Promise<
  { id: string; name: string; email: string }[]
> {
  const q = search.trim();
  let scope: object = {};
  if (!sender.staff) {
    const [batchIds, courseIds] = await Promise.all([
      ownBatchIds(sender.id),
      ownCourseIds(sender.id),
    ]);
    const enrolled = await prisma.enrollment.findMany({
      where: { OR: [{ batchId: { in: batchIds } }, { courseId: { in: courseIds } }] },
      select: { userId: true },
    });
    scope = { id: { in: [...new Set(enrolled.map((e) => e.userId))] } };
  }

  const rows = await prisma.user.findMany({
    where: {
      ...scope,
      status: "ACTIVE",
      ...(q
        ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 50,
    select: { id: true, name: true, email: true },
  });
  return rows;
}

/** Staff reach everyone; everybody else is treated as an instructor. */
export function senderFrom(user: { id: string; roles: string[] }): Sender {
  return {
    id: user.id,
    staff: user.roles.some((r) => r === ROLES.SUPER_ADMIN || r === ROLES.ADMIN),
  };
}
