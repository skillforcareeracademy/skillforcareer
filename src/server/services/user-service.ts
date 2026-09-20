import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { hashPassword } from "@/lib/auth/password";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail/mailer";
import { emailLayout } from "@/lib/mail/templates/layout";
import { logger } from "@/lib/logger";
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
  /** Roles held besides the primary one — an instructor who also studies. */
  extraRoles: { slug: string; label: string }[];
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
  // A role filter matches the primary role or an extra one: "instructors"
  // includes the student who also teaches.
  if (q.role) {
    and.push({ OR: [{ role: { slug: q.role } }, { extraRoles: { some: { role: { slug: q.role } } } }] });
  }
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
  const ids = rows.map((u) => u.id);
  const [paid, extras] = await Promise.all([paidTotalsFor(ids), extraRolesFor(ids)]);

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
      extraRoles: extras.get(u.id) ?? [],
      emailVerified: Boolean(u.emailVerified),
      paidTotal: paid.get(u.id) ?? 0,
      createdAt: u.createdAt.toISOString(),
    })),
  };
}

/** Extra roles per user, for the ids given — one query for the whole page. */
async function extraRolesFor(userIds: string[]): Promise<Map<string, { slug: string; label: string }[]>> {
  const map = new Map<string, { slug: string; label: string }[]>();
  if (userIds.length === 0) return map;
  const rows = await prisma.$queryRaw<{ userId: string; slug: string; name: string }[]>`
    SELECT ur.userId, r.slug, r.name
    FROM \`UserRole\` ur JOIN \`Role\` r ON r.id = ur.roleId
    WHERE ur.userId IN (${Prisma.join(userIds)})`;
  for (const r of rows) {
    const list = map.get(r.userId) ?? [];
    if (!list.some((x) => x.slug === r.slug)) list.push({ slug: r.slug, label: r.name });
    map.set(r.userId, list);
  }
  return map;
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
    select: { id: true, name: true, role: { select: { slug: true, name: true } } },
  });
  if (existing) {
    // Most often this is the same person being given a second hat — the
    // student who is also going to teach. Hand the admin enough to offer
    // "add the role to their account instead" rather than a dead end.
    const extras = (await extraRolesFor([existing.id])).get(existing.id) ?? [];
    throw new AppError("CONFLICT", "A user with this email already exists.", {
      existing: {
        id: existing.id,
        name: existing.name,
        role: existing.role.slug,
        roleLabel: existing.role.name,
        extraRoles: extras,
      },
    });
  }

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
  await sendWelcomeEmail({ name: input.name, email: input.email, roleLabel: role.name });
  return user;
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * "Your account is ready" for an account an admin made. It never carries the
 * password: the person signs in with the one they were given, or with an
 * emailed code from the sign-in page, which needs nothing but this inbox.
 * A mail failure is logged, never thrown — the account exists either way.
 */
export async function sendWelcomeEmail(input: { name: string; email: string; roleLabel: string }): Promise<void> {
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  const name = escapeHtml(input.name);
  const html = emailLayout({
    heading: "Your account is ready",
    previewText: `Welcome to Skill For Career, ${input.name}`,
    bodyHtml: `
      <p>Hi ${name},</p>
      <p>An account has been created for you on Skill For Career as <strong>${escapeHtml(input.roleLabel)}</strong>.</p>
      <p>Sign in with <strong>${escapeHtml(input.email)}</strong> and the password your academy gave you — or choose
         <strong>Email code</strong> on the sign-in page and we'll send you a one-time code instead.</p>
      <p style="margin:24px 0">
        <a href="${appUrl}/login" style="background:#e11d48;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Sign in</a>
      </p>
      <p style="color:#666;font-size:13px">The Skill For Career app on Android and iPhone uses the same sign-in.</p>`,
  });
  const text = `Hi ${input.name}, an account has been created for you on Skill For Career as ${input.roleLabel}. Sign in at ${appUrl}/login with ${input.email} and the password your academy gave you, or choose "Email code" to get a one-time code.`;
  try {
    await sendMail({ to: input.email, subject: "Your Skill For Career account is ready", html, text });
  } catch (error) {
    logger.warn("Couldn't send the welcome email", { to: input.email, error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Replace the extra roles a person holds (their primary role is left alone and
 * never duplicated as an extra). The whole set is written each time, so the
 * edit dialog's checkboxes are the truth.
 */
export async function setExtraRoles(userId: string, slugs: string[]): Promise<{ slug: string; label: string }[]> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: { select: { slug: true } } } });
  if (!user) throw AppError.notFound("User not found.");
  const wanted = [...new Set(slugs)].filter((slug) => slug !== user.role.slug);
  const roles = wanted.length
    ? await prisma.role.findMany({ where: { slug: { in: wanted } }, select: { id: true, slug: true, name: true } })
    : [];
  if (roles.length !== wanted.length) throw AppError.badRequest("Unknown role.");
  await prisma.userRole.deleteMany({ where: { userId } });
  if (roles.length) {
    await prisma.userRole.createMany({ data: roles.map((r) => ({ userId, roleId: r.id })) });
  }
  return roles.map((r) => ({ slug: r.slug, label: r.name }));
}

/** Give an existing person one more role (no-op if they already hold it). */
export async function addExtraRole(userId: string, slug: string): Promise<void> {
  const current = (await extraRolesFor([userId])).get(userId) ?? [];
  await setExtraRoles(userId, [...current.map((r) => r.slug), slug]);
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
  // A role filter matches the primary role or an extra one: "instructors"
  // includes the student who also teaches.
  if (q.role) {
    and.push({ OR: [{ role: { slug: q.role } }, { extraRoles: { some: { role: { slug: q.role } } } }] });
  }
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

export interface ImportUsersResult {
  created: number;
  rolesAdded: number;
  skipped: number;
  errors: { row: number; email: string; reason: string }[];
}

/** The template's columns, in order — shared with GET /api/admin/users/template. */
export const USER_IMPORT_COLUMNS = ["name", "email", "phone", "role", "password"] as const;

const HEADER_ALIASES: Record<(typeof USER_IMPORT_COLUMNS)[number], string[]> = {
  name: ["name", "full name", "student name"],
  email: ["email", "email id", "email address", "e-mail"],
  phone: ["phone", "mobile", "phone number", "mobile number", "contact"],
  role: ["role"],
  password: ["password", "temporary password"],
};

/**
 * Bulk-create accounts from a sheet. Rows are handled one by one and a bad row
 * is reported rather than aborting the file, so a mostly-good sheet lands.
 * Accounts are pre-verified and ACTIVE; a row without a password (or with one
 * under 8 characters) makes an account that signs in with an emailed code.
 */
export async function importUsers(input: {
  csv: string;
  defaultRole: string;
  addRoleToExisting: boolean;
  sendWelcome: boolean;
}): Promise<ImportUsersResult> {
  const { parseCsv } = await import("@/lib/csv");
  const { headers, rows } = parseCsv(input.csv);
  if (rows.length === 0) throw AppError.badRequest("The sheet has no rows.");
  if (rows.length > 1000) throw AppError.badRequest("Import at most 1,000 people at a time.");

  const pick = (field: (typeof USER_IMPORT_COLUMNS)[number]) =>
    headers.find((h) => HEADER_ALIASES[field].includes(h.trim().toLowerCase()));
  const col = Object.fromEntries(USER_IMPORT_COLUMNS.map((f) => [f, pick(f)])) as Record<
    (typeof USER_IMPORT_COLUMNS)[number],
    string | undefined
  >;
  if (!col.email) throw AppError.badRequest("The sheet needs an 'email' column.");

  const roles = await prisma.role.findMany({ select: { id: true, slug: true, name: true } });
  const roleFor = (value: string | undefined) => {
    const v = (value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (!v) return roles.find((r) => r.slug === input.defaultRole);
    return roles.find((r) => r.slug.toLowerCase() === v || r.name.toLowerCase().replace(/[\s-]+/g, "_") === v);
  };

  const emails = rows.map((r) => (r[col.email!] ?? "").trim().toLowerCase()).filter(Boolean);
  const existing = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true, role: { select: { slug: true } } },
  });
  const byEmail = new Map(existing.map((u) => [u.email, u]));
  const extras = await extraRolesFor(existing.map((u) => u.id));

  const result: ImportUsersResult = { created: 0, rolesAdded: 0, skipped: 0, errors: [] };
  const seen = new Set<string>();
  for (const [i, row] of rows.entries()) {
    const line = i + 2; // header is line 1
    const email = (row[col.email] ?? "").trim().toLowerCase();
    const name = (col.name ? row[col.name] : "")?.trim() || email.split("@")[0];
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      result.errors.push({ row: line, email, reason: "Not a valid email" });
      continue;
    }
    if (seen.has(email)) {
      result.skipped += 1;
      result.errors.push({ row: line, email, reason: "Appears earlier in the sheet" });
      continue;
    }
    seen.add(email);
    const role = roleFor(col.role ? row[col.role] : undefined);
    if (!role) {
      result.errors.push({ row: line, email, reason: `Unknown role "${row[col.role!]}"` });
      continue;
    }

    const found = byEmail.get(email);
    if (found) {
      const held = [found.role.slug, ...(extras.get(found.id) ?? []).map((r) => r.slug)];
      if (!input.addRoleToExisting || held.includes(role.slug)) {
        result.skipped += 1;
        result.errors.push({ row: line, email, reason: held.includes(role.slug) ? "Already has this role" : "Account already exists" });
        continue;
      }
      await addExtraRole(found.id, role.slug);
      result.rolesAdded += 1;
      continue;
    }

    const password = (col.password ? row[col.password] : "")?.trim() ?? "";
    const phone = (col.phone ? row[col.phone] : "")?.trim() || null;
    try {
      await prisma.user.create({
        data: {
          name: name.slice(0, 120),
          email,
          phone,
          passwordHash: password.length >= 8 ? await hashPassword(password) : null,
          roleId: role.id,
          status: "ACTIVE",
          emailVerified: new Date(),
        },
        select: { id: true },
      });
      result.created += 1;
      if (input.sendWelcome) await sendWelcomeEmail({ name, email, roleLabel: role.name });
    } catch (error) {
      result.errors.push({ row: line, email, reason: error instanceof Error ? error.message.slice(0, 120) : "Couldn't create" });
    }
  }
  return result;
}
