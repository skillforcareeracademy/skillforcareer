import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";

// ── Helpers ──────────────────────────────────────────────────────────────────

function randomCode(len: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function uniqueSerial(year: number): Promise<string> {
  for (let i = 0; i < 50; i += 1) {
    const serial = `SFC-${year}-${randomCode(6)}`;
    const clash = await prisma.certificate.findUnique({
      where: { serialNumber: serial },
      select: { id: true },
    });
    if (!clash) return serial;
  }
  return `SFC-${year}-${randomCode(10)}`;
}

async function uniqueVerificationCode(): Promise<string> {
  for (let i = 0; i < 50; i += 1) {
    const code = randomCode(10);
    const clash = await prisma.certificate.findUnique({
      where: { verificationCode: code },
      select: { id: true },
    });
    if (!clash) return code;
  }
  return randomCode(14);
}

// ── Reads ────────────────────────────────────────────────────────────────────

export interface CertificateListQuery {
  page: number;
  pageSize: number;
  search?: string;
  courseId?: string;
  status?: string;
  /** Scope to certificates in one instructor's courses. */
  instructorId?: string;
}

export async function listCertificatesAdmin(q: CertificateListQuery) {
  const and: Prisma.CertificateWhereInput[] = [];
  if (q.search) {
    and.push({
      OR: [
        { serialNumber: { contains: q.search } },
        { verificationCode: { contains: q.search } },
        { user: { name: { contains: q.search } } },
      ],
    });
  }
  if (q.courseId) and.push({ courseId: q.courseId });
  if (q.status) and.push({ status: q.status as Prisma.CertificateWhereInput["status"] });
  if (q.instructorId) and.push({ course: { instructorId: q.instructorId } });
  const where: Prisma.CertificateWhereInput = and.length ? { AND: and } : {};

  const [total, rows] = await Promise.all([
    prisma.certificate.count({ where }),
    prisma.certificate.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        user: { select: { name: true, avatarUrl: true, email: true } },
        course: { select: { title: true } },
      },
    }),
  ]);

  return {
    total,
    certificates: rows.map((c) => ({
      id: c.id,
      serialNumber: c.serialNumber,
      verificationCode: c.verificationCode,
      status: c.status,
      studentName: c.user.name,
      studentEmail: c.user.email,
      studentAvatar: c.user.avatarUrl,
      courseId: c.courseId,
      courseTitle: c.course.title,
      issuedAt: c.issuedAt.toISOString(),
    })),
  };
}

export interface CertificateStats {
  total: number;
  active: number;
  revoked: number;
  recipients: number;
}

export async function certificateStats(instructorId?: string): Promise<CertificateStats> {
  const scope: Prisma.CertificateWhereInput = instructorId ? { course: { instructorId } } : {};
  const [total, active, revoked, byUser] = await Promise.all([
    prisma.certificate.count({ where: scope }),
    prisma.certificate.count({ where: { ...scope, status: "ISSUED" } }),
    prisma.certificate.count({ where: { ...scope, status: "REVOKED" } }),
    prisma.certificate.groupBy({ by: ["userId"], where: scope }),
  ]);
  return { total, active, revoked, recipients: byUser.length };
}

export interface StudentCertificate {
  id: string;
  serialNumber: string;
  verificationCode: string;
  status: string;
  courseTitle: string;
  courseSlug: string;
  categoryName: string | null;
  studentName: string;
  issuedAt: string;
}

/** A learner's own certificates (newest first). */
export async function listStudentCertificates(userId: string): Promise<StudentCertificate[]> {
  const rows = await prisma.certificate.findMany({
    where: { userId },
    orderBy: { issuedAt: "desc" },
    include: {
      user: { select: { name: true } },
      course: { select: { title: true, slug: true, category: { select: { name: true } } } },
    },
  });
  return rows.map((c) => ({
    id: c.id,
    serialNumber: c.serialNumber,
    verificationCode: c.verificationCode,
    status: c.status,
    courseTitle: c.course.title,
    courseSlug: c.course.slug,
    categoryName: c.course.category?.name ?? null,
    studentName: c.user.name,
    issuedAt: c.issuedAt.toISOString(),
  }));
}

/** Public verification — returns the certificate for a code, or null. */
export async function getCertificateByCode(code: string) {
  const c = await prisma.certificate.findUnique({
    where: { verificationCode: code.trim().toUpperCase() },
    include: {
      user: { select: { name: true } },
      course: { select: { title: true } },
    },
  });
  if (!c) return null;
  return {
    serialNumber: c.serialNumber,
    verificationCode: c.verificationCode,
    status: c.status,
    studentName: c.user.name,
    courseTitle: c.course.title,
    issuedAt: c.issuedAt.toISOString(),
  };
}

export async function listUsersForSelect() {
  return prisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
    take: 500,
  });
}

export async function listCoursesForSelect() {
  return prisma.course.findMany({ select: { id: true, title: true }, orderBy: { title: "asc" } });
}

// ── Writes ───────────────────────────────────────────────────────────────────

export async function issueCertificate(userId: string, courseId: string): Promise<string> {
  const [user, course, existing] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } }),
    prisma.course.findUnique({ where: { id: courseId }, select: { id: true, title: true } }),
    prisma.certificate.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { id: true },
    }),
  ]);
  if (!user) throw AppError.badRequest("Learner not found.");
  if (!course) throw AppError.badRequest("Course not found.");
  if (existing) throw AppError.badRequest("This learner already has a certificate for this course.");

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { id: true },
  });

  const year = new Date().getFullYear();
  const [serialNumber, verificationCode] = await Promise.all([
    uniqueSerial(year),
    uniqueVerificationCode(),
  ]);

  const cert = await prisma.certificate.create({
    data: {
      userId,
      courseId,
      enrollmentId: enrollment?.id ?? null,
      serialNumber,
      verificationCode,
      status: "ISSUED",
      metadata: { studentName: user.name, courseTitle: course.title },
    },
    select: { id: true },
  });
  return cert.id;
}

export async function setCertificateStatus(
  id: string,
  status: "ISSUED" | "REVOKED",
): Promise<void> {
  const existing = await prisma.certificate.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Certificate not found.");
  await prisma.certificate.update({ where: { id }, data: { status } });
}

export async function deleteCertificate(id: string): Promise<void> {
  const existing = await prisma.certificate.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Certificate not found.");
  await prisma.certificate.delete({ where: { id } });
}
