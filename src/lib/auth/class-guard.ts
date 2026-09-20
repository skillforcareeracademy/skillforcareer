import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { PERMISSIONS } from "@/config/roles";
import type { PublicUser } from "@/server/services/auth-service";
import { requireApiUser, isStaffRole } from "./api-guard";

/**
 * Guards for running a batch's classes.
 *
 * `requireMeetingWrite` lets an instructor touch only classes they host, which
 * was right while every class was made by hand. Timetabled classes are hosted
 * by the batch's lead instructor, though, and the client wants "the admin or
 * instructor of the batch" to be able to move, cancel or end any of them — so
 * an associate instructor on the batch counts too.
 */

/** Staff, the batch's lead instructor, or one of its associate instructors. */
export async function isBatchTeachingTeam(user: PublicUser, batchId: string): Promise<boolean> {
  if (isStaffRole(user.role)) return true;
  const [batch, associate] = await Promise.all([
    prisma.batch.findUnique({ where: { id: batchId }, select: { instructorId: true } }),
    prisma.batchInstructor.findFirst({
      where: { batchId, userId: user.id },
      select: { id: true },
    }),
  ]);
  return batch?.instructorId === user.id || Boolean(associate);
}

function canRunClasses(user: PublicUser): boolean {
  return (
    user.permissions.includes(PERMISSIONS.HOST_LIVE_CLASS) ||
    user.permissions.includes(PERMISSIONS.MANAGE_BATCHES)
  );
}

/** View or manage a batch's class list and timetable. */
export async function requireBatchClassWrite(batchId: string): Promise<PublicUser> {
  const user = await requireApiUser();
  if (!canRunClasses(user)) {
    throw AppError.forbidden("You don't have permission to perform this action.");
  }
  const exists = await prisma.batch.findUnique({ where: { id: batchId }, select: { id: true } });
  if (!exists) throw AppError.notFound("Batch not found.");
  if (await isBatchTeachingTeam(user, batchId)) return user;
  throw AppError.forbidden("You can only manage classes of batches you teach.");
}

/** Manage one class: staff, its host, or the teaching team of its batch. */
export async function requireClassWrite(meetingId: string): Promise<PublicUser> {
  const user = await requireApiUser();
  if (!canRunClasses(user)) {
    throw AppError.forbidden("You don't have permission to perform this action.");
  }
  if (isStaffRole(user.role)) return user;
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { hostId: true, batchId: true },
  });
  if (!meeting) throw AppError.notFound("Class not found.");
  if (meeting.hostId === user.id) return user;
  if (meeting.batchId && (await isBatchTeachingTeam(user, meeting.batchId))) return user;
  throw AppError.forbidden("You can only manage classes you host or teach.");
}
