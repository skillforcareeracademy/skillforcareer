import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

/**
 * Hot-path writes done in raw SQL.
 *
 * The schema runs `relationMode = "prisma"`, so Prisma emulates referential
 * integrity in the client: a single `.update()` fans out into roughly one
 * SELECT per relation before the write lands. Against TiDB Cloud — a region
 * away, ~300 ms per round-trip — `Course` (twelve relations) took **5.4 s** for
 * a one-column increment, which is what blew past the 5 s transaction timeout
 * and made "add students to a batch" fail with a 500.
 *
 * None of the writes here can orphan a row: they touch one scalar column on
 * rows addressed by primary key. One statement, one round-trip, ~300 ms.
 * Anything that *does* change a relationship still goes through Prisma.
 *
 * `updatedAt` is set by hand because `@updatedAt` is applied by Prisma Client,
 * not the database — raw SQL would otherwise leave it stale.
 */

/** `Course.enrollmentCount += by` (never below zero). */
export function bumpCourseEnrollmentCount(
  courseId: string,
  by: number,
): Prisma.PrismaPromise<number> {
  return prisma.$executeRaw`
    UPDATE Course
       SET enrollmentCount = GREATEST(0, enrollmentCount + ${by})
     WHERE id = ${courseId}`;
}

/** `Batch.enrolledCount += by` (never below zero). */
export function bumpBatchEnrolledCount(
  batchId: string,
  by: number,
): Prisma.PrismaPromise<number> {
  return prisma.$executeRaw`
    UPDATE Batch
       SET enrolledCount = GREATEST(0, enrolledCount + ${by})
     WHERE id = ${batchId}`;
}

/** Move existing enrolments onto a batch and reactivate them. */
export function moveEnrollmentsToBatch(
  enrollmentIds: string[],
  batchId: string,
): Prisma.PrismaPromise<number> {
  return prisma.$executeRaw`
    UPDATE Enrollment
       SET batchId = ${batchId}, status = 'ACTIVE', updatedAt = NOW(3)
     WHERE id IN (${Prisma.join(enrollmentIds)})`;
}

/**
 * Take a learner off a batch without touching their enrolment — they keep
 * course access, they just leave the cohort. Returns rows affected.
 */
export function unlinkEnrollmentFromBatch(
  batchId: string,
  userId: string,
): Prisma.PrismaPromise<number> {
  return prisma.$executeRaw`
    UPDATE Enrollment
       SET batchId = NULL, updatedAt = NOW(3)
     WHERE batchId = ${batchId} AND userId = ${userId}`;
}
