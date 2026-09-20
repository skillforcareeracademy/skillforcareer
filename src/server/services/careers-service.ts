import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { logger } from "@/lib/logger";
import { saveUpload } from "@/lib/storage";
import { sendMail } from "@/lib/mail/mailer";
import {
  applicationReceivedEmail,
  newApplicationAdminEmail,
  type ApplicationMailData,
} from "@/lib/mail/templates/careers";
import { siteConfig } from "@/config/site";
import { PERMISSIONS } from "@/config/roles";
import {
  APPLICATIONS_PER_EMAIL_PER_DAY,
  CANDIDATE_STATUSES,
  CANDIDATE_STATUS_LABELS,
  CV_MAX_BYTES,
  CV_MAX_LABEL,
  EXPERIENCE_LEVEL_LABELS,
  JOB_MODES,
  JOB_MODE_LABELS,
  OTHER_COURSE,
  type CandidateStatus,
  type CandidateUpdateInput,
  type ExperienceLevel,
  type HiringPostInput,
  type HiringPostUpdateInput,
  type JobApplicationInput,
  type JobMode,
  type PartnerInput,
  type PartnerUpdateInput,
} from "@/lib/validations/careers";
import { logActivity } from "./activity-service";
import { notify, staffUserIds } from "./notification-service";
import { clearMemo, readMemo, writeMemo } from "./memo";

/**
 * Careers & placements.
 *
 * The client's ask, in three parts: CVs from the careers page should land in
 * the system rather than an inbox; each candidate should be tracked through the
 * placement partners who help place them and the hiring partners who hire them,
 * down to "placed or not"; and hiring partners carry the posts they're filling.
 *
 * Partner and post tables are small (dozens of rows), so the admin screens load
 * them whole and the candidate list carries only ids — names are joined up in
 * memory instead of costing a query per relation on every page of candidates.
 */

const TIMELINE_ENTITY = "JobApplication";
const OPEN_ROLES_MEMO = "careers:open-roles";
const OPEN_ROLES_TTL_MS = 5 * 60_000;

const blank = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

const absolute = (url: string | null): string | null =>
  !url ? null : url.startsWith("/") ? `${siteConfig.url}${url}` : url;

// ── Public: the "Send your CV" form ─────────────────────────────────────────

export interface CourseOption {
  id: string;
  title: string;
}

/** Published courses, for the form's course picker. */
export async function listApplyCourses(): Promise<CourseOption[]> {
  return prisma.course.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
}

export interface ApplicantPrefill {
  name: string;
  email: string;
  phone: string;
  /** Newest first. The batch is what the certificate printed, when there is one. */
  enrolments: { courseId: string; courseTitle: string; batchCode: string | null }[];
}

/**
 * What a signed-in learner has already told us, so the form doesn't make them
 * type it again. One join for the enrolments — a nested include would be a
 * query per relation level.
 */
export async function getApplicantPrefill(userId: string): Promise<ApplicantPrefill | null> {
  const [user, enrolments, certificates] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, phone: true },
    }),
    prisma.$queryRaw<
      { courseId: string; courseTitle: string; batchCode: string | null }[]
    >`
      SELECT e.courseId AS courseId, c.title AS courseTitle, b.code AS batchCode
      FROM \`Enrollment\` e
      JOIN \`Course\` c ON c.id = e.courseId
      LEFT JOIN \`Batch\` b ON b.id = e.batchId
      WHERE e.userId = ${userId}
      ORDER BY e.enrolledAt DESC
    `,
    prisma.certificate.findMany({
      where: { userId, courseId: { not: null } },
      select: { courseId: true, metadata: true },
    }),
  ]);
  if (!user) return null;

  // The form asks for the batch "as on the certificate", so when one has been
  // issued, its printed batch wins over the enrolment's batch code.
  const printed = new Map<string, string>();
  for (const c of certificates) {
    const batch = (c.metadata as { batchName?: unknown } | null)?.batchName;
    if (c.courseId && typeof batch === "string" && batch.trim()) {
      printed.set(c.courseId, batch.trim());
    }
  }

  return {
    name: user.name,
    email: user.email,
    phone: user.phone ?? "",
    enrolments: enrolments.map((e) => ({
      courseId: e.courseId,
      courseTitle: e.courseTitle,
      batchCode: printed.get(e.courseId) ?? e.batchCode ?? null,
    })),
  };
}

export interface OpenRole {
  id: string;
  title: string;
  company: string;
  level: ExperienceLevel;
  openings: number | null;
  location: string | null;
  mode: JobMode | null;
  salary: string | null;
  description: string | null;
}

/**
 * Open posts at active hiring partners, for the public careers page. No contact
 * details leave this function — applicants go through our form, not around it.
 * Memoised because the careers page is public and the list changes only when an
 * admin saves; every partner/post write clears it.
 */
export async function listOpenRoles(): Promise<OpenRole[]> {
  const cached = readMemo<OpenRole[]>(OPEN_ROLES_MEMO);
  if (cached) return cached;

  const posts = await prisma.hiringPost.findMany({
    where: { isOpen: true, partner: { isActive: true } },
    orderBy: { createdAt: "desc" },
    take: 24,
    select: {
      id: true,
      title: true,
      level: true,
      openings: true,
      location: true,
      mode: true,
      salary: true,
      description: true,
      partner: { select: { name: true } },
    },
  });
  const roles = posts.map((p) => ({
    id: p.id,
    title: p.title,
    company: p.partner.name,
    level: p.level,
    openings: p.openings,
    location: p.location,
    mode: p.mode,
    salary: p.salary,
    description: p.description,
  }));
  writeMemo(OPEN_ROLES_MEMO, roles, OPEN_ROLES_TTL_MS);
  return roles;
}

/** One open role, for the "Applying for …" banner on the form. */
export async function getOpenRole(id: string): Promise<OpenRole | null> {
  return (await listOpenRoles()).find((r) => r.id === id) ?? null;
}

// The first bytes of each format we accept. A file renamed to .pdf is still
// whatever it was, and the people opening these CVs are our partners.
const CV_SIGNATURES: Record<string, number[]> = {
  ".pdf": [0x25, 0x50, 0x44, 0x46], // %PDF
  ".docx": [0x50, 0x4b, 0x03, 0x04], // a zip container
  ".doc": [0xd0, 0xcf, 0x11, 0xe0], // OLE compound file
};

const CV_EXT_FOR_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

/**
 * Work out the CV's real type, or refuse it. It has to be offered as a PDF or
 * Word file (by mime type, or by name — some browsers send Word files with an
 * empty or generic type) *and* its bytes have to be one of those formats. The
 * bytes decide the extension: a .docx saved as "cv.doc" is still a fine CV.
 */
function cvExtension(file: File, bytes: Buffer): string {
  const claimed =
    CV_EXT_FOR_MIME[file.type.split(";")[0].trim()] ??
    /\.(pdf|docx?)$/i.exec(file.name)?.[0].toLowerCase();
  const sniffed = Object.entries(CV_SIGNATURES).find(([, signature]) =>
    signature.every((b, i) => bytes[i] === b),
  )?.[0];
  if (!claimed || !sniffed) {
    throw AppError.badRequest("Your CV must be a PDF or Word document (.pdf, .doc, .docx).");
  }
  return sniffed;
}

export interface SubmittedApplication {
  id: string;
  mail: ApplicationMailData;
  cvUrl: string | null;
}

/**
 * Store a CV submission. Checks run cheapest-first, and the file is written
 * only once everything else has passed, so a refused submission leaves nothing
 * behind in storage.
 */
export async function submitApplication(
  input: JobApplicationInput,
  cv: File,
  userId: string | null,
): Promise<SubmittedApplication> {
  if (cv.size === 0) throw AppError.badRequest("Attach your CV.");
  if (cv.size > CV_MAX_BYTES) {
    throw AppError.badRequest(`Your CV must be under ${CV_MAX_LABEL}.`);
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const wantsCourse = input.courseId !== OTHER_COURSE;
  const [recent, course, post] = await Promise.all([
    prisma.jobApplication.count({
      where: { email: input.email, createdAt: { gte: since } },
    }),
    wantsCourse
      ? prisma.course.findUnique({
          where: { id: input.courseId },
          select: { id: true, title: true },
        })
      : null,
    input.hiringPostId ? getOpenRoleRecord(input.hiringPostId) : null,
  ]);

  if (recent >= APPLICATIONS_PER_EMAIL_PER_DAY) {
    throw AppError.rateLimited(
      "We've already received your CV today. If something changed, try again tomorrow or reply to our confirmation email.",
    );
  }
  if (wantsCourse && !course) {
    throw AppError.badRequest("That course isn't available. Pick it again, or choose Other.");
  }

  const bytes = Buffer.from(await cv.arrayBuffer());
  const ext = cvExtension(cv, bytes);
  const cvUrl = await saveUpload(bytes, ext, cv.name);
  const cvName = cv.name.slice(0, 190) || `cv${ext}`;

  const courseName = course?.title ?? blank(input.courseName);
  const created = await prisma.jobApplication.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      userId,
      courseId: course?.id ?? null,
      courseName,
      batchCode: blank(input.batchCode),
      jobExpecting: input.jobExpecting,
      experienceLevel: input.experienceLevel,
      experienceDetails:
        input.experienceLevel === "EXPERIENCED" ? blank(input.experienceDetails) : null,
      currentAddress: input.currentAddress,
      expectedLocation: input.expectedLocation,
      expectedMode: input.expectedMode,
      joiningAvailability: input.joiningAvailability,
      cvUrl,
      cvName,
      // Applying from an open role files them against it straight away, so the
      // post's candidate count means something from day one.
      hiringPartnerId: post?.partnerId ?? null,
      hiringPostId: post?.id ?? null,
    },
    select: { id: true },
  });

  return {
    id: created.id,
    cvUrl,
    mail: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      course: courseName,
      batchCode: blank(input.batchCode),
      jobExpecting: input.jobExpecting,
      experience: EXPERIENCE_LEVEL_LABELS[input.experienceLevel],
      experienceDetails:
        input.experienceLevel === "EXPERIENCED" ? blank(input.experienceDetails) : null,
      currentAddress: input.currentAddress,
      expectedLocation: input.expectedLocation,
      expectedMode: JOB_MODE_LABELS[input.expectedMode],
      joiningAvailability: input.joiningAvailability,
      appliedFor: post ? `${post.title} — ${post.company}` : null,
    },
  };
}

/** An open post at an active partner, straight from the table (not the memo). */
async function getOpenRoleRecord(id: string) {
  const post = await prisma.hiringPost.findFirst({
    where: { id, isOpen: true, partner: { isActive: true } },
    select: { id: true, title: true, partnerId: true, partner: { select: { name: true } } },
  });
  // A role that closed while they were filling the form isn't a reason to lose
  // the CV — it just isn't filed against that post.
  return post
    ? { id: post.id, title: post.title, partnerId: post.partnerId, company: post.partner.name }
    : null;
}

/**
 * Everyone who should hear about a new CV: holders of the placements permission.
 * One join — the permission lives on the role, not the user.
 */
async function placementManagerIds(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT u.id AS id
    FROM \`User\` u
    JOIN \`RolePermission\` rp ON rp.roleId = u.roleId
    JOIN \`Permission\` p ON p.id = rp.permissionId
    WHERE p.\`key\` = ${PERMISSIONS.MANAGE_PLACEMENTS} AND u.status = 'ACTIVE'
  `;
  // Before the permission is seeded nobody holds it — fall back to the admins
  // rather than letting the CV arrive unannounced.
  return rows.length ? rows.map((r) => r.id) : staffUserIds();
}

/**
 * Receipt to the applicant, the full submission to the academy inbox, and a
 * bell notification for the placement team. Runs after the response has gone
 * out; every part is best-effort, and none of it can undo the stored CV.
 */
export async function announceApplication(app: SubmittedApplication): Promise<void> {
  const adminPath = `/admin/careers?candidate=${app.id}`;
  const results = await Promise.allSettled([
    sendMail({ to: app.mail.email, ...applicationReceivedEmail(app.mail) }),
    sendMail({
      to: siteConfig.contact.email,
      ...newApplicationAdminEmail({
        ...app.mail,
        cvUrl: absolute(app.cvUrl),
        adminUrl: `${siteConfig.url}${adminPath}`,
      }),
    }),
    placementManagerIds().then((userIds) =>
      notify({
        userIds,
        type: "SYSTEM",
        title: "New CV received",
        message: `${app.mail.name}${app.mail.jobExpecting ? ` — ${app.mail.jobExpecting}` : ""}${app.mail.course ? ` (${app.mail.course})` : ""}`,
        actionUrl: adminPath,
      }),
    ),
  ]);
  for (const r of results) {
    if (r.status === "rejected") {
      logger.warn("careers.announce_failed", {
        applicationId: app.id,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  }
}

// ── Admin: candidates ───────────────────────────────────────────────────────

export interface CandidateListQuery {
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
  level?: string;
  /** A course id, or "other" for CVs not tied to one of our courses. */
  courseId?: string;
  mode?: string;
  location?: string;
  /** A partner id, or "none". */
  placementPartnerId?: string;
  hiringPartnerId?: string;
}

export type CandidateFilters = Omit<CandidateListQuery, "page" | "pageSize">;

const isStatus = (v: string | undefined): v is CandidateStatus =>
  !!v && (CANDIDATE_STATUSES as readonly string[]).includes(v);
const isMode = (v: string | undefined): v is JobMode =>
  !!v && (JOB_MODES as readonly string[]).includes(v);

function candidateWhere(q: CandidateFilters): Prisma.JobApplicationWhereInput {
  const and: Prisma.JobApplicationWhereInput[] = [];
  const search = q.search?.trim();
  if (search) {
    and.push({
      OR: [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
        { jobExpecting: { contains: search } },
        { batchCode: { contains: search } },
        { courseName: { contains: search } },
        { placedCompany: { contains: search } },
      ],
    });
  }
  if (isStatus(q.status)) and.push({ status: q.status });
  if (q.level === "FRESHER" || q.level === "EXPERIENCED") {
    and.push({ experienceLevel: q.level });
  }
  if (q.courseId) {
    and.push(q.courseId === "other" ? { courseId: null } : { courseId: q.courseId });
  }
  if (isMode(q.mode)) and.push({ expectedMode: q.mode });
  if (q.location?.trim()) {
    and.push({ expectedLocation: { contains: q.location.trim() } });
  }
  if (q.placementPartnerId) {
    and.push({
      placementPartnerId: q.placementPartnerId === "none" ? null : q.placementPartnerId,
    });
  }
  if (q.hiringPartnerId) {
    and.push({
      hiringPartnerId: q.hiringPartnerId === "none" ? null : q.hiringPartnerId,
    });
  }
  return and.length ? { AND: and } : {};
}

const CANDIDATE_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  userId: true,
  courseId: true,
  courseName: true,
  batchCode: true,
  jobExpecting: true,
  experienceLevel: true,
  experienceDetails: true,
  currentAddress: true,
  expectedLocation: true,
  expectedMode: true,
  joiningAvailability: true,
  cvUrl: true,
  cvName: true,
  status: true,
  placementPartnerId: true,
  hiringPartnerId: true,
  hiringPostId: true,
  placedAt: true,
  placedCompany: true,
  placedRole: true,
  placedPackage: true,
  adminNotes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.JobApplicationSelect;

type CandidateRecord = Prisma.JobApplicationGetPayload<{ select: typeof CANDIDATE_SELECT }>;

export interface CandidateRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  userId: string | null;
  courseId: string | null;
  courseName: string | null;
  batchCode: string | null;
  jobExpecting: string | null;
  experienceLevel: ExperienceLevel;
  experienceDetails: string | null;
  currentAddress: string | null;
  expectedLocation: string | null;
  expectedMode: JobMode | null;
  joiningAvailability: string | null;
  cvUrl: string | null;
  cvName: string | null;
  status: CandidateStatus;
  placementPartnerId: string | null;
  hiringPartnerId: string | null;
  hiringPostId: string | null;
  placedAt: string | null;
  placedCompany: string | null;
  placedRole: string | null;
  placedPackage: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

function toRow(c: CandidateRecord): CandidateRow {
  return {
    ...c,
    placedAt: c.placedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export async function listCandidates(
  q: CandidateListQuery,
): Promise<{ rows: CandidateRow[]; total: number }> {
  const where = candidateWhere(q);
  const [total, rows] = await Promise.all([
    prisma.jobApplication.count({ where }),
    prisma.jobApplication.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: CANDIDATE_SELECT,
    }),
  ]);
  return { total, rows: rows.map(toRow) };
}

export type StatusCounts = Record<CandidateStatus, number> & { total: number };

/**
 * Candidates per status under every filter *except* status — so the stat cards
 * answer "of the Data Science CVs, how many are placed?" and clicking one
 * narrows the list without the others dropping to zero.
 */
export async function candidateStatusCounts(q: CandidateFilters = {}): Promise<StatusCounts> {
  const grouped = await prisma.jobApplication.groupBy({
    by: ["status"],
    where: candidateWhere({ ...q, status: undefined }),
    _count: { _all: true },
  });
  const counts = Object.fromEntries(CANDIDATE_STATUSES.map((s) => [s, 0])) as Record<
    CandidateStatus,
    number
  >;
  let total = 0;
  for (const g of grouped) {
    counts[g.status] = g._count._all;
    total += g._count._all;
  }
  return { ...counts, total };
}

export interface TimelineEntry {
  id: string;
  description: string;
  by: string | null;
  at: string;
}

export async function getCandidate(
  id: string,
): Promise<CandidateRow & { timeline: TimelineEntry[] }> {
  const [candidate, log] = await Promise.all([
    prisma.jobApplication.findUnique({ where: { id }, select: CANDIDATE_SELECT }),
    prisma.activityLog.findMany({
      where: { entityType: TIMELINE_ENTITY, entityId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        description: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
  ]);
  if (!candidate) throw AppError.notFound("Candidate not found.");

  return {
    ...toRow(candidate),
    timeline: log.map((l) => ({
      id: l.id,
      description: l.description ?? "Updated",
      by: l.user?.name ?? null,
      at: l.createdAt.toISOString(),
    })),
  };
}

/** Partner/post names for the ids a change touches — for the timeline wording. */
async function namesFor(ids: {
  placement: (string | null)[];
  hiring: (string | null)[];
  posts: (string | null)[];
}) {
  const only = (list: (string | null)[]) => [...new Set(list.filter((v): v is string => !!v))];
  const [placement, hiring, posts] = await Promise.all([
    only(ids.placement).length
      ? prisma.placementPartner.findMany({
          where: { id: { in: only(ids.placement) } },
          select: { id: true, name: true },
        })
      : [],
    only(ids.hiring).length
      ? prisma.hiringPartner.findMany({
          where: { id: { in: only(ids.hiring) } },
          select: { id: true, name: true },
        })
      : [],
    only(ids.posts).length
      ? prisma.hiringPost.findMany({
          where: { id: { in: only(ids.posts) } },
          select: { id: true, title: true, partnerId: true },
        })
      : [],
  ]);
  return {
    placement: new Map(placement.map((p) => [p.id, p.name])),
    hiring: new Map(hiring.map((p) => [p.id, p.name])),
    posts: new Map(posts.map((p) => [p.id, p])),
  };
}

/**
 * Move a candidate along. Every change is written to the activity log against
 * the application, which is what the sheet's timeline reads back.
 */
export async function updateCandidate(
  id: string,
  input: CandidateUpdateInput,
  actorId: string,
): Promise<CandidateRow> {
  const existing = await prisma.jobApplication.findUnique({
    where: { id },
    select: CANDIDATE_SELECT,
  });
  if (!existing) throw AppError.notFound("Candidate not found.");

  const next = {
    status: input.status ?? existing.status,
    placementPartnerId:
      input.placementPartnerId !== undefined
        ? input.placementPartnerId
        : existing.placementPartnerId,
    hiringPartnerId:
      input.hiringPartnerId !== undefined ? input.hiringPartnerId : existing.hiringPartnerId,
    hiringPostId: input.hiringPostId !== undefined ? input.hiringPostId : existing.hiringPostId,
    placedAt: input.placedAt !== undefined ? input.placedAt : existing.placedAt,
    placedCompany:
      input.placedCompany !== undefined ? input.placedCompany : existing.placedCompany,
    placedRole: input.placedRole !== undefined ? input.placedRole : existing.placedRole,
    placedPackage:
      input.placedPackage !== undefined ? input.placedPackage : existing.placedPackage,
    adminNotes: input.adminNotes !== undefined ? input.adminNotes : existing.adminNotes,
  };
  // Clearing the company clears its post with it, rather than the post quietly
  // putting the company back.
  if (input.hiringPartnerId === null && input.hiringPostId === undefined) {
    next.hiringPostId = null;
  }

  const names = await namesFor({
    placement: [existing.placementPartnerId, next.placementPartnerId],
    hiring: [existing.hiringPartnerId, next.hiringPartnerId],
    posts: [existing.hiringPostId, next.hiringPostId],
  });

  if (next.placementPartnerId && !names.placement.has(next.placementPartnerId)) {
    throw AppError.badRequest("That placement partner no longer exists.");
  }
  if (next.hiringPostId) {
    const post = names.posts.get(next.hiringPostId);
    if (!post) throw AppError.badRequest("That hiring post no longer exists.");
    // Picking a post implies its company.
    if (!next.hiringPartnerId) next.hiringPartnerId = post.partnerId;
    if (post.partnerId !== next.hiringPartnerId) {
      // A new company without a new post: the old post belonged to the old
      // company, so it goes. A post that contradicts the company chosen in the
      // same save is a mistake worth saying out loud.
      if (input.hiringPostId === undefined) next.hiringPostId = null;
      else throw AppError.badRequest("That post belongs to a different hiring partner.");
    }
  }
  if (next.hiringPartnerId && !names.hiring.has(next.hiringPartnerId)) {
    const exists = await prisma.hiringPartner.findUnique({
      where: { id: next.hiringPartnerId },
      select: { id: true, name: true },
    });
    if (!exists) throw AppError.badRequest("That hiring partner no longer exists.");
    names.hiring.set(exists.id, exists.name);
  }

  if (next.status === "PLACED" && (!next.placedCompany || !next.placedAt)) {
    throw AppError.validation(
      "To mark a candidate placed, add the company and the date they were placed.",
    );
  }

  // Plain-English change list for the timeline.
  const changes: string[] = [];
  const label = (v: string | null | undefined) => v || "—";
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  if (next.status !== existing.status) {
    changes.push(
      `Status: ${CANDIDATE_STATUS_LABELS[existing.status]} → ${CANDIDATE_STATUS_LABELS[next.status]}`,
    );
  }
  if (next.placementPartnerId !== existing.placementPartnerId) {
    changes.push(
      `Placement partner: ${label(names.placement.get(existing.placementPartnerId ?? ""))} → ${label(names.placement.get(next.placementPartnerId ?? ""))}`,
    );
  }
  if (next.hiringPartnerId !== existing.hiringPartnerId) {
    changes.push(
      `Hiring partner: ${label(names.hiring.get(existing.hiringPartnerId ?? ""))} → ${label(names.hiring.get(next.hiringPartnerId ?? ""))}`,
    );
  }
  if (next.hiringPostId !== existing.hiringPostId) {
    changes.push(
      `Post: ${label(names.posts.get(existing.hiringPostId ?? "")?.title)} → ${label(names.posts.get(next.hiringPostId ?? "")?.title)}`,
    );
  }
  if (
    day(next.placedAt) !== day(existing.placedAt) ||
    next.placedCompany !== existing.placedCompany ||
    next.placedRole !== existing.placedRole ||
    next.placedPackage !== existing.placedPackage
  ) {
    const bits = [
      next.placedCompany,
      next.placedRole,
      next.placedPackage,
      day(next.placedAt),
    ].filter(Boolean);
    changes.push(`Placement details: ${bits.length ? bits.join(" · ") : "cleared"}`);
  }
  if (next.adminNotes !== existing.adminNotes) changes.push("Notes updated");

  if (!changes.length) return toRow(existing);

  // JobApplication is referenced by nothing, so a plain update costs one
  // statement here — none of the relation-emulation reads a User update pays.
  const updated = await prisma.jobApplication.update({
    where: { id },
    data: next,
    select: CANDIDATE_SELECT,
  });

  await logActivity({
    userId: actorId,
    action: "careers.candidate.update",
    entityType: TIMELINE_ENTITY,
    entityId: id,
    description: changes.join(" · "),
  });

  return toRow(updated);
}

export async function deleteCandidate(id: string): Promise<void> {
  const existing = await prisma.jobApplication.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw AppError.notFound("Candidate not found.");
  await prisma.jobApplication.delete({ where: { id } });
}

/** The filtered list as CSV rows, partner and post names resolved. */
export async function candidatesForExport(q: CandidateFilters): Promise<{
  headers: string[];
  data: (string | number | null)[][];
}> {
  const [rows, placement, hiring, posts] = await Promise.all([
    prisma.jobApplication.findMany({
      where: candidateWhere(q),
      orderBy: { createdAt: "desc" },
      take: 10_000,
      select: CANDIDATE_SELECT,
    }),
    prisma.placementPartner.findMany({ select: { id: true, name: true } }),
    prisma.hiringPartner.findMany({ select: { id: true, name: true } }),
    prisma.hiringPost.findMany({ select: { id: true, title: true } }),
  ]);
  const placementName = new Map(placement.map((p) => [p.id, p.name]));
  const hiringName = new Map(hiring.map((p) => [p.id, p.name]));
  const postTitle = new Map(posts.map((p) => [p.id, p.title]));
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

  return {
    headers: [
      "Received",
      "Name",
      "Email",
      "Phone",
      "Course",
      "Batch",
      "Job expecting",
      "Fresher / Experienced",
      "Experience details",
      "Current address",
      "Expected location",
      "Expected mode",
      "Can join",
      "Status",
      "Placement partner",
      "Hiring partner",
      "Hiring post",
      "Placed on",
      "Placed company",
      "Placed role",
      "Package",
      "CV",
      "Admin notes",
    ],
    data: rows.map((c) => [
      day(c.createdAt),
      c.name,
      c.email,
      c.phone,
      c.courseName,
      c.batchCode,
      c.jobExpecting,
      EXPERIENCE_LEVEL_LABELS[c.experienceLevel],
      c.experienceDetails,
      c.currentAddress,
      c.expectedLocation,
      c.expectedMode ? JOB_MODE_LABELS[c.expectedMode] : "",
      c.joiningAvailability,
      CANDIDATE_STATUS_LABELS[c.status],
      c.placementPartnerId ? (placementName.get(c.placementPartnerId) ?? "") : "",
      c.hiringPartnerId ? (hiringName.get(c.hiringPartnerId) ?? "") : "",
      c.hiringPostId ? (postTitle.get(c.hiringPostId) ?? "") : "",
      day(c.placedAt),
      c.placedCompany,
      c.placedRole,
      c.placedPackage,
      absolute(c.cvUrl),
      c.adminNotes,
    ]),
  };
}

/** Every course, for the admin course filter — CVs can name unpublished ones. */
export async function listCandidateCourses(): Promise<CourseOption[]> {
  return prisma.course.findMany({
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
}

// ── Admin: partners ─────────────────────────────────────────────────────────

export interface PartnerRow {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  /** Candidates assigned to this partner, any status. */
  candidates: number;
  /** Of those, how many are placed. */
  placed: number;
}

export interface HiringPostRow {
  id: string;
  partnerId: string;
  title: string;
  level: ExperienceLevel;
  openings: number | null;
  location: string | null;
  mode: JobMode | null;
  salary: string | null;
  description: string | null;
  isOpen: boolean;
  createdAt: string;
  candidates: number;
  placed: number;
}

export interface HiringPartnerRow extends PartnerRow {
  posts: HiringPostRow[];
}

const PARTNER_SELECT = {
  id: true,
  name: true,
  contactPerson: true,
  email: true,
  phone: true,
  website: true,
  city: true,
  notes: true,
  isActive: true,
  createdAt: true,
} as const;

/** Fold (id, status, count) groups into total + placed per id. */
function tally(
  groups: { id: string | null; status: CandidateStatus; count: number }[],
): Map<string, { candidates: number; placed: number }> {
  const out = new Map<string, { candidates: number; placed: number }>();
  for (const g of groups) {
    if (!g.id) continue;
    const t = out.get(g.id) ?? { candidates: 0, placed: 0 };
    t.candidates += g.count;
    if (g.status === "PLACED") t.placed += g.count;
    out.set(g.id, t);
  }
  return out;
}

export async function listPlacementPartners(): Promise<PartnerRow[]> {
  const [partners, groups] = await Promise.all([
    prisma.placementPartner.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: PARTNER_SELECT,
    }),
    prisma.jobApplication.groupBy({
      by: ["placementPartnerId", "status"],
      where: { placementPartnerId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const counts = tally(
    groups.map((g) => ({ id: g.placementPartnerId, status: g.status, count: g._count._all })),
  );
  return partners.map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    ...(counts.get(p.id) ?? { candidates: 0, placed: 0 }),
  }));
}

export async function listHiringPartners(): Promise<HiringPartnerRow[]> {
  const [partners, posts, byPartner, byPost] = await Promise.all([
    prisma.hiringPartner.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: PARTNER_SELECT,
    }),
    prisma.hiringPost.findMany({
      orderBy: [{ isOpen: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        partnerId: true,
        title: true,
        level: true,
        openings: true,
        location: true,
        mode: true,
        salary: true,
        description: true,
        isOpen: true,
        createdAt: true,
      },
    }),
    prisma.jobApplication.groupBy({
      by: ["hiringPartnerId", "status"],
      where: { hiringPartnerId: { not: null } },
      _count: { _all: true },
    }),
    prisma.jobApplication.groupBy({
      by: ["hiringPostId", "status"],
      where: { hiringPostId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const partnerCounts = tally(
    byPartner.map((g) => ({ id: g.hiringPartnerId, status: g.status, count: g._count._all })),
  );
  const postCounts = tally(
    byPost.map((g) => ({ id: g.hiringPostId, status: g.status, count: g._count._all })),
  );

  const postsByPartner = new Map<string, HiringPostRow[]>();
  for (const p of posts) {
    const list = postsByPartner.get(p.partnerId) ?? [];
    list.push({
      ...p,
      createdAt: p.createdAt.toISOString(),
      ...(postCounts.get(p.id) ?? { candidates: 0, placed: 0 }),
    });
    postsByPartner.set(p.partnerId, list);
  }

  return partners.map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    ...(partnerCounts.get(p.id) ?? { candidates: 0, placed: 0 }),
    posts: postsByPartner.get(p.id) ?? [],
  }));
}

/** Partner form → columns. `undefined` leaves a column alone on update. */
function partnerData(input: PartnerUpdateInput) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  for (const key of ["contactPerson", "email", "phone", "website", "city", "notes"] as const) {
    if (input[key] !== undefined) data[key] = blank(input[key]);
  }
  if (input.isActive !== undefined) data.isActive = input.isActive;
  return data;
}

export async function createPlacementPartner(input: PartnerInput): Promise<string> {
  const row = await prisma.placementPartner.create({
    data: partnerData(input) as Prisma.PlacementPartnerCreateInput,
    select: { id: true },
  });
  return row.id;
}

export async function updatePlacementPartner(id: string, input: PartnerUpdateInput): Promise<void> {
  const { count } = await prisma.placementPartner.updateMany({
    where: { id },
    data: partnerData(input) as Prisma.PlacementPartnerUpdateManyMutationInput,
  });
  if (!count) throw AppError.notFound("Placement partner not found.");
}

/**
 * Candidates who were with this partner keep their record — only the link is
 * cleared. One raw statement for the unlink rather than trusting the emulated
 * SetNull, whose cost grows with the number of candidates.
 */
export async function deletePlacementPartner(id: string): Promise<void> {
  const existing = await prisma.placementPartner.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw AppError.notFound("Placement partner not found.");
  await prisma.$executeRaw`
    UPDATE \`JobApplication\` SET placementPartnerId = NULL, updatedAt = NOW(3)
    WHERE placementPartnerId = ${id}
  `;
  await prisma.placementPartner.delete({ where: { id } });
}

export async function createHiringPartner(input: PartnerInput): Promise<string> {
  const row = await prisma.hiringPartner.create({
    data: partnerData(input) as Prisma.HiringPartnerCreateInput,
    select: { id: true },
  });
  clearMemo(OPEN_ROLES_MEMO);
  return row.id;
}

export async function updateHiringPartner(id: string, input: PartnerUpdateInput): Promise<void> {
  const { count } = await prisma.hiringPartner.updateMany({
    where: { id },
    data: partnerData(input) as Prisma.HiringPartnerUpdateManyMutationInput,
  });
  if (!count) throw AppError.notFound("Hiring partner not found.");
  // Deactivating a partner takes its posts off the public page.
  clearMemo(OPEN_ROLES_MEMO);
}

/** The partner, its posts, and the candidates' links to either. */
export async function deleteHiringPartner(id: string): Promise<void> {
  const existing = await prisma.hiringPartner.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw AppError.notFound("Hiring partner not found.");
  await prisma.$executeRaw`
    UPDATE \`JobApplication\`
    SET hiringPartnerId = NULL, hiringPostId = NULL, updatedAt = NOW(3)
    WHERE hiringPartnerId = ${id}
       OR hiringPostId IN (SELECT id FROM \`HiringPost\` WHERE partnerId = ${id})
  `;
  await prisma.$executeRaw`DELETE FROM \`HiringPost\` WHERE partnerId = ${id}`;
  await prisma.hiringPartner.delete({ where: { id } });
  clearMemo(OPEN_ROLES_MEMO);
}

function postData(input: HiringPostUpdateInput) {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.level !== undefined) data.level = input.level;
  if (input.openings !== undefined) data.openings = input.openings;
  if (input.mode !== undefined) data.mode = input.mode ?? null;
  for (const key of ["location", "salary", "description"] as const) {
    if (input[key] !== undefined) data[key] = blank(input[key]);
  }
  if (input.isOpen !== undefined) data.isOpen = input.isOpen;
  return data;
}

export async function createHiringPost(partnerId: string, input: HiringPostInput): Promise<string> {
  const partner = await prisma.hiringPartner.findUnique({
    where: { id: partnerId },
    select: { id: true },
  });
  if (!partner) throw AppError.notFound("Hiring partner not found.");
  const row = await prisma.hiringPost.create({
    data: { ...postData(input), partnerId } as Prisma.HiringPostUncheckedCreateInput,
    select: { id: true },
  });
  clearMemo(OPEN_ROLES_MEMO);
  return row.id;
}

export async function updateHiringPost(id: string, input: HiringPostUpdateInput): Promise<void> {
  const { count } = await prisma.hiringPost.updateMany({
    where: { id },
    data: postData(input) as Prisma.HiringPostUpdateManyMutationInput,
  });
  if (!count) throw AppError.notFound("Post not found.");
  clearMemo(OPEN_ROLES_MEMO);
}

export async function deleteHiringPost(id: string): Promise<void> {
  const existing = await prisma.hiringPost.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw AppError.notFound("Post not found.");
  await prisma.$executeRaw`
    UPDATE \`JobApplication\` SET hiringPostId = NULL, updatedAt = NOW(3)
    WHERE hiringPostId = ${id}
  `;
  await prisma.hiringPost.delete({ where: { id } });
  clearMemo(OPEN_ROLES_MEMO);
}
