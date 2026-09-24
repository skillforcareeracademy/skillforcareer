import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { askAi, aiConfigured, parseAiJson } from "@/lib/ai";
import { draftQuestionsFromNotes, plainText, type DraftStyle } from "@/lib/question-draft";
import { questionSchema, type GenerateQuestionsInput, type QuestionInput, type QuizSourceInput } from "@/lib/validations/quiz";

/**
 * The notes a quiz was prepared from — and drafting its questions out of them.
 *
 * Two features the academy asked for in one place, because they are the same
 * thing seen twice: staff say which notes a paper came from, and the paper can
 * then be drafted from those notes in one click. A draft is always shown for
 * review before anything is written to the quiz.
 */

// ── What can be linked ───────────────────────────────────────────────────────

export interface NoteSourceOption {
  id: string;
  kind: "BATCH_NOTE" | "LESSON";
  title: string;
  /** The batch or course the notes sit in, for telling two "Unit 3" apart. */
  where: string;
  /** Typed notes can be read by the generator; an attached file cannot. */
  readable: boolean;
}

/** Everything a quiz could have been prepared from, newest notes first. */
export async function listNoteSources(instructorId?: string): Promise<NoteSourceOption[]> {
  const [notes, lessons] = await Promise.all([
    prisma.batchNote.findMany({
      where: instructorId
        ? {
            OR: [
              { createdById: instructorId },
              { batch: { course: { instructorId } } },
              { batch: { instructorId } },
              { batch: { associates: { some: { userId: instructorId } } } },
            ],
          }
        : {},
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        body: true,
        fileName: true,
        batch: { select: { name: true } },
      },
    }),
    // Written lessons only: a video's page has no text to read.
    prisma.lesson.findMany({
      where: {
        content: { not: null },
        ...(instructorId ? { chapter: { course: { instructorId } } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        content: true,
        chapter: { select: { title: true, course: { select: { title: true } } } },
      },
    }),
  ]);

  return [
    ...notes.map((n) => ({
      id: n.id,
      kind: "BATCH_NOTE" as const,
      title: n.title,
      where: n.batch.name,
      readable: plainText(n.body ?? "").length > 120,
    })),
    ...lessons.map((l) => ({
      id: l.id,
      kind: "LESSON" as const,
      title: l.title,
      where: `${l.chapter.course.title} · ${l.chapter.title}`,
      readable: plainText(l.content ?? "").length > 120,
    })),
  ];
}

// ── Linking ──────────────────────────────────────────────────────────────────

async function titleFor(input: QuizSourceInput): Promise<{ title: string; text: string | null }> {
  if (input.batchNoteId) {
    const note = await prisma.batchNote.findUnique({
      where: { id: input.batchNoteId },
      select: { title: true, batch: { select: { name: true } } },
    });
    if (!note) throw AppError.notFound("Those notes no longer exist.");
    return { title: `${note.title} · ${note.batch.name}`, text: null };
  }
  if (input.lessonId) {
    const lesson = await prisma.lesson.findUnique({
      where: { id: input.lessonId },
      select: { title: true },
    });
    if (!lesson) throw AppError.notFound("That lesson no longer exists.");
    return { title: lesson.title, text: null };
  }
  return { title: input.title?.trim() || "Pasted notes", text: input.text ?? null };
}

export async function linkQuizSource(quizId: string, input: QuizSourceInput): Promise<string> {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, select: { id: true } });
  if (!quiz) throw AppError.notFound("Quiz not found.");

  // The same notes twice on one quiz says nothing the first row didn't.
  if (input.batchNoteId || input.lessonId) {
    const already = await prisma.quizSource.findFirst({
      where: {
        quizId,
        ...(input.batchNoteId ? { batchNoteId: input.batchNoteId } : { lessonId: input.lessonId }),
      },
      select: { id: true },
    });
    if (already) return already.id;
  }

  const { title, text } = await titleFor(input);
  const row = await prisma.quizSource.create({
    data: {
      quizId,
      batchNoteId: input.batchNoteId || null,
      lessonId: input.lessonId || null,
      title: title.slice(0, 150),
      text,
    },
    select: { id: true },
  });
  return row.id;
}

export async function unlinkQuizSource(quizId: string, sourceId: string): Promise<void> {
  const { count } = await prisma.quizSource.deleteMany({ where: { id: sourceId, quizId } });
  if (count === 0) throw AppError.notFound("Those notes aren't on this quiz.");
}

// ── Reading the notes ────────────────────────────────────────────────────────

interface SourceText {
  title: string;
  text: string;
}

const TOO_THIN =
  "There isn't enough text in those notes to build questions from. Typed notes work; a PDF or image attachment can't be read.";

async function readSource(quizId: string, input: GenerateQuestionsInput): Promise<SourceText> {
  if (input.sourceId) {
    const src = await prisma.quizSource.findFirst({
      where: { id: input.sourceId, quizId },
      select: { title: true, text: true, batchNoteId: true, lessonId: true },
    });
    if (!src) throw AppError.notFound("Those notes aren't on this quiz.");
    if (src.batchNoteId) return readBatchNote(src.batchNoteId);
    if (src.lessonId) return readLesson(src.lessonId);
    const text = plainText(src.text ?? "");
    if (text.length < 200) throw AppError.badRequest(TOO_THIN);
    return { title: src.title, text };
  }
  if (input.batchNoteId) return readBatchNote(input.batchNoteId);
  if (input.lessonId) return readLesson(input.lessonId);

  const pasted = plainText(input.text ?? "");
  if (pasted.length < 200) throw AppError.badRequest(TOO_THIN);
  return { title: "Pasted notes", text: pasted };
}

async function readBatchNote(id: string): Promise<SourceText> {
  const note = await prisma.batchNote.findUnique({
    where: { id },
    select: { title: true, body: true, batch: { select: { name: true } } },
  });
  if (!note) throw AppError.notFound("Those notes no longer exist.");
  const text = plainText(`${note.title}\n${note.body ?? ""}`);
  if (text.length < 200) throw AppError.badRequest(TOO_THIN);
  return { title: `${note.title} · ${note.batch.name}`, text };
}

async function readLesson(id: string): Promise<SourceText> {
  const lesson = await prisma.lesson.findUnique({
    where: { id },
    select: { title: true, content: true },
  });
  if (!lesson) throw AppError.notFound("That lesson no longer exists.");
  const text = plainText(`${lesson.title}\n${lesson.content ?? ""}`);
  if (text.length < 200) throw AppError.badRequest(TOO_THIN);
  return { title: lesson.title, text };
}

// ── Drafting ─────────────────────────────────────────────────────────────────

const SYSTEM = [
  "You write exam questions for a vocational academy from the teacher's own notes.",
  "Use only facts stated in the notes. Never invent a fact, a code or a figure.",
  "Answer with JSON only: an array of questions, no prose and no code fences.",
  'Each question is {"type","text","points","explanation","options":[{"text","isCorrect"}]}.',
  'type is "SINGLE_CHOICE", "MULTIPLE_CHOICE" or "TRUE_FALSE".',
  "SINGLE_CHOICE has exactly four options and exactly one correct.",
  "MULTIPLE_CHOICE has four or five options and two or three correct.",
  'TRUE_FALSE has exactly the two options "True" and "False", one correct.',
  "points is 1. explanation quotes the sentence from the notes that proves the answer.",
  "Wrong options must be plausible and drawn from the notes' own vocabulary.",
].join(" ");

export interface GeneratedDraft {
  questions: QuestionInput[];
  /** Which engine wrote them — the dialog says so, and so does the log. */
  engine: "model" | "builtin";
  sourceTitle: string;
  notice: string | null;
}

/**
 * Draft questions from notes: the configured model first, the built-in reader
 * if there is no model or it doesn't answer usefully. Either way the caller
 * gets questions in exactly the shape the question editor takes.
 */
export async function generateQuizQuestions(
  quizId: string,
  input: GenerateQuestionsInput,
): Promise<GeneratedDraft> {
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, select: { id: true } });
  if (!quiz) throw AppError.notFound("Quiz not found.");

  const source = await readSource(quizId, input);
  const style = input.style as DraftStyle;

  let questions: QuestionInput[] = [];
  let engine: GeneratedDraft["engine"] = "builtin";
  let notice: string | null = null;

  if (aiConfigured()) {
    const styleLine =
      style === "MIXED"
        ? "Mix the three types."
        : `Every question must be of type ${style}.`;
    const reply = await askAi({
      system: SYSTEM,
      prompt: [
        `Write ${input.count} question${input.count === 1 ? "" : "s"} from these notes. ${styleLine}`,
        "",
        "NOTES:",
        // Long enough for a chapter, short enough to stay inside a small
        // model's context window.
        source.text.slice(0, 12_000),
      ].join("\n"),
      maxTokens: 400 * input.count + 400,
    });
    if (reply) {
      questions = validated(parseAiJson(reply), input.count);
      if (questions.length > 0) engine = "model";
    }
    if (questions.length === 0) {
      notice = "The AI service didn't answer usefully, so these were drafted from the notes here.";
    }
  }

  if (questions.length === 0) {
    questions = draftQuestionsFromNotes(source.text, { count: input.count, style }).map((q) => ({
      type: q.type,
      text: q.text,
      points: q.points,
      correctAnswer: "",
      explanation: q.explanation,
      options: q.options,
    }));
  }

  if (questions.length === 0) {
    throw AppError.badRequest(
      "Those notes are readable but too loosely written to build questions from — try notes with fuller sentences, or add the questions by hand.",
    );
  }
  if (questions.length < input.count && !notice) {
    notice = `The notes carried ${questions.length} good question${questions.length === 1 ? "" : "s"} rather than ${input.count}.`;
  }

  if (input.linkSource) {
    await linkQuizSource(quizId, {
      batchNoteId: input.batchNoteId || "",
      lessonId: input.lessonId || "",
      title: source.title,
      text: input.batchNoteId || input.lessonId || input.sourceId ? "" : source.text,
    }).catch(() => undefined); // a failed bookkeeping row must not lose the draft
  }

  return { questions, engine, sourceTitle: source.title, notice };
}

/** Keep only what the question editor would accept, and only as many as asked. */
function validated(parsed: unknown, count: number): QuestionInput[] {
  if (!Array.isArray(parsed)) return [];
  const out: QuestionInput[] = [];
  for (const raw of parsed) {
    if (out.length >= count) break;
    const result = questionSchema.safeParse({
      ...(raw as Record<string, unknown>),
      points: (raw as { points?: unknown }).points ?? 1,
    });
    if (result.success) out.push(result.data);
  }
  return out;
}
