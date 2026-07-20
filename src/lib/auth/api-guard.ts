import { getCurrentSession } from "./session";
import { getMe, type PublicUser } from "@/server/services/auth-service";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { ROLES, PERMISSIONS, type Permission } from "@/config/roles";

/**
 * Authentication/authorization guards for API route handlers.
 * Throw typed AppErrors that `withRoute` maps to 401/403 responses.
 */
export async function getSessionUser(): Promise<PublicUser | null> {
  const session = await getCurrentSession();
  if (!session) return null;
  return getMe(session.sub);
}

export async function requireApiUser(): Promise<PublicUser> {
  const user = await getSessionUser();
  if (!user) throw AppError.unauthorized("Not authenticated.");
  return user;
}

export async function requireApiPermission(
  permission: Permission,
): Promise<PublicUser> {
  const user = await requireApiUser();
  if (!user.permissions.includes(permission)) {
    throw AppError.forbidden("You don't have permission to perform this action.");
  }
  return user;
}

/**
 * Guard for writing to a course and its curriculum. Admins with
 * `UPDATE_ANY_COURSE` may edit anything; instructors with `UPDATE_OWN_COURSE`
 * may edit only courses they own. Used by course/chapter/lesson mutations so
 * the same editor serves both /admin and /instructor.
 */
export async function requireCourseWrite(courseId: string): Promise<PublicUser> {
  const user = await requireApiUser();
  if (user.permissions.includes(PERMISSIONS.UPDATE_ANY_COURSE)) return user;
  if (user.permissions.includes(PERMISSIONS.UPDATE_OWN_COURSE)) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { instructorId: true },
    });
    if (course?.instructorId === user.id) return user;
  }
  throw AppError.forbidden("You can only manage your own courses.");
}

/** Manage a certificate: staff anywhere; instructors only for their own courses. */
export async function requireCertificateWrite(certificateId: string): Promise<PublicUser> {
  const user = await requireApiPermission(PERMISSIONS.ISSUE_CERTIFICATE);
  if (isStaffRole(user.role)) return user;
  const cert = await prisma.certificate.findUnique({
    where: { id: certificateId },
    select: { course: { select: { instructorId: true } } },
  });
  if (cert?.course?.instructorId === user.id) return user;
  throw AppError.forbidden("You can only manage certificates for your own courses.");
}

/** Whether a user may moderate a discussion: staff, or the course's instructor. */
export async function canModerateDiscussion(
  user: PublicUser,
  discussionId: string,
): Promise<boolean> {
  if (isStaffRole(user.role)) return true;
  const d = await prisma.discussion.findUnique({
    where: { id: discussionId },
    select: { course: { select: { instructorId: true } } },
  });
  return d?.course?.instructorId === user.id;
}

/** Require moderation rights over a discussion (pin/resolve/staff-reply). */
export async function requireDiscussionModerate(discussionId: string): Promise<PublicUser> {
  const user = await requireApiUser();
  if (await canModerateDiscussion(user, discussionId)) return user;
  throw AppError.forbidden("You can only moderate discussions in your own courses.");
}

/** Staff may manage any batch; instructors only ones they lead. */
export async function requireBatchWrite(batchId: string): Promise<PublicUser> {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_BATCHES);
  if (isStaffRole(user.role)) return user;
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { instructorId: true },
  });
  if (batch?.instructorId === user.id) return user;
  throw AppError.forbidden("You can only manage batches you lead.");
}

/** Staff may manage any live class; instructors only ones they host. */
export async function requireMeetingWrite(meetingId: string): Promise<PublicUser> {
  const user = await requireApiPermission(PERMISSIONS.HOST_LIVE_CLASS);
  if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.ADMIN) return user;
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { hostId: true },
  });
  if (meeting?.hostId === user.id) return user;
  throw AppError.forbidden("You can only manage classes you host.");
}

/** True for platform staff (super admin / admin). */
export function isStaffRole(role: string): boolean {
  return role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN;
}

/** Whether a user owns (teaches) a given course. Staff own everything. */
export async function userOwnsCourse(user: PublicUser, courseId: string | null): Promise<boolean> {
  if (isStaffRole(user.role)) return true;
  if (!courseId) return false;
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { instructorId: true },
  });
  return course?.instructorId === user.id;
}

/** Grade/manage an assignment: staff anywhere; instructors only in their courses. */
export async function requireAssignmentWrite(assignmentId: string): Promise<PublicUser> {
  const user = await requireApiPermission(PERMISSIONS.GRADE_ASSIGNMENT);
  if (isStaffRole(user.role)) return user;
  const a = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { course: { select: { instructorId: true } } },
  });
  if (a?.course?.instructorId === user.id) return user;
  throw AppError.forbidden("You can only manage assignments in your own courses.");
}

/** Manage a quiz: staff anywhere; instructors only ones they created or in their courses. */
export async function requireQuizWrite(quizId: string): Promise<PublicUser> {
  const user = await requireApiPermission(PERMISSIONS.MANAGE_QUIZ);
  if (isStaffRole(user.role)) return user;
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { createdById: true, course: { select: { instructorId: true } } },
  });
  if (quiz && (quiz.createdById === user.id || quiz.course?.instructorId === user.id)) {
    return user;
  }
  throw AppError.forbidden("You can only manage your own quizzes.");
}

/** Grade a submission: staff anywhere; instructors only in their courses. */
export async function requireSubmissionGrade(submissionId: string): Promise<PublicUser> {
  const user = await requireApiPermission(PERMISSIONS.GRADE_ASSIGNMENT);
  if (isStaffRole(user.role)) return user;
  const s = await prisma.assignmentSubmission.findUnique({
    where: { id: submissionId },
    select: { assignment: { select: { course: { select: { instructorId: true } } } } },
  });
  if (s?.assignment.course?.instructorId === user.id) return user;
  throw AppError.forbidden("You can only grade submissions in your own courses.");
}

/** Staff-only (Super Admin / Admin) — for moderation actions without a
 *  dedicated permission (e.g. discussions). */
export async function requireApiStaff(): Promise<PublicUser> {
  const user = await requireApiUser();
  if (user.role !== ROLES.SUPER_ADMIN && user.role !== ROLES.ADMIN) {
    throw AppError.forbidden("Staff only.");
  }
  return user;
}
