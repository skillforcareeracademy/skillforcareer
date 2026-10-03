import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import { ROLES } from "@/config/roles";
import type { BoardListQuery, BoardSlideInput, Stroke } from "@/lib/validations/board";

/**
 * Pages from the on-screen notepad, and the lists they are filed under.
 *
 * An instructor sees and keeps their own pages; staff see everyone's, which is
 * what makes "filter those slides lecture wise or class wise" useful to the
 * office as well as to the person who drew them.
 */

export interface BoardSlideRow {
  id: string;
  title: string;
  strokeCount: number;
  batchId: string | null;
  batchName: string | null;
  meetingId: string | null;
  meetingTitle: string | null;
  courseId: string | null;
  courseTitle: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface Viewer {
  id: string;
  roles: string[];
}

const isStaff = (v: Viewer) =>
  v.roles.some((r) => r === ROLES.SUPER_ADMIN || r === ROLES.ADMIN);

/** Everyone's pages for staff; your own otherwise. */
function scope(viewer: Viewer): Prisma.BoardSlideWhereInput {
  return isStaff(viewer) ? {} : { createdById: viewer.id };
}

const SELECT = {
  id: true,
  title: true,
  strokes: true,
  batchId: true,
  meetingId: true,
  courseId: true,
  createdAt: true,
  updatedAt: true,
  batch: { select: { name: true } },
  meeting: { select: { title: true } },
  course: { select: { title: true } },
  createdBy: { select: { name: true } },
} as const;

type Row = Prisma.BoardSlideGetPayload<{ select: typeof SELECT }>;

function toRow(s: Row): BoardSlideRow {
  return {
    id: s.id,
    title: s.title,
    strokeCount: Array.isArray(s.strokes) ? s.strokes.length : 0,
    batchId: s.batchId,
    batchName: s.batch?.name ?? null,
    meetingId: s.meetingId,
    meetingTitle: s.meeting?.title ?? null,
    courseId: s.courseId,
    courseTitle: s.course?.title ?? null,
    createdByName: s.createdBy.name,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export async function listSlides(
  q: BoardListQuery,
  viewer: Viewer,
): Promise<{ rows: BoardSlideRow[]; total: number }> {
  const and: Prisma.BoardSlideWhereInput[] = [scope(viewer)];
  if (q.batchId) and.push({ batchId: q.batchId });
  if (q.meetingId) and.push({ meetingId: q.meetingId });
  if (q.courseId) and.push({ courseId: q.courseId });
  if (q.search) and.push({ title: { contains: q.search } });

  const where = { AND: and };
  const [rows, total] = await Promise.all([
    prisma.boardSlide.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: SELECT,
    }),
    prisma.boardSlide.count({ where }),
  ]);
  return { rows: rows.map(toRow), total };
}

/** One page, with the strokes needed to draw it again. */
export async function getSlide(
  id: string,
  viewer: Viewer,
): Promise<BoardSlideRow & { strokes: Stroke[] }> {
  const slide = await prisma.boardSlide.findFirst({
    where: { AND: [{ id }, scope(viewer)] },
    select: SELECT,
  });
  if (!slide) throw AppError.notFound("That page is no longer here.");
  return {
    ...toRow(slide),
    strokes: Array.isArray(slide.strokes) ? (slide.strokes as unknown as Stroke[]) : [],
  };
}

export async function createSlide(
  input: BoardSlideInput,
  createdById: string,
): Promise<string> {
  const slide = await prisma.boardSlide.create({
    data: {
      title: input.title,
      strokes: input.strokes as unknown as Prisma.InputJsonValue,
      batchId: input.batchId || null,
      meetingId: input.meetingId || null,
      courseId: input.courseId || null,
      createdById,
    },
    select: { id: true },
  });
  return slide.id;
}

export async function updateSlide(
  id: string,
  input: BoardSlideInput,
  viewer: Viewer,
): Promise<void> {
  const existing = await prisma.boardSlide.findFirst({
    where: { AND: [{ id }, scope(viewer)] },
    select: { id: true },
  });
  if (!existing) throw AppError.notFound("That page is no longer here.");
  await prisma.boardSlide.update({
    where: { id },
    data: {
      title: input.title,
      strokes: input.strokes as unknown as Prisma.InputJsonValue,
      batchId: input.batchId || null,
      meetingId: input.meetingId || null,
      courseId: input.courseId || null,
    },
  });
}

export async function deleteSlide(id: string, viewer: Viewer): Promise<void> {
  const existing = await prisma.boardSlide.findFirst({
    where: { AND: [{ id }, scope(viewer)] },
    select: { id: true },
  });
  if (!existing) throw AppError.notFound("That page is no longer here.");
  await prisma.boardSlide.delete({ where: { id } });
}

/** The batches, courses and classes a sender may file a page under. */
export async function boardFilters(viewer: Viewer) {
  const mine = isStaff(viewer)
    ? {}
    : {
        OR: [
          { instructorId: viewer.id },
          { course: { instructorId: viewer.id } },
          { associates: { some: { userId: viewer.id } } },
        ],
      };

  const [batches, courses, meetings] = await Promise.all([
    prisma.batch.findMany({
      where: mine,
      orderBy: { createdAt: "desc" },
      take: 300,
      select: { id: true, name: true },
    }),
    prisma.course.findMany({
      where: isStaff(viewer) ? {} : { instructorId: viewer.id },
      orderBy: { title: "asc" },
      take: 300,
      select: { id: true, title: true },
    }),
    prisma.meeting.findMany({
      where: isStaff(viewer) ? {} : { hostId: viewer.id },
      orderBy: { scheduledStart: "desc" },
      take: 200,
      select: { id: true, title: true, scheduledStart: true },
    }),
  ]);

  return {
    batches,
    courses,
    meetings: meetings.map((m) => ({
      id: m.id,
      title: `${m.title} · ${m.scheduledStart.toISOString().slice(0, 10)}`,
    })),
  };
}
