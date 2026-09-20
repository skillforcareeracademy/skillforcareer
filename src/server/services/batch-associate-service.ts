import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { activeInstructorWhere } from "@/server/repositories/role-filters";
import { notify } from "./notification-service";

/**
 * Associate instructors: "I also need Associate instructor to be assigned on
 * batch." A batch keeps one lead (`Batch.instructorId`) and can carry any
 * number of associates beside them — people who co-teach the cohort, see it
 * under their own "my batches", and share notes and quizzes with it.
 *
 * `BatchInstructor` has no unique index on (batch, user) — adding one needs a
 * data-loss flag on `db push` — so the pair is kept unique here instead.
 */

export interface BatchPerson {
  userId: string;
  name: string;
  email: string;
  avatar: string | null;
}

export async function listBatchAssociates(
  batchId: string,
): Promise<BatchPerson[]> {
  const rows = await prisma.batchInstructor.findMany({
    where: { batchId },
    orderBy: { createdAt: "asc" },
    select: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });
  return rows.map((r) => ({
    userId: r.user.id,
    name: r.user.name,
    email: r.user.email,
    avatar: r.user.avatarUrl,
  }));
}

/**
 * Instructors who could be added: instructor by main or extra role, active,
 * and not already teaching this batch (as lead or associate).
 */
export async function listAssociateCandidates(
  batchId: string,
  search?: string,
): Promise<BatchPerson[]> {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { instructorId: true },
  });
  if (!batch) throw AppError.notFound("Batch not found.");

  const rows = await prisma.user.findMany({
    where: {
      AND: [
        activeInstructorWhere(),
        { batchesAssisted: { none: { batchId } } },
        ...(batch.instructorId ? [{ id: { not: batch.instructorId } }] : []),
        ...(search
          ? [
              {
                OR: [
                  { name: { contains: search } },
                  { email: { contains: search } },
                ],
              },
            ]
          : []),
      ],
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

/** Every instructor, for the associate picker in the batch form. */
export async function listAssociateOptions(): Promise<
  { id: string; name: string }[]
> {
  return prisma.user.findMany({
    where: activeInstructorWhere(),
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 500,
  });
}

/**
 * Add associate instructors. Anyone who isn't an active instructor, is the
 * batch's lead, or is already an associate is skipped. Returns how many were
 * added.
 */
export async function addBatchAssociates(
  batchId: string,
  userIds: string[],
): Promise<number> {
  const ids = [...new Set(userIds)].filter(Boolean);
  const [batch, eligible, current] = await Promise.all([
    prisma.batch.findUnique({
      where: { id: batchId },
      select: {
        name: true,
        instructorId: true,
        course: { select: { title: true } },
      },
    }),
    prisma.user.findMany({
      where: { AND: [{ id: { in: ids } }, activeInstructorWhere()] },
      select: { id: true },
    }),
    prisma.batchInstructor.findMany({
      where: { batchId },
      select: { userId: true },
    }),
  ]);
  if (!batch) throw AppError.notFound("Batch not found.");

  const taken = new Set(current.map((c) => c.userId));
  const eligibleIds = new Set(eligible.map((u) => u.id));
  const toAdd = ids.filter(
    (id) => eligibleIds.has(id) && id !== batch.instructorId && !taken.has(id),
  );
  if (toAdd.length === 0) {
    if (ids.length > 0 && eligible.length === 0) {
      throw AppError.badRequest(
        "Only active instructors can be associate instructors.",
      );
    }
    return 0;
  }

  await prisma.batchInstructor.createMany({
    data: toAdd.map((userId) => ({ batchId, userId })),
  });

  await notify({
    userIds: toAdd,
    type: "COURSE",
    title: "You're teaching a new batch",
    message: `You've been added as an associate instructor on “${batch.name}” (${batch.course.title}).`,
    actionUrl: `/instructor/batches/${batchId}`,
  });

  return toAdd.length;
}

export async function removeBatchAssociate(
  batchId: string,
  userId: string,
): Promise<void> {
  await prisma.batchInstructor.deleteMany({ where: { batchId, userId } });
}

/**
 * How a user relates to a batch, for page-level access checks: staff see every
 * batch; an instructor sees the ones they lead or assist on.
 */
export async function batchRoleFor(
  batchId: string,
  userId: string,
): Promise<"lead" | "associate" | null> {
  const [batch, associate] = await Promise.all([
    prisma.batch.findUnique({
      where: { id: batchId },
      select: { instructorId: true },
    }),
    prisma.batchInstructor.findFirst({
      where: { batchId, userId },
      select: { id: true },
    }),
  ]);
  if (!batch) return null;
  if (batch.instructorId === userId) return "lead";
  return associate ? "associate" : null;
}
