import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import type { WebinarInput, RegisterWebinarInput } from "@/lib/validations/webinar";

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
    description: input.description || null,
    hostName: input.hostName,
    hostId: hostId ?? null,
    scheduledStart: new Date(input.scheduledStart),
    durationMinutes: input.durationMinutes,
    coverImageUrl: input.coverImageUrl || null,
    joinUrl: input.joinUrl || null,
    capacity: input.capacity ?? null,
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
      include: { _count: { select: { registrations: true } } },
    }),
  ]);
  return {
    total,
    webinars: rows.map((w) => ({
      id: w.id,
      title: w.title,
      slug: w.slug,
      description: w.description ?? "",
      hostName: w.hostName,
      coverImageUrl: w.coverImageUrl ?? "",
      joinUrl: w.joinUrl ?? "",
      scheduledStart: w.scheduledStart.toISOString(),
      durationMinutes: w.durationMinutes,
      capacity: w.capacity,
      isPublished: w.isPublished,
      registrations: w._count.registrations,
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
    description: w.description,
    hostName: w.hostName,
    coverImageUrl: w.coverImageUrl,
    scheduledStart: w.scheduledStart.toISOString(),
    durationMinutes: w.durationMinutes,
    joinUrl: w.joinUrl,
    capacity: w.capacity,
    registrations: w._count.registrations,
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
