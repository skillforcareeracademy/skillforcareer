import { prisma } from "@/lib/prisma";
import { activeStudentWhere } from "@/server/repositories/role-filters";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { ROLES } from "@/config/roles";
import type {
  MeetingInput,
  RescheduleInput,
  OfflineClassInput,
  MarkAttendanceInput,
} from "@/lib/validations/live";
import {
  learnerRecordingStates,
  type RecordingState,
} from "@/server/services/recording-service";
import { parseAcademyDateTime } from "@/lib/ist";
import { isJoinLinkOpen, joinLinkOpensAt } from "@/lib/class-link";
import {
  announceClassEvent,
  deliverClassAnnouncement,
  prepareClassAnnouncement,
  type ClassEvent,
} from "@/server/services/class-notifications";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Class forms send `<input type="datetime-local">` values — academy (IST)
 * wall-clock time with no zone. `new Date(value)` read those in the server's
 * zone, which on Vercel is UTC, so a class typed for 5:30 pm landed at 11 pm.
 */
function toDate(value?: string): Date | null {
  return value ? parseAcademyDateTime(value) : null;
}

function toStart(value: string): Date {
  return parseAcademyDateTime(value);
}

function randomCode(): string {
  const c = "abcdefghijkmnopqrstuvwxyz"; // omit 'l'
  const pick = (n: number) =>
    Array.from({ length: n }, () => c[Math.floor(Math.random() * c.length)]).join("");
  return `${pick(3)}-${pick(4)}-${pick(3)}`;
}

/**
 * `n` distinct room codes that aren't in use, checked in one query — a
 * timetable creates dozens of classes at once, and a lookup per code is a
 * round-trip each to a database a region away.
 */
export async function uniqueRoomCodes(n: number): Promise<string[]> {
  const codes = new Set<string>();
  for (let attempt = 0; codes.size < n && attempt < 10; attempt += 1) {
    const fresh: string[] = [];
    while (codes.size + fresh.length < n) {
      const c = randomCode();
      if (!codes.has(c) && !fresh.includes(c)) fresh.push(c);
    }
    const taken = await prisma.meeting.findMany({
      where: { roomCode: { in: fresh } },
      select: { roomCode: true },
    });
    const clash = new Set(taken.map((t) => t.roomCode));
    for (const c of fresh) if (!clash.has(c)) codes.add(c);
  }
  while (codes.size < n) codes.add(`${randomCode()}-${Math.floor(Math.random() * 1e6).toString(36)}`);
  return [...codes];
}

export async function uniqueRoomCode(): Promise<string> {
  for (let i = 0; i < 50; i += 1) {
    const code = randomCode();
    const clash = await prisma.meeting.findUnique({
      where: { roomCode: code },
      select: { id: true },
    });
    if (!clash) return code;
  }
  return `${randomCode()}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// ── Reads ────────────────────────────────────────────────────────────────────

export interface MeetingListQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  courseId?: string;
  /** Narrow to one cohort — "how many classes has this batch had?". */
  batchId?: string;
  /** Scope to one host's classes (instructor workspace). */
  hostId?: string;
}

export async function listMeetingsAdmin(q: MeetingListQuery) {
  const and: Prisma.MeetingWhereInput[] = [{ NOT: { provider: "offline" } }];
  if (q.search) {
    and.push({
      OR: [{ title: { contains: q.search } }, { roomCode: { contains: q.search } }],
    });
  }
  if (q.status) and.push({ status: q.status as Prisma.MeetingWhereInput["status"] });
  if (q.courseId) and.push({ courseId: q.courseId });
  if (q.batchId) and.push({ batchId: q.batchId });
  if (q.hostId) and.push({ hostId: q.hostId });
  const where: Prisma.MeetingWhereInput = and.length ? { AND: and } : {};

  const [total, rows] = await Promise.all([
    prisma.meeting.count({ where }),
    prisma.meeting.findMany({
      where,
      // Most-recently-created first, so a class an admin just scheduled surfaces
      // at the top regardless of when it's due (matches the other admin lists).
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        course: { select: { title: true } },
        batch: { select: { name: true } },
        host: { select: { name: true, avatarUrl: true } },
        _count: { select: { participants: true } },
      },
    }),
  ]);

  return {
    total,
    meetings: rows.map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      roomCode: m.roomCode,
      provider: m.provider,
      courseId: m.courseId,
      courseTitle: m.course?.title ?? null,
      batchId: m.batchId,
      batchName: m.batch?.name ?? null,
      hostId: m.hostId,
      hostName: m.host.name,
      hostAvatar: m.host.avatarUrl,
      scheduledStart: m.scheduledStart.toISOString(),
      scheduledEnd: m.scheduledEnd ? m.scheduledEnd.toISOString() : null,
      maxParticipants: m.maxParticipants,
      isRecordingEnabled: m.isRecordingEnabled,
      participants: m._count.participants,
    })),
  };
}

export type MeetingPhase = "live" | "upcoming" | "past" | "cancelled";

export interface StudentMeeting {
  id: string;
  title: string;
  description: string | null;
  status: string;
  phase: MeetingPhase;
  roomCode: string;
  courseTitle: string | null;
  batchName: string | null;
  hostName: string;
  hostAvatar: string | null;
  scheduledStart: string;
  scheduledEnd: string | null;
  isRecordingEnabled: boolean;
  /**
   * Whether the join link is released yet. Learners get it 24 hours before a
   * class ("Link should be automatically generated 24 hours before the class
   * timing"); until then the page shows when it opens and the room itself
   * turns them away. `roomCode` stays in the payload because installed mobile
   * apps read it — the room page is what enforces the window.
   */
  joinLinkOpen: boolean;
  /** When the link opens (ISO). */
  joinLinkOpensAt: string;
  /** Why the class was cancelled, when it was. */
  cancelReason: string | null;
  /**
   * What this learner may do with the recording — never where it lives.
   *
   * `recordingUrl` used to ride along here, which meant every learner's page
   * source contained a permanent, unauthenticated link to the class video that
   * could be saved or forwarded. Playback now goes through
   * GET /api/recordings/:id/stream and this is the grant that opens it.
   */
  recording: RecordingState;
}

/** Bucket a meeting into a lifecycle phase (computed server-side, off `now`). */
function meetingPhase(
  status: string,
  scheduledStart: Date,
  scheduledEnd: Date | null,
  now: Date,
): MeetingPhase {
  if (status === "LIVE") return "live";
  if (status === "CANCELLED") return "cancelled";
  if (status === "ENDED") return "past";
  // SCHEDULED
  if (scheduledStart > now) return "upcoming";
  if (scheduledEnd && scheduledEnd < now) return "past";
  return "live"; // started, not yet ended → joinable
}

/**
 * Live classes visible to a learner — those attached to a course or batch they
 * are enrolled in, plus any class they personally host (instructors who learn).
 */
export async function listStudentMeetings(userId: string): Promise<StudentMeeting[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { courseId: true, batchId: true },
  });
  const courseIds = [...new Set(enrollments.map((e) => e.courseId))];
  const batchIds = [...new Set(enrollments.map((e) => e.batchId).filter((b): b is string => !!b))];

  const or: Prisma.MeetingWhereInput[] = [{ hostId: userId }];
  // A batch's classes belong to that batch; only a class with no batch is for
  // everyone on the course. Every timetabled class carries its course too, so
  // matching on course alone showed each learner every other batch's timetable.
  if (courseIds.length) or.push({ courseId: { in: courseIds }, batchId: null });
  if (batchIds.length) or.push({ batchId: { in: batchIds } });

  const rows = await prisma.meeting.findMany({
    where: { OR: or },
    orderBy: { scheduledStart: "asc" },
    take: 200,
    include: {
      course: { select: { title: true } },
      batch: { select: { name: true } },
      host: { select: { name: true, avatarUrl: true } },
    },
  });

  // Resolved in one pass for the whole list — three queries, not three per row.
  // `rows` is already narrowed to classes this learner could have attended,
  // which is what lets an empty audience mean "everyone who could attend".
  const recordings = await learnerRecordingStates(userId, rows, batchIds);

  const now = new Date();
  return rows.map((m) => ({
    id: m.id,
    title: m.title,
    description: m.description,
    status: m.status,
    phase: meetingPhase(m.status, m.scheduledStart, m.scheduledEnd, now),
    roomCode: m.roomCode,
    courseTitle: m.course?.title ?? null,
    batchName: m.batch?.name ?? null,
    hostName: m.host.name,
    hostAvatar: m.host.avatarUrl,
    scheduledStart: m.scheduledStart.toISOString(),
    scheduledEnd: m.scheduledEnd ? m.scheduledEnd.toISOString() : null,
    isRecordingEnabled: m.isRecordingEnabled,
    // The host (an instructor who is also learning) always has their own link.
    joinLinkOpen:
      m.hostId === userId ||
      (m.status !== "CANCELLED" && (m.status === "LIVE" || isJoinLinkOpen(m.scheduledStart, now))),
    joinLinkOpensAt: joinLinkOpensAt(m.scheduledStart).toISOString(),
    cancelReason: m.cancelReason,
    recording: recordings.get(m.id)!,
  }));
}

export interface MeetingStats {
  total: number;
  scheduled: number;
  live: number;
  ended: number;
}

export async function meetingStats(hostId?: string): Promise<MeetingStats> {
  const scope: Prisma.MeetingWhereInput = hostId ? { hostId } : {};
  const [total, scheduled, live, ended] = await Promise.all([
    prisma.meeting.count({ where: scope }),
    prisma.meeting.count({ where: { ...scope, status: "SCHEDULED" } }),
    prisma.meeting.count({ where: { ...scope, status: "LIVE" } }),
    prisma.meeting.count({ where: { ...scope, status: "ENDED" } }),
  ]);
  return { total, scheduled, live, ended };
}

export async function getMeetingDetail(id: string) {
  const m = await prisma.meeting.findUnique({
    where: { id },
    include: {
      course: { select: { title: true, slug: true } },
      batch: { select: { name: true, enrolledCount: true } },
      host: { select: { name: true, avatarUrl: true, headline: true } },
      participants: {
        take: 200,
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      },
    },
  });
  if (!m) throw AppError.notFound("Live class not found.");

  return {
    id: m.id,
    title: m.title,
    description: m.description,
    status: m.status,
    roomCode: m.roomCode,
    provider: m.provider,
    scheduledStart: m.scheduledStart.toISOString(),
    scheduledEnd: m.scheduledEnd ? m.scheduledEnd.toISOString() : null,
    maxParticipants: m.maxParticipants,
    isRecordingEnabled: m.isRecordingEnabled,
    recordingUrl: m.recordingUrl,
    course: m.course,
    batch: m.batch,
    host: m.host,
    participants: m.participants.map((p) => ({
      id: p.user.id,
      name: p.user.name,
      email: p.user.email,
      avatarUrl: p.user.avatarUrl,
      role: p.role,
    })),
  };
}

/** Meeting looked up by its shareable room code — for the live room page. */
export async function getMeetingByRoomCode(code: string) {
  const m = await prisma.meeting.findUnique({
    where: { roomCode: code },
    include: {
      host: { select: { id: true, name: true, avatarUrl: true } },
      course: { select: { title: true, slug: true } },
      batch: { select: { name: true } },
    },
  });
  if (!m) return null;
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    status: m.status,
    roomCode: m.roomCode,
    provider: m.provider,
    scheduledStart: m.scheduledStart.toISOString(),
    scheduledEnd: m.scheduledEnd ? m.scheduledEnd.toISOString() : null,
    isRecordingEnabled: m.isRecordingEnabled,
    host: m.host,
    courseId: m.courseId,
    courseTitle: m.course?.title ?? null,
    courseSlug: m.course?.slug ?? null,
    batchId: m.batchId,
    batchName: m.batch?.name ?? null,
    cancelReason: m.cancelReason,
  };
}

/** Hosts (staff/instructors) who can lead a live class. */
export async function listHosts() {
  return prisma.user.findMany({
    where: { role: { slug: { in: [ROLES.INSTRUCTOR, ROLES.ADMIN, ROLES.SUPER_ADMIN] } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listCoursesForSelect(instructorId?: string) {
  return prisma.course.findMany({
    where: instructorId ? { instructorId } : {},
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
}

export async function listBatchesForSelect(instructorId?: string) {
  const rows = await prisma.batch.findMany({
    where: instructorId ? { instructorId } : {},
    select: { id: true, name: true, courseId: true, course: { select: { title: true } } },
    orderBy: { startDate: "desc" },
    take: 200,
  });
  // `courseId` lets the batch filter narrow itself once a course is chosen.
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    courseId: b.courseId,
    courseTitle: b.course.title,
  }));
}

// ── Writes ───────────────────────────────────────────────────────────────────

const sameInstant = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

interface ClassState {
  status: string;
  scheduledStart: Date;
  scheduledEnd: Date | null;
  title: string;
  hostId: string;
  location?: string | null;
}

/**
 * What an edit is worth telling people about, if anything: a status change
 * first, then a new time, then any other visible change. Edits to a class that
 * is already over aren't news.
 */
function editEvent(before: ClassState, after: ClassState): ClassEvent | null {
  if (before.status !== after.status) {
    if (after.status === "CANCELLED") return { kind: "cancelled" };
    if (after.status === "LIVE") return { kind: "live" };
    if (after.status === "ENDED") return { kind: "ended" };
    if (after.status === "SCHEDULED" && before.status === "CANCELLED") return { kind: "restored" };
  }
  if (after.status !== "SCHEDULED" || after.scheduledStart.getTime() < Date.now()) return null;
  if (
    !sameInstant(before.scheduledStart, after.scheduledStart) ||
    !sameInstant(before.scheduledEnd, after.scheduledEnd)
  ) {
    return {
      kind: "rescheduled",
      previousStart: before.scheduledStart,
      previousEnd: before.scheduledEnd,
    };
  }
  const changes: string[] = [];
  if (before.title !== after.title) changes.push("title");
  if (before.hostId !== after.hostId) changes.push("instructor");
  if ((before.location ?? null) !== (after.location ?? null)) changes.push("venue");
  return changes.length ? { kind: "updated", changes } : null;
}

/** A timetabled class someone changed by hand is no longer the timetable's to move. */
function touchedByHand(ev: ClassEvent | null): boolean {
  return ev !== null && ev.kind !== "live" && ev.kind !== "ended";
}

export async function createMeeting(input: MeetingInput, fallbackHostId: string): Promise<string> {
  const roomCode = await uniqueRoomCode();
  const start = toStart(input.scheduledStart);
  const meeting = await prisma.meeting.create({
    data: {
      title: input.title,
      description: input.description || null,
      hostId: input.hostId || fallbackHostId,
      courseId: input.courseId || null,
      batchId: input.batchId || null,
      status: input.status,
      roomCode,
      scheduledStart: start,
      scheduledEnd: toDate(input.scheduledEnd),
      maxParticipants: input.maxParticipants ?? null,
      isRecordingEnabled: input.isRecordingEnabled,
    },
    select: { id: true },
  });
  // "There should be a mail going … when his class is being scheduled."
  if (input.status === "SCHEDULED" && start.getTime() > Date.now()) {
    await announceClassEvent(meeting.id, { kind: "scheduled" }, { actorId: fallbackHostId });
  }
  return meeting.id;
}

export async function updateMeeting(id: string, input: MeetingInput, actorId?: string): Promise<void> {
  const existing = await prisma.meeting.findUnique({
    where: { id },
    select: {
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      title: true,
      hostId: true,
      courseId: true,
      batchId: true,
      autoScheduled: true,
    },
  });
  if (!existing) throw AppError.notFound("Live class not found.");

  const next: ClassState = {
    status: input.status,
    scheduledStart: toStart(input.scheduledStart),
    scheduledEnd: toDate(input.scheduledEnd),
    title: input.title,
    hostId: input.hostId,
  };
  const ev = editEvent(existing, next);
  const moved =
    !sameInstant(existing.scheduledStart, next.scheduledStart) ||
    !sameInstant(existing.scheduledEnd, next.scheduledEnd);
  const regrouped =
    existing.courseId !== (input.courseId || null) || existing.batchId !== (input.batchId || null);

  await prisma.meeting.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description || null,
      hostId: input.hostId,
      courseId: input.courseId || null,
      batchId: input.batchId || null,
      status: input.status,
      scheduledStart: next.scheduledStart,
      scheduledEnd: next.scheduledEnd,
      maxParticipants: input.maxParticipants ?? null,
      isRecordingEnabled: input.isRecordingEnabled,
      ...(existing.autoScheduled && (touchedByHand(ev) || moved || regrouped)
        ? { manualOverride: true }
        : {}),
      ...(moved ? { reminderSentAt: null } : {}),
      ...(input.status !== "CANCELLED" ? { cancelReason: null } : {}),
    },
  });

  if (ev) await announceClassEvent(id, ev, { actorId });
}

export async function deleteMeeting(id: string, actorId?: string): Promise<void> {
  const existing = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, status: true, scheduledStart: true },
  });
  if (!existing) throw AppError.notFound("Live class not found.");
  // A class that was still to come is, to its learners, a cancelled class.
  const upcoming =
    existing.status === "SCHEDULED" && existing.scheduledStart.getTime() > Date.now();
  const prepared = upcoming ? await prepareClassAnnouncement(id, actorId) : null;
  await prisma.meeting.delete({ where: { id } });
  await deliverClassAnnouncement(prepared, { kind: "cancelled" });
}

type MeetingStatusValue = "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";

/**
 * Transition a class (Start → LIVE, End → ENDED, Cancel → CANCELLED, or put a
 * cancelled class back) and tell its learners and teaching team. Cancelling
 * or reinstating a timetabled class marks it as overridden, so rebuilding the
 * timetable leaves the decision alone.
 */
export async function setMeetingStatus(
  id: string,
  status: MeetingStatusValue,
  opts: { reason?: string | null; actorId?: string } = {},
): Promise<{ notified: number }> {
  const m = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, status: true, autoScheduled: true },
  });
  if (!m) throw AppError.notFound("Live class not found.");
  if (m.status === status) return { notified: 0 };

  const reason = opts.reason?.trim() || null;
  const data: Prisma.MeetingUpdateInput = { status };
  if (status === "LIVE") data.actualStart = new Date();
  if (status === "ENDED") data.actualEnd = new Date();
  if (status === "CANCELLED") data.cancelReason = reason;
  if (status === "SCHEDULED") data.cancelReason = null;
  if (m.autoScheduled && (status === "CANCELLED" || status === "SCHEDULED")) {
    data.manualOverride = true;
  }
  await prisma.meeting.update({ where: { id }, data });

  const ev: ClassEvent | null =
    status === "LIVE"
      ? { kind: "live" }
      : status === "ENDED"
        ? { kind: "ended" }
        : status === "CANCELLED"
          ? { kind: "cancelled", reason }
          : m.status === "CANCELLED"
            ? { kind: "restored" }
            : null;
  const notified = ev ? await announceClassEvent(id, ev, { actorId: opts.actorId }) : 0;
  return { notified };
}

export async function setRecordingUrl(id: string, url: string): Promise<void> {
  await prisma.meeting.update({ where: { id }, data: { recordingUrl: url } });
}

/**
 * Move a class to a new time (status → SCHEDULED) and tell its learners and
 * teaching team at once. A timetabled class moved by hand is marked as
 * overridden so a rebuild won't drag it back; its reminder is re-armed for the
 * new time. Returns how many learners were notified.
 */
export async function rescheduleMeeting(
  id: string,
  input: RescheduleInput,
  actorId?: string,
): Promise<number> {
  const m = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, scheduledStart: true, scheduledEnd: true },
  });
  if (!m) throw AppError.notFound("Live class not found.");

  const start = toStart(input.scheduledStart);
  const end = toDate(input.scheduledEnd);
  if (end && end.getTime() <= start.getTime()) {
    throw AppError.badRequest("The class has to end after it starts.");
  }

  await prisma.meeting.update({
    where: { id },
    data: {
      scheduledStart: start,
      scheduledEnd: end,
      status: "SCHEDULED",
      cancelReason: null,
      reminderSentAt: null,
      manualOverride: true,
    },
  });

  return announceClassEvent(
    id,
    {
      kind: "rescheduled",
      previousStart: m.scheduledStart,
      previousEnd: m.scheduledEnd,
      reason: input.reason || null,
    },
    { actorId },
  );
}

/** Tell a class's learners (in-app + email) that it went live. Returns the learner count. */
export async function notifyLiveClass(meetingId: string): Promise<number> {
  return announceClassEvent(meetingId, { kind: "live" });
}

// ── Offline classes + manual attendance ──────────────────────────────────────

export interface OfflineClassRow {
  id: string;
  title: string;
  location: string | null;
  courseTitle: string | null;
  batchName: string | null;
  hostName: string;
  scheduledStart: string;
  attendanceMarked: number;
}

export async function listOfflineClasses(q: {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  courseId?: string;
  batchId?: string;
  hostId?: string;
}) {
  const and: Prisma.MeetingWhereInput[] = [{ provider: "offline" }];
  if (q.search) {
    and.push({
      OR: [{ title: { contains: q.search } }, { location: { contains: q.search } }],
    });
  }
  if (q.status) and.push({ status: q.status as Prisma.MeetingWhereInput["status"] });
  if (q.courseId) and.push({ courseId: q.courseId });
  if (q.batchId) and.push({ batchId: q.batchId });
  if (q.hostId) and.push({ hostId: q.hostId });
  const where: Prisma.MeetingWhereInput = { AND: and };

  const [total, rows] = await Promise.all([
    prisma.meeting.count({ where }),
    prisma.meeting.findMany({
      where,
      // Most-recently-created first, so a class an admin just scheduled surfaces
      // at the top regardless of when it's due (matches the other admin lists).
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        course: { select: { title: true } },
        batch: { select: { name: true } },
        host: { select: { name: true } },
        _count: { select: { attendance: true, participants: true } },
      },
    }),
  ]);
  return {
    total,
    classes: rows.map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      location: m.location,
      courseTitle: m.course?.title ?? null,
      batchName: m.batch?.name ?? null,
      hostName: m.host.name,
      scheduledStart: m.scheduledStart.toISOString(),
      attendanceMarked: m._count.attendance,
      studentCount: m._count.participants,
      // Every meeting carries a room code, so an in-person class can also hand
      // out a video link for anyone attending remotely.
      roomCode: m.roomCode,
      // Raw editable fields, so the edit dialog prefills without a round-trip.
      description: m.description,
      courseId: m.courseId,
      batchId: m.batchId,
      scheduledEnd: m.scheduledEnd?.toISOString() ?? null,
    })),
  };
}

/** An offline class is a Meeting with `provider: "offline"` — refuse to let the
 *  offline endpoints act on a live class (and vice-versa). */
async function requireOfflineMeeting(id: string) {
  const existing = await prisma.meeting.findUnique({
    where: { id },
    select: {
      provider: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      title: true,
      hostId: true,
      location: true,
      autoScheduled: true,
    },
  });
  if (!existing || existing.provider !== "offline") {
    throw AppError.notFound("Offline class not found.");
  }
  return existing;
}

export async function updateOfflineClass(
  id: string,
  input: OfflineClassInput,
  actorId?: string,
): Promise<void> {
  const before = await requireOfflineMeeting(id);
  const next: ClassState = {
    status: before.status,
    hostId: before.hostId,
    title: input.title,
    location: input.location,
    scheduledStart: toStart(input.scheduledStart),
    scheduledEnd: toDate(input.scheduledEnd),
  };
  const ev = editEvent(before, next);
  const moved =
    !sameInstant(before.scheduledStart, next.scheduledStart) ||
    !sameInstant(before.scheduledEnd, next.scheduledEnd);
  await prisma.meeting.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description || null,
      location: input.location,
      courseId: input.courseId || null,
      batchId: input.batchId || null,
      scheduledStart: next.scheduledStart,
      scheduledEnd: next.scheduledEnd,
      ...(before.autoScheduled && (touchedByHand(ev) || moved) ? { manualOverride: true } : {}),
      ...(moved ? { reminderSentAt: null } : {}),
    },
  });
  if (ev) await announceClassEvent(id, ev, { actorId });
}

/** Removes the class; its attendance rows cascade with it. */
export async function deleteOfflineClass(id: string, actorId?: string): Promise<void> {
  const before = await requireOfflineMeeting(id);
  const upcoming = before.status === "SCHEDULED" && before.scheduledStart.getTime() > Date.now();
  const prepared = upcoming ? await prepareClassAnnouncement(id, actorId) : null;
  await prisma.meeting.delete({ where: { id } });
  await deliverClassAnnouncement(prepared, { kind: "cancelled" });
}

export async function createOfflineClass(input: OfflineClassInput, hostId: string): Promise<string> {
  const roomCode = await uniqueRoomCode();
  const start = toStart(input.scheduledStart);
  const m = await prisma.meeting.create({
    data: {
      title: input.title,
      description: input.description || null,
      location: input.location,
      provider: "offline",
      hostId,
      courseId: input.courseId || null,
      batchId: input.batchId || null,
      status: "SCHEDULED",
      roomCode,
      scheduledStart: start,
      scheduledEnd: toDate(input.scheduledEnd),
    },
    select: { id: true },
  });
  if (start.getTime() > Date.now()) {
    await announceClassEvent(m.id, { kind: "scheduled" }, { actorId: hostId });
  }
  return m.id;
}

export interface AttendanceRoster {
  id: string;
  title: string;
  location: string | null;
  scheduledStart: string;
  learners: { userId: string; name: string; avatar: string | null; status: string }[];
}

/** The enrolled learners for an (offline) class + their current attendance status. */
export async function getAttendanceRoster(meetingId: string): Promise<AttendanceRoster> {
  const m = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, title: true, location: true, scheduledStart: true, courseId: true, batchId: true },
  });
  if (!m) throw AppError.notFound("Class not found.");

  const enrollWhere: Prisma.EnrollmentWhereInput | null = m.batchId
    ? { batchId: m.batchId }
    : m.courseId
      ? { courseId: m.courseId }
      : null;
  const enrollments = enrollWhere
    ? await prisma.enrollment.findMany({
        where: { ...enrollWhere, status: { in: ["ACTIVE", "COMPLETED"] } },
        select: { user: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { user: { name: "asc" } },
      })
    : [];
  const attendance = await prisma.attendance.findMany({
    where: { meetingId },
    select: { userId: true, status: true },
  });
  const statusMap = new Map(attendance.map((a) => [a.userId, a.status]));

  // Learners individually added to this class, on top of whoever the course or
  // batch enrolment implies. An offline class often has no course at all — it's
  // a workshop someone hand-picks attendees for — so this is the only roster it
  // gets.
  const invited = await prisma.meetingParticipant.findMany({
    where: { meetingId },
    select: { user: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { user: { name: "asc" } },
  });

  const seen = new Set<string>();
  const learners: AttendanceRoster["learners"] = [];
  for (const u of [...invited.map((p) => p.user), ...enrollments.map((e) => e.user)]) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    learners.push({
      userId: u.id,
      name: u.name,
      avatar: u.avatarUrl,
      status: statusMap.get(u.id) ?? "ABSENT",
    });
  }
  return {
    id: m.id,
    title: m.title,
    location: m.location,
    scheduledStart: m.scheduledStart.toISOString(),
    learners,
  };
}

// ── Individually-added students ──────────────────────────────────────────────

export interface MeetingStudent {
  userId: string;
  name: string;
  email: string;
  avatar: string | null;
}

/** Learners explicitly added to a class (not derived from enrolment). */
export async function listMeetingStudents(
  meetingId: string,
): Promise<MeetingStudent[]> {
  const rows = await prisma.meetingParticipant.findMany({
    where: { meetingId },
    select: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
    orderBy: { user: { name: "asc" } },
  });
  return rows.map((r) => ({
    userId: r.user.id,
    name: r.user.name,
    email: r.user.email,
    avatar: r.user.avatarUrl,
  }));
}

/** Add learners to a class. Re-adding someone already on it is a no-op. */
export async function addMeetingStudents(
  meetingId: string,
  userIds: string[],
): Promise<number> {
  const m = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true },
  });
  if (!m) throw AppError.notFound("Class not found.");
  if (userIds.length === 0) return 0;

  const result = await prisma.meetingParticipant.createMany({
    data: userIds.map((userId) => ({ meetingId, userId, role: "ATTENDEE" as const })),
    skipDuplicates: true,
  });
  return result.count;
}

/**
 * Take a learner off a class. Their attendance mark for it goes too — they were
 * never part of the session, so leaving a PRESENT row behind would skew the
 * class's attendance count.
 */
export async function removeMeetingStudent(
  meetingId: string,
  userId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.meetingParticipant.deleteMany({ where: { meetingId, userId } }),
    prisma.attendance.deleteMany({ where: { meetingId, userId } }),
  ]);
}

/** Learners available to add to a class, for the picker. */
export async function listStudentsForSelect(
  search?: string,
): Promise<MeetingStudent[]> {
  const rows = await prisma.user.findMany({
    where: {
      // Anyone holding the student role, primary or extra.
      ...activeStudentWhere(),
      ...(search
        ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] }
        : {}),
    },
    select: { id: true, name: true, email: true, avatarUrl: true },
    orderBy: { name: "asc" },
    take: 50,
  });
  return rows.map((u) => ({
    userId: u.id,
    name: u.name,
    email: u.email,
    avatar: u.avatarUrl,
  }));
}

export async function markAttendance(meetingId: string, input: MarkAttendanceInput): Promise<number> {
  const m = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, batchId: true },
  });
  if (!m) throw AppError.notFound("Class not found.");

  await prisma.$transaction(
    input.records.map((r) =>
      prisma.attendance.upsert({
        where: { meetingId_userId: { meetingId, userId: r.userId } },
        create: { meetingId, userId: r.userId, batchId: m.batchId, status: r.status },
        update: { status: r.status },
      }),
    ),
  );
  return input.records.length;
}
