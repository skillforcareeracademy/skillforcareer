import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { hashPassword } from "@/lib/auth/password";
import type {
  ListUsersQuery,
  UpdateUserAdminInput,
  CreateUserAdminInput,
} from "@/lib/validations/user";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  status: string;
  role: string;
  roleLabel: string;
  emailVerified: boolean;
  /** Settled fees, so the list answers "have they paid?" without a drill-down. */
  paidTotal: number;
  createdAt: string;
}

export interface UserListResult {
  users: UserRow[];
  total: number;
}

export async function listUsers(q: ListUsersQuery): Promise<UserListResult> {
  const and: Prisma.UserWhereInput[] = [];
  if (q.search) {
    and.push({
      OR: [
        { name: { contains: q.search } },
        { email: { contains: q.search } },
      ],
    });
  }
  if (q.role) and.push({ role: { slug: q.role } });
  if (q.status) {
    and.push({ status: q.status as Prisma.UserWhereInput["status"] });
  }
  const where: Prisma.UserWhereInput = and.length ? { AND: and } : {};

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: { role: true },
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);

  // "Has this student paid?" is the question the admissions team opens this
  // list to answer, so the totals come with the page rather than one query per
  // row. A single grouped read over just the ids on screen keeps it to one
  // extra round-trip however long the page is.
  const paid = await paidTotalsFor(rows.map((u) => u.id));

  return {
    total,
    users: rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      avatarUrl: u.avatarUrl,
      status: u.status,
      role: u.role.slug,
      roleLabel: u.role.name,
      emailVerified: Boolean(u.emailVerified),
      paidTotal: paid.get(u.id) ?? 0,
      createdAt: u.createdAt.toISOString(),
    })),
  };
}

/** Total settled fees per user, for the ids given. */
async function paidTotalsFor(userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.payment.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds }, status: "PAID" },
    _sum: { netAmount: true },
  });
  return new Map(rows.map((r) => [r.userId, r._sum.netAmount?.toNumber() ?? 0]));
}

/** Create a new account from the admin console. Admin-created users are
 *  pre-verified (they skip the email-OTP flow) and default to ACTIVE. */
export async function createUserAdmin(
  input: CreateUserAdminInput,
): Promise<{ id: string }> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) throw AppError.conflict("A user with this email already exists.");

  const role = await prisma.role.findUnique({ where: { slug: input.roleSlug } });
  if (!role) throw AppError.badRequest("Unknown role.");

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      roleId: role.id,
      status: input.status as Prisma.UserUncheckedCreateInput["status"],
      // Admin-provisioned accounts are trusted — no verification email needed.
      emailVerified: new Date(),
    },
    select: { id: true },
  });
  return user;
}

export async function updateUserAdmin(
  id: string,
  input: UpdateUserAdminInput,
): Promise<void> {
  const data: Prisma.UserUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.email !== undefined) {
    const clash = await prisma.user.findFirst({
      where: { email: input.email, id: { not: id } },
      select: { id: true },
    });
    if (clash) throw AppError.conflict("Another user already uses this email.");
    data.email = input.email;
  }
  if (input.status) {
    data.status = input.status as Prisma.UserUncheckedUpdateInput["status"];
  }
  if (input.roleSlug) {
    const role = await prisma.role.findUnique({ where: { slug: input.roleSlug } });
    if (!role) throw AppError.badRequest("Unknown role.");
    data.roleId = role.id;
  }
  // "" means the admin cleared the field, which is a real edit — distinct from
  // the key being absent, which means "don't touch it".
  if (input.internshipStartAt !== undefined) {
    data.internshipStartAt = input.internshipStartAt ? new Date(input.internshipStartAt) : null;
  }
  if (input.internshipEndAt !== undefined) {
    data.internshipEndAt = input.internshipEndAt ? new Date(input.internshipEndAt) : null;
  }
  await prisma.user.update({ where: { id }, data });
}

/** Minimal lookup for the impersonation guard (id, display name, role slug). */
export async function getUserForImpersonation(
  id: string,
): Promise<{ id: string; name: string; role: string } | null> {
  const u = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, role: { select: { slug: true } } },
  });
  return u ? { id: u.id, name: u.name, role: u.role.slug } : null;
}

export async function deleteUserAdmin(
  id: string,
  actingUserId: string,
): Promise<void> {
  if (id === actingUserId) {
    throw AppError.badRequest("You can't delete your own account.");
  }
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) throw AppError.notFound("User not found.");
  await prisma.user.delete({ where: { id } });
}

/** All users matching a filter, flattened for CSV export (no pagination). */
/** `2026-08-28`, or blank. The sheet is read in India; ISO sorts and never
 *  turns into an American date on the way through Excel. */
function day(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

function money(value: Prisma.Decimal | number | null | undefined): string {
  if (value == null) return "";
  return (typeof value === "number" ? value : value.toNumber()).toFixed(2);
}

/**
 * The user list as a full record, one row per person.
 *
 * The old export was seven columns of account fields, which is what the client
 * reported: "when i export user list, i dont get all the field of student
 * profile in sheet. I need to download complete detail of a student." This is
 * the 360 profile flattened — enrolments, cohorts, attendance, assessments,
 * certificates and fees — so a row answers the questions the profile screen
 * does without opening it.
 *
 * Every aggregate is one grouped query across the whole result set rather than
 * a query per user: the database is a region away, and a per-user fan-out over
 * a few hundred learners would take minutes.
 */
export async function usersForExport(q: ListUsersQuery) {
  const and: Prisma.UserWhereInput[] = [];
  if (q.search) and.push({ OR: [{ name: { contains: q.search } }, { email: { contains: q.search } }] });
  if (q.role) and.push({ role: { slug: q.role } });
  if (q.status) and.push({ status: q.status as Prisma.UserWhereInput["status"] });
  const where: Prisma.UserWhereInput = and.length ? { AND: and } : {};

  const rows = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10000,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      headline: true,
      status: true,
      emailVerified: true,
      timezone: true,
      referralCode: true,
      internshipStartAt: true,
      internshipEndAt: true,
      lastLoginAt: true,
      createdAt: true,
      role: { select: { name: true } },
    },
  });

  const userIds = rows.map((u) => u.id);
  if (userIds.length === 0) return { headers: EXPORT_HEADERS, data: [] as string[][] };

  const [
    enrollments,
    attendance,
    quizAttempts,
    submissions,
    certificates,
    payments,
    leads,
  ] = await Promise.all([
    prisma.enrollment.findMany({
      where: { userId: { in: userIds } },
      orderBy: { enrolledAt: "asc" },
      select: {
        userId: true,
        status: true,
        progressPercent: true,
        enrolledAt: true,
        completedAt: true,
        course: { select: { title: true } },
        batch: {
          select: {
            name: true,
            code: true,
            startDate: true,
            endDate: true,
            instructor: { select: { name: true } },
          },
        },
      },
    }),
    prisma.attendance.groupBy({
      by: ["userId", "status"],
      where: { userId: { in: userIds } },
      _count: { _all: true },
    }),
    prisma.quizAttempt.findMany({
      where: { studentId: { in: userIds } },
      select: { studentId: true, status: true, score: true, maxScore: true },
    }),
    prisma.assignmentSubmission.groupBy({
      by: ["studentId", "status"],
      where: { studentId: { in: userIds } },
      _count: { _all: true },
    }),
    prisma.certificate.groupBy({
      by: ["userId", "status"],
      where: { userId: { in: userIds } },
      _count: { _all: true },
    }),
    prisma.payment.findMany({
      where: { userId: { in: userIds } },
      orderBy: { createdAt: "desc" },
      select: {
        userId: true,
        netAmount: true,
        status: true,
        method: true,
        paidAt: true,
        createdAt: true,
      },
    }),
    prisma.lead.findMany({
      where: { convertedUserId: { in: userIds } },
      select: { convertedUserId: true, leadNo: true, source: true, stage: true },
    }),
  ]);

  // ── Index everything by user, once ─────────────────────────────────────────
  const enrolByUser = groupBy(enrollments, (e) => e.userId);
  const quizByUser = groupBy(quizAttempts, (a) => a.studentId);
  const payByUser = groupBy(payments, (p) => p.userId);
  const leadByUser = new Map(
    leads.filter((l) => l.convertedUserId).map((l) => [l.convertedUserId!, l]),
  );

  const attendanceByUser = countsByUser(attendance, (r) => r.userId, (r) => r.status);
  const submissionsByUser = countsByUser(submissions, (r) => r.studentId, (r) => r.status);
  const certsByUser = countsByUser(certificates, (r) => r.userId, (r) => r.status);

  const data = rows.map((u) => {
    const enrols = enrolByUser.get(u.id) ?? [];
    const attend = attendanceByUser.get(u.id) ?? {};
    const subs = submissionsByUser.get(u.id) ?? {};
    const certs = certsByUser.get(u.id) ?? {};
    const quizzes = quizByUser.get(u.id) ?? [];
    const pays = payByUser.get(u.id) ?? [];
    const lead = leadByUser.get(u.id);

    // "Left early" still counts as having turned up.
    const present = attend.PRESENT ?? 0;
    const late = (attend.LATE ?? 0) + (attend.LEFT_EARLY ?? 0);
    const absent = attend.ABSENT ?? 0;
    const marked = present + late + absent;

    const graded = quizzes.filter((a) => a.status === "GRADED" || a.status === "SUBMITTED");
    const quizPercents = graded
      .filter((a) => a.maxScore > 0 && a.score != null)
      .map((a) => (Number(a.score) / a.maxScore) * 100);

    const settled = pays.filter((p) => p.status === "PAID");
    // Money still owed: raised but not settled, and not written off.
    const pending = pays.filter(
      (p) => p.status === "PENDING" || p.status === "PROCESSING",
    );
    const lastPaid = settled[0];

    const avgProgress = enrols.length
      ? Math.round(enrols.reduce((sum, e) => sum + e.progressPercent, 0) / enrols.length)
      : null;

    // "Date of joining": whichever came first — the enrolment or the money.
    const firstEnrolment = enrols[0]?.enrolledAt ?? null;
    const firstPayment = settled.length
      ? settled.reduce<Date>(
          (earliest, p) => {
            const at = p.paidAt ?? p.createdAt;
            return at < earliest ? at : earliest;
          },
          settled[0].paidAt ?? settled[0].createdAt,
        )
      : null;
    const joined =
      firstEnrolment && firstPayment
        ? firstEnrolment < firstPayment
          ? firstEnrolment
          : firstPayment
        : (firstEnrolment ?? firstPayment);

    return [
      u.name,
      u.email,
      u.phone ?? "",
      u.role.name,
      u.status,
      u.emailVerified ? "Yes" : "No",
      u.headline ?? "",
      day(u.createdAt),
      day(joined),
      day(u.lastLoginAt),
      u.timezone,
      u.referralCode ?? "",
      day(u.internshipStartAt),
      day(u.internshipEndAt),

      String(enrols.length),
      enrols.map((e) => e.course.title).join(" | "),
      enrols
        .map((e) => (e.batch ? `${e.batch.name} (${e.batch.code})` : ""))
        .filter(Boolean)
        .join(" | "),
      unique(enrols.map((e) => e.batch?.instructor?.name).filter(Boolean) as string[]).join(" | "),
      day(enrols[0]?.batch?.startDate),
      day(enrols[enrols.length - 1]?.batch?.endDate),
      String(enrols.filter((e) => e.status === "COMPLETED").length),
      avgProgress == null ? "" : String(avgProgress),

      String(marked),
      String(present + late),
      String(absent),
      marked > 0 ? String(Math.round(((present + late) / marked) * 100)) : "",

      String(quizzes.length),
      String(graded.length),
      quizPercents.length
        ? String(Math.round(quizPercents.reduce((a, b) => a + b, 0) / quizPercents.length))
        : "",

      // Drafts aren't submitted; everything else has been handed in.
      String(
        Object.entries(subs)
          .filter(([status]) => status !== "DRAFT")
          .reduce((sum, [, count]) => sum + count, 0),
      ),
      String(subs.GRADED ?? 0),
      String((subs.SUBMITTED ?? 0) + (subs.LATE ?? 0) + (subs.RESUBMIT_REQUESTED ?? 0)),

      String(certs.ISSUED ?? 0),
      String(certs.REVOKED ?? 0),

      money(settled.reduce((sum, p) => sum + p.netAmount.toNumber(), 0)),
      money(pending.reduce((sum, p) => sum + p.netAmount.toNumber(), 0)),
      String(pays.length),
      day(lastPaid?.paidAt ?? lastPaid?.createdAt),
      lastPaid?.method ?? "",

      lead?.leadNo ?? "",
      lead?.source ?? "",
      lead?.stage ?? "",
    ];
  });

  return { headers: EXPORT_HEADERS, data };
}

const EXPORT_HEADERS = [
  "Name",
  "Email",
  "Phone",
  "Role",
  "Status",
  "Email verified",
  "Headline",
  "Registered on",
  "Date of joining",
  "Last login",
  "Timezone",
  "Referral code",
  "Internship from",
  "Internship to",

  "Enrolments",
  "Courses",
  "Batches",
  "Instructors",
  "Batch start",
  "Batch end",
  "Courses completed",
  "Average progress %",

  "Classes marked",
  "Present",
  "Absent",
  "Attendance %",

  "Quiz attempts",
  "Quizzes completed",
  "Quiz average %",

  "Assignments submitted",
  "Assignments graded",
  "Assignments pending",

  "Certificates issued",
  "Certificates revoked",

  "Fees paid",
  "Fees pending",
  "Payments",
  "Last payment on",
  "Last payment method",

  "Lead no",
  "Lead source",
  "Lead stage",
];

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

/** `groupBy` rows → `{ userId → { STATUS: count } }`. */
function countsByUser<T extends { _count: { _all: number } }>(
  rows: T[],
  userId: (row: T) => string,
  status: (row: T) => string,
): Map<string, Record<string, number>> {
  const map = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const id = userId(row);
    const bucket = map.get(id) ?? {};
    bucket[status(row)] = (bucket[status(row)] ?? 0) + row._count._all;
    map.set(id, bucket);
  }
  return map;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
