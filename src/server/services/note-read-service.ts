import { prisma } from "@/lib/prisma";

/**
 * Reading time on batch notes.
 *
 * The academy wanted to know not just that a note was shared but that it was
 * read: how long a learner spent with it, how often they came back, and — for
 * an instructor — who in the batch has opened it at all. The learner's reader
 * sends short heartbeats while a note is open and the tab is in front, and each
 * one is added to their row.
 */

/** A single heartbeat's ceiling, so a wedged timer cannot inflate a total. */
const MAX_HEARTBEAT_SECONDS = 120;

/** Add a stretch of reading to this learner's row, creating it on first open. */
export async function recordNoteRead(
  userId: string,
  noteId: string,
  seconds: number,
  opened = false,
): Promise<void> {
  const add = Math.max(0, Math.min(MAX_HEARTBEAT_SECONDS, Math.round(seconds)));
  if (add === 0 && !opened) return;

  // The learner must actually be in the batch the note belongs to — the reader
  // posts an id, and an id is not permission.
  const allowed = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*) AS n
      FROM BatchNote n
      JOIN Enrollment e ON e.batchId = n.batchId
                       AND e.userId = ${userId}
                       AND e.status IN ('ACTIVE', 'COMPLETED')
     WHERE n.id = ${noteId}`;
  if (Number(allowed[0]?.n ?? 0) === 0) return;

  const existing = await prisma.noteRead.findUnique({
    where: { noteId_userId: { noteId, userId } },
    select: { id: true },
  });

  if (!existing) {
    await prisma.noteRead.create({
      data: { noteId, userId, opens: 1, seconds: add },
    });
    return;
  }

  // Raw, because a read row is hot: two heartbeats landing together should add
  // up rather than overwrite one another.
  await prisma.$executeRaw`
    UPDATE NoteRead
       SET seconds = seconds + ${add},
           opens = opens + ${opened ? 1 : 0},
           lastReadAt = NOW()
     WHERE id = ${existing.id}`;
}

export interface NoteReadingSummary {
  /** Notes this learner has opened at least once. */
  notesRead: number;
  /** Notes shared with their batches in total. */
  notesShared: number;
  /** Time spent reading, in seconds. */
  seconds: number;
  lastReadAt: string | null;
}

export async function noteReadingSummary(userId: string): Promise<NoteReadingSummary> {
  const [reads, shared] = await Promise.all([
    prisma.$queryRaw<{ notesRead: bigint; seconds: bigint | null; lastReadAt: Date | null }[]>`
      SELECT COUNT(*) AS notesRead, SUM(seconds) AS seconds, MAX(lastReadAt) AS lastReadAt
        FROM NoteRead
       WHERE userId = ${userId}`,
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(DISTINCT n.id) AS n
        FROM BatchNote n
        JOIN Enrollment e ON e.batchId = n.batchId
                         AND e.userId = ${userId}
                         AND e.status IN ('ACTIVE', 'COMPLETED')`,
  ]);
  const row = reads[0];
  return {
    notesRead: Number(row?.notesRead ?? 0),
    notesShared: Number(shared[0]?.n ?? 0),
    seconds: Number(row?.seconds ?? 0),
    lastReadAt: row?.lastReadAt ? new Date(row.lastReadAt).toISOString() : null,
  };
}

/** Per-learner reading of one note — what an instructor opens to check. */
export interface NoteReader {
  userId: string;
  name: string;
  email: string;
  opens: number;
  seconds: number;
  lastReadAt: string;
}

export async function readersOfNote(noteId: string): Promise<NoteReader[]> {
  const rows = await prisma.noteRead.findMany({
    where: { noteId },
    orderBy: { lastReadAt: "desc" },
    take: 500,
    select: {
      userId: true,
      opens: true,
      seconds: true,
      lastReadAt: true,
      user: { select: { name: true, email: true } },
    },
  });
  return rows.map((r) => ({
    userId: r.userId,
    name: r.user.name,
    email: r.user.email,
    opens: r.opens,
    seconds: r.seconds,
    lastReadAt: r.lastReadAt.toISOString(),
  }));
}

/** Reads per note for a batch — the instructor's overview column. */
export async function readCountsForBatch(
  batchId: string,
): Promise<Record<string, { readers: number; seconds: number }>> {
  const rows = await prisma.$queryRaw<
    { noteId: string; readers: bigint; seconds: bigint | null }[]
  >`
    SELECT r.noteId, COUNT(*) AS readers, SUM(r.seconds) AS seconds
      FROM NoteRead r
      JOIN BatchNote n ON n.id = r.noteId
     WHERE n.batchId = ${batchId}
     GROUP BY r.noteId`;
  const out: Record<string, { readers: number; seconds: number }> = {};
  for (const r of rows) {
    out[r.noteId] = { readers: Number(r.readers), seconds: Number(r.seconds ?? 0) };
  }
  return out;
}
