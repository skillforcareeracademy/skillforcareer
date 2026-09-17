import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { ROLES } from "@/config/roles";

/**
 * Who may enter a live room: the host, any staff (instructor/admin), a learner
 * enrolled in the meeting's course or batch, or a learner individually added to
 * the class. That last case is what lets a hand-picked session — an offline
 * workshop with no course behind it — still hand out a working video link.
 *
 * Lifted out of live-service because two things now ask the question: the room
 * page, and the recording controls — a class's recording defaults to "whoever
 * could have attended", which is exactly this. Here, both can reuse the answer
 * without the two services importing each other.
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
