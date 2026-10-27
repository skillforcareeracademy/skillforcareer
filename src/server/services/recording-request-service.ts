import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { notify, notifyStaff } from "./notification-service";

/**
 * Learner requests for recordings they can't currently watch, and the staff
 * flow that shares them.
 *
 * The shape, in the client's words: a recording ends for the learner, they ask
 * "please share", and a super admin shares it — free, or for a price the admin
 * sets on the spot. A granted request is just a `RecordingAccess` row with its
 * own window, so playback stays governed by `recording-service`; this file only
 * decides *whether* that row gets written, and takes the money when it must.
 */

const DEFAULT_ACCESS_DAYS = 30;

type RequestRow = {
  id: string;
  meetingId: string;
  userId: string;
  status: string;
  note: string | null;
  price: Prisma.Decimal | null;
  accessDays: number | null;
  accessId: string | null;
  paymentId: string | null;
};

const decimal = (d: Prisma.Decimal | null): number | null =>
  d == null ? null : d.toNumber();

// ── Learner side ─────────────────────────────────────────────────────────────

export interface RequestState {
  status: "PENDING" | "DECLINED" | "AWAITING_PAYMENT" | "GRANTED";
  requestId: string;
  /** What the learner must pay, when the request is awaiting payment. */
  price: number | null;
}

/**
 * Raise a request, or reuse the one already standing. A declined request can be
 * raised again; a live one (pending / awaiting payment / granted) is returned
 * as-is so a double tap doesn't make a second row.
 */
export async function requestRecording(
  userId: string,
  meetingId: string,
  note?: string,
): Promise<RequestState> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, title: true },
  });
  if (!meeting) throw AppError.notFound("That class doesn't exist.");

  const existing = await prisma.recordingRequest.findFirst({
    where: { meetingId, userId },
    orderBy: { createdAt: "desc" },
  });

  if (existing && existing.status !== "DECLINED") {
    return toState(existing);
  }

  const row = existing
    ? await prisma.recordingRequest.update({
        where: { id: existing.id },
        data: {
          status: "PENDING",
          note: note?.trim() || existing.note,
          price: null,
          accessDays: null,
          handledById: null,
          handledAt: null,
        },
      })
    : await prisma.recordingRequest.create({
        data: { meetingId, userId, note: note?.trim() || null },
      });

  void notifyStaff({
    type: "ANNOUNCEMENT",
    title: "Recording requested",
    message: `A learner has asked for the recording of “${meeting.title}”.`,
    actionUrl: "/admin/recordings",
  });

  return toState(row);
}

/**
 * The request standing for each of these meetings, for the learner's cards.
 * Only the latest row per meeting is considered.
 */
export async function requestStatesForUser(
  userId: string,
  meetingIds: string[],
): Promise<Map<string, RequestState>> {
  const out = new Map<string, RequestState>();
  if (meetingIds.length === 0) return out;
  const rows = await prisma.recordingRequest.findMany({
    where: { userId, meetingId: { in: meetingIds } },
    orderBy: { createdAt: "desc" },
  });
  for (const r of rows) {
    // First (latest) wins per meeting.
    if (!out.has(r.meetingId)) out.set(r.meetingId, toState(r));
  }
  return out;
}

function toState(r: RequestRow): RequestState {
  return {
    status: r.status as RequestState["status"],
    requestId: r.id,
    price: decimal(r.price),
  };
}

// ── Payment context (for the checkout) ───────────────────────────────────────

export interface RecordingAccessContext {
  meetingId: string;
  title: string;
  price: number;
}

/** Validate that this request is the learner's and really awaits payment. */
export async function recordingAccessContext(
  userId: string,
  requestId: string,
): Promise<RecordingAccessContext> {
  const row = await prisma.recordingRequest.findUnique({
    where: { id: requestId },
    select: {
      userId: true,
      status: true,
      price: true,
      meetingId: true,
      meeting: { select: { title: true } },
    },
  });
  if (!row || row.userId !== userId) throw AppError.notFound("Request not found.");
  if (row.status === "GRANTED") {
    throw AppError.badRequest("You already have access to this recording.");
  }
  if (row.status !== "AWAITING_PAYMENT" || !row.price) {
    throw AppError.badRequest("This request isn't ready for payment yet.");
  }
  return {
    meetingId: row.meetingId,
    title: row.meeting.title,
    price: row.price.toNumber(),
  };
}

/**
 * Turn a paid request into access. Called from payment fulfilment, which can
 * fire twice (browser callback + webhook), so it claims the row with a
 * conditional update and only the winner writes the grant.
 */
export async function fulfillRecordingAccess(
  requestId: string,
  paymentId: string,
): Promise<void> {
  const row = await prisma.recordingRequest.findUnique({
    where: { id: requestId },
    select: { id: true, meetingId: true, userId: true, status: true, accessDays: true },
  });
  if (!row || row.status === "GRANTED") return;
  await grant(row, paymentId);
}

// ── Staff side ───────────────────────────────────────────────────────────────

export interface AdminRecordingRow {
  id: string;
  title: string;
  scheduledStart: string;
  courseTitle: string | null;
  batchName: string | null;
  hostName: string;
  published: boolean;
  hasFile: boolean;
  pendingRequests: number;
}

/** Shared: recordings matching a where clause, newest first, with request counts. */
async function recordingRows(
  where: Prisma.MeetingWhereInput,
): Promise<AdminRecordingRow[]> {
  const meetings = await prisma.meeting.findMany({
    where: { recordingUrl: { not: null }, ...where },
    orderBy: { scheduledStart: "desc" },
    take: 500,
    select: {
      id: true,
      title: true,
      scheduledStart: true,
      recordingPublished: true,
      recordingUrl: true,
      course: { select: { title: true } },
      batch: { select: { name: true } },
      host: { select: { name: true } },
    },
  });

  const pending = await prisma.recordingRequest.groupBy({
    by: ["meetingId"],
    where: { status: "PENDING", meetingId: { in: meetings.map((m) => m.id) } },
    _count: { _all: true },
  });
  const pendingByMeeting = new Map(pending.map((p) => [p.meetingId, p._count._all]));

  return meetings.map((m) => ({
    id: m.id,
    title: m.title,
    scheduledStart: m.scheduledStart.toISOString(),
    courseTitle: m.course?.title ?? null,
    batchName: m.batch?.name ?? null,
    hostName: m.host.name,
    published: m.recordingPublished,
    hasFile: Boolean(m.recordingUrl),
    pendingRequests: pendingByMeeting.get(m.id) ?? 0,
  }));
}

/**
 * Every recording, for the super-admin page — nothing here ever expires or
 * hides, which is the whole point: staff keep all recordings forever.
 */
export async function listAllRecordingsForAdmin(
  search?: string,
): Promise<AdminRecordingRow[]> {
  const q = search?.trim();
  return recordingRows(
    q
      ? {
          OR: [
            { title: { contains: q } },
            { course: { title: { contains: q } } },
            { batch: { name: { contains: q } } },
          ],
        }
      : {},
  );
}

/** One batch's recordings, for the Recordings tab on its profile. */
export async function listRecordingsForBatch(
  batchId: string,
): Promise<AdminRecordingRow[]> {
  return recordingRows({ batchId });
}

/**
 * Give another batch access to a recording — "in recordings ko dusre batch ko
 * assign bhi kar sakta hu". A batch `RecordingAccess` row opens it to everyone
 * on that batch; the recording is published if it wasn't.
 *
 * Adding the first access row would otherwise *gate* the recording — hiding it
 * from the batch it belongs to — so when this is the first row we also add one
 * for the meeting's own batch, keeping its learners' access intact.
 */
export async function assignRecordingToBatch(
  meetingId: string,
  batchId: string,
): Promise<void> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: {
      batchId: true,
      recordingUrl: true,
      recordingPublished: true,
      recordingPublishedAt: true,
    },
  });
  if (!meeting) throw AppError.notFound("Recording not found.");
  if (!meeting.recordingUrl) {
    throw AppError.badRequest("This class has no recording to assign yet.");
  }

  const rowCount = await prisma.recordingAccess.count({ where: { meetingId } });
  if (rowCount === 0 && meeting.batchId && meeting.batchId !== batchId) {
    await prisma.recordingAccess.create({
      data: { meetingId, batchId: meeting.batchId },
    });
  }

  const exists = await prisma.recordingAccess.findFirst({
    where: { meetingId, batchId },
    select: { id: true },
  });
  if (!exists) {
    await prisma.recordingAccess.create({ data: { meetingId, batchId } });
  }

  if (!meeting.recordingPublished) {
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        recordingPublished: true,
        recordingPublishedAt: meeting.recordingPublishedAt ?? new Date(),
      },
    });
  }
}

/** Recordings to put in a ZIP — title + the file to pull. */
export async function recordingsForZip(
  where: Prisma.MeetingWhereInput,
): Promise<{ title: string; recordingUrl: string }[]> {
  const rows = await prisma.meeting.findMany({
    where: { recordingUrl: { not: null }, ...where },
    orderBy: { scheduledStart: "desc" },
    take: 500,
    select: { title: true, recordingUrl: true },
  });
  return rows
    .filter((r): r is { title: string; recordingUrl: string } =>
      Boolean(r.recordingUrl),
    )
    .map((r) => ({ title: r.title, recordingUrl: r.recordingUrl }));
}

export interface AdminRequestRow {
  id: string;
  status: string;
  note: string | null;
  price: number | null;
  learnerName: string;
  learnerEmail: string;
  learnerAvatar: string | null;
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  courseTitle: string | null;
  createdAt: string;
}

/** Requests for the admin queue — pending first, then the rest, newest first. */
export async function listRecordingRequests(
  onlyPending = false,
): Promise<AdminRequestRow[]> {
  const rows = await prisma.recordingRequest.findMany({
    where: onlyPending ? { status: "PENDING" } : {},
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      status: true,
      note: true,
      price: true,
      createdAt: true,
      meetingId: true,
      user: { select: { name: true, email: true, avatarUrl: true } },
      meeting: {
        select: {
          title: true,
          scheduledStart: true,
          course: { select: { title: true } },
        },
      },
    },
  });
  // PENDING and AWAITING_PAYMENT lead; "asc" on the enum isn't the order we want.
  const weight = (s: string) =>
    s === "PENDING" ? 0 : s === "AWAITING_PAYMENT" ? 1 : 2;
  return rows
    .map((r) => ({
      id: r.id,
      status: r.status,
      note: r.note,
      price: decimal(r.price),
      learnerName: r.user.name,
      learnerEmail: r.user.email,
      learnerAvatar: r.user.avatarUrl,
      meetingId: r.meetingId,
      meetingTitle: r.meeting.title,
      meetingDate: r.meeting.scheduledStart.toISOString(),
      courseTitle: r.meeting.course?.title ?? null,
      createdAt: r.createdAt.toISOString(),
    }))
    .sort(
      (a, b) =>
        weight(a.status) - weight(b.status) ||
        b.createdAt.localeCompare(a.createdAt),
    );
}

/**
 * Approve a request. A price makes it payable (the learner unlocks it by
 * paying); no price grants access straight away.
 */
export async function approveRecordingRequest(
  requestId: string,
  adminId: string,
  input: { price: number; accessDays: number },
): Promise<void> {
  const row = await prisma.recordingRequest.findUnique({
    where: { id: requestId },
    select: { id: true, meetingId: true, userId: true, status: true },
  });
  if (!row) throw AppError.notFound("Request not found.");
  if (row.status === "GRANTED") {
    throw AppError.conflict("That request is already granted.");
  }

  const days = input.accessDays > 0 ? input.accessDays : DEFAULT_ACCESS_DAYS;

  if (input.price > 0) {
    await prisma.recordingRequest.update({
      where: { id: requestId },
      data: {
        status: "AWAITING_PAYMENT",
        price: new Prisma.Decimal(input.price),
        accessDays: days,
        handledById: adminId,
        handledAt: new Date(),
      },
    });
    const meeting = await prisma.meeting.findUnique({
      where: { id: row.meetingId },
      select: { title: true },
    });
    void notify({
      userIds: [row.userId],
      type: "ANNOUNCEMENT",
      title: "Recording ready to unlock",
      message: `Pay ₹${input.price.toLocaleString("en-IN")} to watch the recording of “${meeting?.title ?? "your class"}”.`,
      actionUrl: "/student/live",
    });
    return;
  }

  // Free share — grant now.
  await prisma.recordingRequest.update({
    where: { id: requestId },
    data: { accessDays: days, handledById: adminId, handledAt: new Date(), price: null },
  });
  await grant({ ...row, accessDays: days }, null);
}

/** Turn a request down. */
export async function declineRecordingRequest(
  requestId: string,
  adminId: string,
): Promise<void> {
  const row = await prisma.recordingRequest.findUnique({
    where: { id: requestId },
    select: { status: true, userId: true, meetingId: true },
  });
  if (!row) throw AppError.notFound("Request not found.");
  if (row.status === "GRANTED") {
    throw AppError.conflict("That request is already granted.");
  }
  await prisma.recordingRequest.update({
    where: { id: requestId },
    data: { status: "DECLINED", handledById: adminId, handledAt: new Date() },
  });
  void notify({
    userIds: [row.userId],
    type: "ANNOUNCEMENT",
    title: "Recording request declined",
    message: "Your request for a class recording wasn't approved. Reach out to the office if you still need it.",
    actionUrl: "/student/live",
  });
}

/**
 * Write the grant: a `RecordingAccess` row with its own window for this one
 * learner, publishing the recording if it wasn't already. Idempotent — it
 * claims the request row first, so a repeated payment webhook grants once.
 */
async function grant(
  row: { id: string; meetingId: string; userId: string; accessDays: number | null },
  paymentId: string | null,
): Promise<void> {
  const claim = await prisma.recordingRequest.updateMany({
    where: { id: row.id, status: { not: "GRANTED" } },
    data: {
      status: "GRANTED",
      grantedAt: new Date(),
      ...(paymentId ? { paymentId } : {}),
    },
  });
  if (claim.count === 0) return; // someone else granted it first

  const days = row.accessDays ?? DEFAULT_ACCESS_DAYS;
  const expiresAt = new Date(Date.now() + days * 86_400_000);
  const access = await prisma.recordingAccess.create({
    data: { meetingId: row.meetingId, userId: row.userId, expiresAt },
    select: { id: true },
  });
  await prisma.recordingRequest.update({
    where: { id: row.id },
    data: { accessId: access.id },
  });

  // A shared recording must be published to be watchable; set the window clock
  // only if it has never been published, so an existing window isn't reset.
  const meeting = await prisma.meeting.findUnique({
    where: { id: row.meetingId },
    select: { recordingPublished: true, recordingPublishedAt: true, title: true },
  });
  if (meeting && !meeting.recordingPublished) {
    await prisma.meeting.update({
      where: { id: row.meetingId },
      data: {
        recordingPublished: true,
        recordingPublishedAt: meeting.recordingPublishedAt ?? new Date(),
      },
    });
  }

  void notify({
    userIds: [row.userId],
    type: "ANNOUNCEMENT",
    title: "Recording unlocked",
    message: `You can now watch the recording of “${meeting?.title ?? "your class"}” for ${days} days.`,
    actionUrl: "/student/live",
  });
}
