import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { uniqueRoomCode } from "./live-service";
import { notify } from "./notification-service";
import type {
  WebinarInput,
  RegisterWebinarInput,
  WebinarParticipantsInput,
} from "@/lib/validations/webinar";

/**
 * Watch at least this share of the scheduled runtime to count as having
 * attended the whole thing — which is what earns the extra discount. Nobody
 * joins on the second, and most sessions overrun, so demanding 100% would mean
 * nobody ever qualified.
 */
const FULL_ATTENDANCE_RATIO = 0.8;

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "webinar";
}
async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base);
  let slug = root;
  for (let n = 2; ; n += 1) {
    const clash = await prisma.webinar.findUnique({ where: { slug }, select: { id: true } });
    if (!clash || clash.id === excludeId) return slug;
    slug = `${root}-${n}`;
  }
}

function dataFrom(input: WebinarInput, hostId?: string | null) {
  return {
    title: input.title,
    topic: input.topic || null,
    agenda: input.agenda || null,
    description: input.description || null,
    hostName: input.hostName,
    hostId: hostId ?? null,
    scheduledStart: new Date(input.scheduledStart),
    durationMinutes: input.durationMinutes,
    coverImageUrl: input.coverImageUrl || null,
    joinUrl: input.joinUrl || null,
    capacity: input.capacity ?? null,
    attendanceDiscountPercent: input.attendanceDiscountPercent,
    isPublished: input.isPublished,
  };
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function createWebinar(input: WebinarInput, hostId: string): Promise<string> {
  const slug = await uniqueSlug(input.title);
  const w = await prisma.webinar.create({
    data: { slug, ...dataFrom(input, hostId) },
    select: { id: true },
  });
  return w.id;
}

export async function updateWebinar(id: string, input: WebinarInput): Promise<void> {
  const existing = await prisma.webinar.findUnique({ where: { id }, select: { id: true, hostId: true } });
  if (!existing) throw AppError.notFound("Webinar not found.");
  await prisma.webinar.update({ where: { id }, data: dataFrom(input, existing.hostId) });
}

export async function setWebinarPublished(id: string, isPublished: boolean): Promise<void> {
  const existing = await prisma.webinar.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Webinar not found.");
  await prisma.webinar.update({ where: { id }, data: { isPublished } });
}

export async function deleteWebinar(id: string): Promise<void> {
  const existing = await prisma.webinar.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Webinar not found.");
  await prisma.webinarRegistration.deleteMany({ where: { webinarId: id } });
  await prisma.webinar.delete({ where: { id } });
}

export interface WebinarListQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: string; // PUBLISHED | DRAFT
}

export async function listWebinarsAdmin(q: WebinarListQuery) {
  const and: Prisma.WebinarWhereInput[] = [];
  if (q.search) and.push({ title: { contains: q.search } });
  if (q.status === "PUBLISHED") and.push({ isPublished: true });
  if (q.status === "DRAFT") and.push({ isPublished: false });
  const where: Prisma.WebinarWhereInput = and.length ? { AND: and } : {};

  const [total, rows] = await Promise.all([
    prisma.webinar.count({ where }),
    prisma.webinar.findMany({
      where,
      orderBy: { scheduledStart: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        _count: { select: { registrations: true } },
        // Only the flag, so the "attended fully" tally costs nothing extra.
        registrations: { select: { attendedFully: true } },
      },
    }),
  ]);
  return {
    total,
    webinars: rows.map((w) => ({
      id: w.id,
      title: w.title,
      slug: w.slug,
      topic: w.topic ?? "",
      agenda: w.agenda ?? "",
      description: w.description ?? "",
      hostName: w.hostName,
      coverImageUrl: w.coverImageUrl ?? "",
      joinUrl: w.joinUrl ?? "",
      roomCode: w.roomCode,
      scheduledStart: w.scheduledStart.toISOString(),
      durationMinutes: w.durationMinutes,
      capacity: w.capacity,
      attendanceDiscountPercent: w.attendanceDiscountPercent,
      isPublished: w.isPublished,
      registrations: w._count.registrations,
      attended: w.registrations.filter((r) => r.attendedFully).length,
    })),
  };
}

export interface WebinarStats {
  total: number;
  published: number;
  upcoming: number;
  registrations: number;
}
export async function webinarStats(): Promise<WebinarStats> {
  const [total, published, upcoming, regs] = await Promise.all([
    prisma.webinar.count(),
    prisma.webinar.count({ where: { isPublished: true } }),
    prisma.webinar.count({ where: { scheduledStart: { gte: new Date() } } }),
    prisma.webinarRegistration.count(),
  ]);
  return { total, published, upcoming, registrations: regs };
}

export async function getWebinarForEdit(id: string) {
  const w = await prisma.webinar.findUnique({
    where: { id },
    include: {
      registrations: { orderBy: { createdAt: "desc" }, take: 500 },
    },
  });
  if (!w) throw AppError.notFound("Webinar not found.");
  return {
    id: w.id,
    title: w.title,
    slug: w.slug,
    topic: w.topic ?? "",
    agenda: w.agenda ?? "",
    description: w.description ?? "",
    hostName: w.hostName,
    scheduledStart: w.scheduledStart.toISOString(),
    durationMinutes: w.durationMinutes,
    coverImageUrl: w.coverImageUrl ?? "",
    joinUrl: w.joinUrl ?? "",
    capacity: w.capacity,
    isPublished: w.isPublished,
    registrations: w.registrations.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

// ── Public ───────────────────────────────────────────────────────────────────

export async function listPublicWebinars() {
  const rows = await prisma.webinar.findMany({
    where: { isPublished: true },
    orderBy: { scheduledStart: "asc" },
    take: 48,
    include: { _count: { select: { registrations: true } } },
  });
  const now = new Date();
  return rows.map((w) => ({
    id: w.id,
    title: w.title,
    slug: w.slug,
    description: w.description,
    hostName: w.hostName,
    coverImageUrl: w.coverImageUrl,
    scheduledStart: w.scheduledStart.toISOString(),
    durationMinutes: w.durationMinutes,
    registrations: w._count.registrations,
    isPast: w.scheduledStart < now,
  }));
}

export async function getPublicWebinarBySlug(slug: string) {
  const w = await prisma.webinar.findFirst({
    where: { slug, isPublished: true },
    include: { _count: { select: { registrations: true } } },
  });
  if (!w) return null;
  return {
    id: w.id,
    title: w.title,
    slug: w.slug,
    topic: w.topic,
    agenda: w.agenda,
    description: w.description,
    hostName: w.hostName,
    coverImageUrl: w.coverImageUrl,
    scheduledStart: w.scheduledStart.toISOString(),
    durationMinutes: w.durationMinutes,
    joinUrl: w.joinUrl,
    capacity: w.capacity,
    attendanceDiscountPercent: w.attendanceDiscountPercent,
    registrations: w._count.registrations,
    /** Null when uncapped; drives the "seats left" / "full" copy. */
    seatsLeft: w.capacity != null ? Math.max(0, w.capacity - w._count.registrations) : null,
    isFull: w.capacity != null && w._count.registrations >= w.capacity,
  };
}

export async function registerForWebinar(
  webinarId: string,
  input: RegisterWebinarInput,
  userId?: string,
): Promise<{ joinUrl: string | null }> {
  const w = await prisma.webinar.findUnique({
    where: { id: webinarId },
    select: { id: true, isPublished: true, capacity: true, joinUrl: true, _count: { select: { registrations: true } } },
  });
  if (!w || !w.isPublished) throw AppError.notFound("Webinar not found.");
  if (w.capacity != null && w._count.registrations >= w.capacity) {
    throw AppError.badRequest("This webinar is full.");
  }
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.webinarRegistration.findUnique({
    where: { webinarId_email: { webinarId, email } },
    select: { id: true },
  });
  if (!existing) {
    await prisma.webinarRegistration.create({
      data: { webinarId, name: input.name, email, phone: input.phone || null, userId: userId ?? null },
    });
  }
  return { joinUrl: w.joinUrl };
}

// ── Join link ────────────────────────────────────────────────────────────────

/**
 * Give a webinar a working join link without going out to an external meeting
 * provider: create a companion Meeting (`provider: "webinar"`) and point the
 * webinar at its room. Calling this again returns the link already issued, so
 * a second click can't strand registrants on a dead URL.
 */
export async function generateWebinarRoom(
  webinarId: string,
  actingUserId: string,
): Promise<{ joinUrl: string; roomCode: string }> {
  const w = await prisma.webinar.findUnique({
    where: { id: webinarId },
    select: {
      id: true,
      title: true,
      topic: true,
      hostId: true,
      roomCode: true,
      joinUrl: true,
      scheduledStart: true,
      durationMinutes: true,
      capacity: true,
    },
  });
  if (!w) throw AppError.notFound("Webinar not found.");

  if (w.roomCode) {
    return { joinUrl: w.joinUrl ?? `/live/room/${w.roomCode}`, roomCode: w.roomCode };
  }

  const roomCode = await uniqueRoomCode();
  const end = new Date(w.scheduledStart.getTime() + w.durationMinutes * 60_000);
  await prisma.meeting.create({
    data: {
      title: w.title,
      description: w.topic,
      provider: "webinar",
      hostId: w.hostId ?? actingUserId,
      status: "SCHEDULED",
      roomCode,
      scheduledStart: w.scheduledStart,
      scheduledEnd: end,
      maxParticipants: w.capacity,
    },
  });

  const joinUrl = `/live/room/${roomCode}`;
  await prisma.webinar.update({
    where: { id: webinarId },
    data: { roomCode, joinUrl },
  });
  return { joinUrl, roomCode };
}

// ── Participants ─────────────────────────────────────────────────────────────

export interface WebinarParticipant {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  userId: string | null;
  addedByStaff: boolean;
  joinedAt: string | null;
  attendedSeconds: number;
  attendedFully: boolean;
  createdAt: string;
}

/**
 * Everyone on the webinar — self-service registrations from the website and
 * anyone staff added by hand, in one list.
 */
export async function listWebinarParticipants(
  webinarId: string,
): Promise<WebinarParticipant[]> {
  const rows = await prisma.webinarRegistration.findMany({
    where: { webinarId },
    orderBy: [{ attendedFully: "desc" }, { createdAt: "asc" }],
    take: 1000,
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    userId: r.userId,
    addedByStaff: r.addedByStaff,
    joinedAt: r.joinedAt ? r.joinedAt.toISOString() : null,
    attendedSeconds: r.attendedSeconds,
    attendedFully: r.attendedFully,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Add participants after the fact — existing learners picked from the roster,
 * or walk-ins typed in by hand. Anyone already registered is left alone rather
 * than duplicated, and capacity is not enforced here: staff adding a name is a
 * deliberate act, unlike a stranger signing up from the website.
 */
export async function addWebinarParticipants(
  webinarId: string,
  input: WebinarParticipantsInput,
): Promise<number> {
  const w = await prisma.webinar.findUnique({
    where: { id: webinarId },
    select: { id: true, title: true, slug: true, joinUrl: true },
  });
  if (!w) throw AppError.notFound("Webinar not found.");

  const userIds = [...new Set(input.userIds ?? [])];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true, phone: true },
      })
    : [];

  const candidates = [
    ...users.map((u) => ({
      name: u.name,
      email: u.email.trim().toLowerCase(),
      phone: u.phone,
      userId: u.id as string | null,
    })),
    ...(input.guests ?? []).map((g) => ({
      name: g.name,
      email: g.email.trim().toLowerCase(),
      phone: g.phone || null,
      userId: null as string | null,
    })),
  ];
  if (candidates.length === 0) return 0;

  const emails = [...new Set(candidates.map((c) => c.email))];
  const existing = await prisma.webinarRegistration.findMany({
    where: { webinarId, email: { in: emails } },
    select: { email: true },
  });
  const taken = new Set(existing.map((e) => e.email));

  const seen = new Set<string>();
  const fresh = candidates.filter((c) => {
    if (taken.has(c.email) || seen.has(c.email)) return false;
    seen.add(c.email);
    return true;
  });
  if (fresh.length === 0) return 0;

  await prisma.webinarRegistration.createMany({
    data: fresh.map((c) => ({
      webinarId,
      name: c.name,
      email: c.email,
      phone: c.phone,
      userId: c.userId,
      addedByStaff: true,
    })),
  });

  const notifiable = fresh.map((c) => c.userId).filter((id): id is string => Boolean(id));
  if (notifiable.length > 0) {
    await notify({
      userIds: notifiable,
      type: "ANNOUNCEMENT",
      title: "You're on a webinar",
      message: `You've been added to “${w.title}”.`,
      actionUrl: `/webinars/${w.slug}`,
    });
  }
  return fresh.length;
}

export async function removeWebinarParticipant(
  webinarId: string,
  registrationId: string,
): Promise<void> {
  await prisma.webinarRegistration.deleteMany({
    where: { id: registrationId, webinarId },
  });
}

/** Learners to offer in the "add participant" picker. */
export async function listStudentsForWebinarSelect(search?: string) {
  const rows = await prisma.user.findMany({
    where: search
      ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] }
      : {},
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

// ── Attendance ───────────────────────────────────────────────────────────────

/**
 * Heartbeat from the webinar room: `seconds` is how long this viewer has had
 * the room open. Stored as a high-water mark so a refresh (or a second tab)
 * can't inflate the total, and flipped to "attended fully" once it passes
 * `FULL_ATTENDANCE_RATIO` of the scheduled runtime — which is what qualifies
 * someone for the extra discount.
 */
export async function recordWebinarAttendance(
  roomCode: string,
  userId: string,
  seconds: number,
): Promise<{ attendedSeconds: number; attendedFully: boolean } | null> {
  const w = await prisma.webinar.findFirst({
    where: { roomCode },
    select: { id: true, durationMinutes: true },
  });
  if (!w) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  if (!user) return null;
  const email = user.email.trim().toLowerCase();

  const reg = await prisma.webinarRegistration.findUnique({
    where: { webinarId_email: { webinarId: w.id, email } },
    select: { id: true, attendedSeconds: true, attendedFully: true, joinedAt: true },
  });

  const threshold = Math.round(w.durationMinutes * 60 * FULL_ATTENDANCE_RATIO);
  const now = new Date();

  if (!reg) {
    // Someone who walked in on the link without registering still counts.
    const created = await prisma.webinarRegistration.create({
      data: {
        webinarId: w.id,
        name: user.name,
        email,
        userId,
        joinedAt: now,
        leftAt: now,
        attendedSeconds: seconds,
        attendedFully: seconds >= threshold,
      },
      select: { attendedSeconds: true, attendedFully: true },
    });
    return created;
  }

  const attendedSeconds = Math.max(reg.attendedSeconds, seconds);
  const attendedFully = attendedSeconds >= threshold;
  await prisma.webinarRegistration.update({
    where: { id: reg.id },
    data: {
      attendedSeconds,
      attendedFully,
      leftAt: now,
      ...(reg.joinedAt ? {} : { joinedAt: now }),
      // Link the account on first attendance if they registered as a guest.
      userId,
    },
  });

  // Crossing the line the first time is what earns the reward.
  if (attendedFully && !reg.attendedFully) {
    await issueAttendanceReward(w.id, userId);
  }
  return { attendedSeconds, attendedFully };
}

/**
 * Make good on the promise the webinar page makes: a single-use personal
 * discount code for anyone who sat through the whole session.
 *
 * Failures here are swallowed — a coupon that could not be written must never
 * take down the attendance record it rewards.
 */
async function issueAttendanceReward(webinarId: string, userId: string): Promise<void> {
  try {
    const w = await prisma.webinar.findUnique({
      where: { id: webinarId },
      select: { title: true, attendanceDiscountPercent: true },
    });
    if (!w || w.attendanceDiscountPercent <= 0) return;

    const code = `WEBINAR${w.attendanceDiscountPercent}-${userId.slice(-6).toUpperCase()}`;
    const existing = await prisma.coupon.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!existing) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90);
      await prisma.coupon.create({
        data: {
          code,
          type: "PERCENTAGE",
          value: w.attendanceDiscountPercent,
          maxUses: 1,
          isActive: true,
          expiresAt,
        },
      });
    }

    await notify({
      userIds: [userId],
      type: "ANNOUNCEMENT",
      title: `Your ${w.attendanceDiscountPercent}% webinar discount`,
      message: `Thanks for attending “${w.title}” in full. Use code ${code} at checkout for ${w.attendanceDiscountPercent}% off any course — valid for 90 days.`,
      actionUrl: "/courses",
    });
  } catch {
    // Best effort: attendance is the record that matters.
  }
}
