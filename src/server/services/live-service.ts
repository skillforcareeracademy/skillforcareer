import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { ROLES } from "@/config/roles";
import type {
  MeetingInput,
  RescheduleInput,
  OfflineClassInput,
  MarkAttendanceInput,
} from "@/lib/validations/live";

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDate(value?: string): Date | null {
  return value ? new Date(value) : null;
}

function randomCode(): string {
  const c = "abcdefghijkmnopqrstuvwxyz"; // omit 'l'
  const pick = (n: number) =>
    Array.from({ length: n }, () => c[Math.floor(Math.random() * c.length)]).join("");
  return `${pick(3)}-${pick(4)}-${pick(3)}`;
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
  recordingUrl: string | null;
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
  if (courseIds.length) or.push({ courseId: { in: courseIds } });
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
    recordingUrl: m.recordingUrl,
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
  };
}

/**
 * Who may enter a live room: the host, any staff (instructor/admin), a learner
 * enrolled in the meeting's course or batch, or a learner individually added to
 * the class. That last case is what lets a hand-picked session — an offline
 * workshop with no course behind it — still hand out a working video link.
 */
export async function checkRoomAccess(
  userId: string,
  role: string,
  meeting: {
    id: string;
    host: { id: string };
    courseId: string | null;
    batchId: string | null;
    provider?: string;
    roomCode?: string;
  },
): Promise<boolean> {
  if (meeting.host.id === userId) return true;
  if (
    role === ROLES.SUPER_ADMIN ||
    role === ROLES.ADMIN ||
    role === ROLES.INSTRUCTOR
  ) {
    return true;
  }

  const invited = await prisma.meetingParticipant.findFirst({
    where: { meetingId: meeting.id, userId },
    select: { id: true },
  });
  if (invited) return true;

  // A webinar room has no course or batch behind it — registering for the
  // webinar is what grants entry.
  if (meeting.provider === "webinar" && meeting.roomCode) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (user) {
      const registered = await prisma.webinarRegistration.findFirst({
        where: {
          webinar: { roomCode: meeting.roomCode },
          OR: [{ userId }, { email: user.email.trim().toLowerCase() }],
        },
        select: { id: true },
      });
      if (registered) return true;
    }
    return false;
  }

  const or: Prisma.EnrollmentWhereInput[] = [];
  if (meeting.courseId) or.push({ courseId: meeting.courseId });
  if (meeting.batchId) or.push({ batchId: meeting.batchId });
  if (or.length === 0) return false;

  const enrollment = await prisma.enrollment.findFirst({
    where: { userId, status: { in: ["ACTIVE", "COMPLETED"] }, OR: or },
    select: { id: true },
  });
  return Boolean(enrollment);
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

export async function createMeeting(input: MeetingInput, fallbackHostId: string): Promise<string> {
  const roomCode = await uniqueRoomCode();
  const meeting = await prisma.meeting.create({
    data: {
      title: input.title,
      description: input.description || null,
      hostId: input.hostId || fallbackHostId,
      courseId: input.courseId || null,
      batchId: input.batchId || null,
      status: input.status,
      roomCode,
      scheduledStart: new Date(input.scheduledStart),
      scheduledEnd: toDate(input.scheduledEnd),
      maxParticipants: input.maxParticipants ?? null,
      isRecordingEnabled: input.isRecordingEnabled,
    },
    select: { id: true },
  });
  return meeting.id;
}

export async function updateMeeting(id: string, input: MeetingInput): Promise<void> {
  const existing = await prisma.meeting.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Live class not found.");

  await prisma.meeting.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description || null,
      hostId: input.hostId,
      courseId: input.courseId || null,
      batchId: input.batchId || null,
      status: input.status,
      scheduledStart: new Date(input.scheduledStart),
      scheduledEnd: toDate(input.scheduledEnd),
      maxParticipants: input.maxParticipants ?? null,
      isRecordingEnabled: input.isRecordingEnabled,
    },
  });
}

export async function deleteMeeting(id: string): Promise<void> {
  const existing = await prisma.meeting.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Live class not found.");
  await prisma.meeting.delete({ where: { id } });
}

type MeetingStatusValue = "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";

/** Transition a class (Start → LIVE, End → ENDED, …); notifies learners on go-live. */
export async function setMeetingStatus(
  id: string,
  status: MeetingStatusValue,
): Promise<{ notified: number }> {
  const m = await prisma.meeting.findUnique({ where: { id }, select: { id: true } });
  if (!m) throw AppError.notFound("Live class not found.");

  const data: Prisma.MeetingUpdateInput = { status };
  if (status === "LIVE") data.actualStart = new Date();
  if (status === "ENDED") data.actualEnd = new Date();
  await prisma.meeting.update({ where: { id }, data });

  const notified = status === "LIVE" ? await notifyLiveClass(id) : 0;
  return { notified };
}

export async function setRecordingUrl(id: string, url: string): Promise<void> {
  await prisma.meeting.update({ where: { id }, data: { recordingUrl: url } });
}

/** In-app notification to enrolled learners that a class went live. Returns count. */
/** Move a class to a new time (status→SCHEDULED) and notify enrolled learners. */
export async function rescheduleMeeting(id: string, input: RescheduleInput): Promise<number> {
  const m = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, title: true, courseId: true, batchId: true, hostId: true },
  });
  if (!m) throw AppError.notFound("Live class not found.");

  await prisma.meeting.update({
    where: { id },
    data: {
      scheduledStart: new Date(input.scheduledStart),
      scheduledEnd: toDate(input.scheduledEnd),
      status: "SCHEDULED",
    },
  });

  const enrollWhere: Prisma.EnrollmentWhereInput | null = m.batchId
    ? { batchId: m.batchId }
    : m.courseId
      ? { courseId: m.courseId }
      : null;
  if (!enrollWhere) return 0;

  const enrollments = await prisma.enrollment.findMany({
    where: { ...enrollWhere, status: "ACTIVE" },
    select: { userId: true },
  });
  const userIds = [...new Set(enrollments.map((e) => e.userId))].filter((uid) => uid !== m.hostId);
  if (userIds.length === 0) return 0;

  const when = format(new Date(input.scheduledStart), "EEE, d MMM · h:mm a");
  const reason = input.reason ? ` Reason: ${input.reason}` : "";
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: "LIVE_CLASS" as const,
      channel: "IN_APP" as const,
      title: "Live class rescheduled",
      message: `“${m.title}” has been moved to ${when}.${reason}`,
      actionUrl: `/student/live`,
    })),
  });
  return userIds.length;
}

export async function notifyLiveClass(meetingId: string): Promise<number> {
  const m = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, title: true, roomCode: true, courseId: true, batchId: true, hostId: true },
  });
  if (!m) return 0;

  const enrollWhere: Prisma.EnrollmentWhereInput | null = m.batchId
    ? { batchId: m.batchId }
    : m.courseId
      ? { courseId: m.courseId }
      : null;
  if (!enrollWhere) return 0;

  const enrollments = await prisma.enrollment.findMany({
    where: { ...enrollWhere, status: "ACTIVE" },
    select: { userId: true },
  });
  const userIds = [...new Set(enrollments.map((e) => e.userId))].filter((uid) => uid !== m.hostId);
  if (userIds.length === 0) return 0;

  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: "LIVE_CLASS" as const,
      channel: "IN_APP" as const,
      title: "Live class is starting",
      message: `“${m.title}” is now live. Join from your dashboard.`,
      actionUrl: `/live/room/${m.roomCode}`,
    })),
  });
  return userIds.length;
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
async function requireOfflineMeeting(id: string): Promise<void> {
  const existing = await prisma.meeting.findUnique({
    where: { id },
    select: { provider: true },
  });
  if (!existing || existing.provider !== "offline") {
    throw AppError.notFound("Offline class not found.");
  }
}

export async function updateOfflineClass(
  id: string,
  input: OfflineClassInput,
): Promise<void> {
  await requireOfflineMeeting(id);
  await prisma.meeting.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description || null,
      location: input.location,
      courseId: input.courseId || null,
      batchId: input.batchId || null,
      scheduledStart: new Date(input.scheduledStart),
      scheduledEnd: toDate(input.scheduledEnd),
    },
  });
}

/** Removes the class; its attendance rows cascade with it. */
export async function deleteOfflineClass(id: string): Promise<void> {
  await requireOfflineMeeting(id);
  await prisma.meeting.delete({ where: { id } });
}

export async function createOfflineClass(input: OfflineClassInput, hostId: string): Promise<string> {
  const roomCode = await uniqueRoomCode();
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
      scheduledStart: new Date(input.scheduledStart),
      scheduledEnd: toDate(input.scheduledEnd),
    },
    select: { id: true },
  });
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
      role: { slug: ROLES.STUDENT },
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
