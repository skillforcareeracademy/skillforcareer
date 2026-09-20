import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import type { BatchNoteInput } from "@/lib/validations/batch-profile";
import { notify } from "./notification-service";

/**
 * Notes and study material shared with a whole batch — a PDF of the slides, a
 * reading list, the link to last week's worksheet. Staff and the batch's
 * instructors write them in the batch profile; the batch's learners read them
 * under "My Learning" and in the app (`GET /api/student/batch-notes`).
 */

export interface BatchNoteRow {
  id: string;
  title: string;
  body: string | null;
  fileUrl: string | null;
  fileName: string | null;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

function clean(input: BatchNoteInput) {
  const fileUrl = input.fileUrl?.trim() || null;
  return {
    title: input.title.trim(),
    body: input.body?.trim() || null,
    fileUrl,
    // A name without a file means nothing; a file without a name falls back to
    // the last segment of its URL.
    fileName: fileUrl
      ? (
          input.fileName?.trim() ||
          decodeURIComponent(fileUrl.split("?")[0].split("/").pop() ?? "")
        ).slice(0, 191) || null
      : null,
  };
}

export async function listBatchNotes(batchId: string): Promise<BatchNoteRow[]> {
  const rows = await prisma.batchNote.findMany({
    where: { batchId },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      title: true,
      body: true,
      fileUrl: true,
      fileName: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { name: true } },
    },
  });
  return rows.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    fileUrl: n.fileUrl,
    fileName: n.fileName,
    authorName: n.createdBy?.name ?? null,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  }));
}

export async function createBatchNote(
  batchId: string,
  input: BatchNoteInput,
  authorId: string,
): Promise<string> {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { name: true },
  });
  if (!batch) throw AppError.notFound("Batch not found.");

  const note = await prisma.batchNote.create({
    data: { batchId, createdById: authorId, ...clean(input) },
    select: { id: true },
  });

  // Let the batch know there's something new to read. Best effort — `notify`
  // never throws.
  const learners = await prisma.enrollment.findMany({
    where: { batchId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { userId: true },
  });
  await notify({
    userIds: learners.map((l) => l.userId),
    type: "COURSE",
    title: "New batch notes",
    message: `“${input.title.trim()}” was shared with ${batch.name}.`,
    actionUrl: "/student/learning#batch-notes",
  });

  return note.id;
}

/** Edit a note, making sure it belongs to the batch named in the URL. */
export async function updateBatchNote(
  batchId: string,
  noteId: string,
  input: BatchNoteInput,
): Promise<void> {
  const note = await prisma.batchNote.findFirst({
    where: { id: noteId, batchId },
    select: { id: true },
  });
  if (!note) throw AppError.notFound("Note not found.");
  await prisma.batchNote.update({ where: { id: noteId }, data: clean(input) });
}

export async function deleteBatchNote(
  batchId: string,
  noteId: string,
): Promise<void> {
  const { count } = await prisma.batchNote.deleteMany({
    where: { id: noteId, batchId },
  });
  if (count === 0) throw AppError.notFound("Note not found.");
}

// ── Learner side ─────────────────────────────────────────────────────────────

export interface StudentBatchNote {
  id: string;
  title: string;
  body: string | null;
  fileUrl: string | null;
  fileName: string | null;
  batchName: string;
  courseTitle: string;
  createdAt: string;
}

/**
 * Notes from every batch the learner currently sits in, newest first. One
 * joined query: the enrolment decides which batches count, so a learner taken
 * off a batch stops seeing its notes straight away.
 */
export async function listStudentBatchNotes(
  userId: string,
): Promise<StudentBatchNote[]> {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      title: string;
      body: string | null;
      fileUrl: string | null;
      fileName: string | null;
      batchName: string;
      courseTitle: string;
      createdAt: Date;
    }[]
  >`
    SELECT n.id, n.title, n.body, n.fileUrl, n.fileName, n.createdAt,
           b.name AS batchName, c.title AS courseTitle
      FROM BatchNote n
      JOIN Batch b ON b.id = n.batchId
      JOIN Course c ON c.id = b.courseId
      JOIN Enrollment e ON e.batchId = n.batchId
                       AND e.userId = ${userId}
                       AND e.status IN ('ACTIVE', 'COMPLETED')
     ORDER BY n.createdAt DESC
     LIMIT 200`;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    fileUrl: r.fileUrl,
    fileName: r.fileName,
    batchName: r.batchName,
    courseTitle: r.courseTitle,
    createdAt: new Date(r.createdAt).toISOString(),
  }));
}
