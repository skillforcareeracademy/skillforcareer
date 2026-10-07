import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/lib/api/errors";
import type {
  CheckAnswerInput,
  SubmitQuizInput,
} from "@/lib/validations/quiz-attempt";
import { getSettings } from "./settings-service";
import { ACTIVITY_ACTIONS, logActivity } from "./activity-service";
import {
  groupOptions,
  groupsOfMany,
  itemsForBatches,
} from "./content-group-service";

// ── Reads ────────────────────────────────────────────────────────────────────

export interface StudentQuiz {
  id: string;
  title: string;
  description: string | null;
  /** Which course set it — the per-course hub filters on this. */
  courseId: string | null;
  courseTitle: string | null;
  questionCount: number;
  totalPoints: number;
  passingScore: number;
  maxAttempts: number;
  attemptsUsed: number;
  bestPercent: number | null;
  passed: boolean;
  /** Saved for later from the list or the quiz itself. */
  bookmarked: boolean;
  /** The academy's own grouping and numbering. */
  sequence: number;
  /** The permanent number the office quotes — the same one the admin list shows. */
  quizNo: number | null;
  /** Practice or exam, so a learner can tell the two apart. */
  quizType: string | null;
  categoryName: string | null;
  /** Every folder above this paper, outermost first — what the browser nests on. */
  groupPath: string[];
  subCategoryName: string | null;
  /** How hard the academy says it is. */
  difficulty: string;
}

export async function listStudentQuizzes(
  userId: string,
): Promise<StudentQuiz[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { courseId: true, batchId: true },
  });
  const courseIds = enrollments.map((e) => e.courseId);
  if (courseIds.length === 0) return [];
  const batchIds = enrollments
    .map((e) => e.batchId)
    .filter((id): id is string => Boolean(id));

  // Whole folders handed to their cohort — a quiz added to the folder later is
  // already theirs, which is the point of assigning the folder.
  const viaGroups = await itemsForBatches(batchIds, "QUIZ");

  const quizzes = await prisma.quiz.findMany({
    // A quiz set for particular cohorts or named learners reaches only those;
    // one with neither reaches everyone on its course, as it always has. On top
    // of that, `releaseAt` holds it back until its moment — the assessment half
    // of "students ko saare quiz ek saath nhi denge".
    where: {
      isPublished: true,
      OR: [
        {
          courseId: { in: courseIds },
          batches: { none: {} },
          students: { none: {} },
        },
        ...(batchIds.length
          ? [{ batches: { some: { batchId: { in: batchIds } } } }]
          : []),
        ...(viaGroups.length ? [{ id: { in: viaGroups } }] : []),
        { students: { some: { userId } } },
      ],
      AND: [{ OR: [{ releaseAt: null }, { releaseAt: { lte: new Date() } }] }],
    },
    // In the academy's order — "Quiz 1, Quiz 2, Quiz 3" is how the class is
    // told to work through them.
    orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
    include: {
      course: { select: { title: true } },
      category: { select: { name: true } },
      subCategory: { select: { name: true } },
      questions: { select: { points: true } },
      attempts: {
        where: { studentId: userId },
        select: { score: true, maxScore: true },
      },
    },
  });

  // The platform default applies to any quiz that names no cap of its own —
  // the same sum the attempt page and the submit endpoint do, so "attempts
  // left" reads the same wherever a learner looks.
  const { settings } = await getSettings();

  // One flat read for the saved set rather than a relation on each quiz —
  // `relationMode = "prisma"` would make that a round trip per row.
  const saved = new Set(
    (
      await prisma.bookmark.findMany({
        where: { userId, quizId: { in: quizzes.map((z) => z.id) } },
        select: { quizId: true },
      })
    ).map((b) => b.quizId),
  );

  // The folders each paper is filed in. The learner's browser groups on a
  // category and a sub-category, so the first folder's path fills both: three
  // levels deep reads as "Medical Coding" then "ICD-10 → Guidelines". Falls
  // back to the old category when a paper has not been filed anywhere yet.
  const [membership, options] = await Promise.all([
    groupsOfMany(
      "QUIZ",
      quizzes.map((z) => z.id),
    ),
    groupOptions("QUIZ"),
  ]);
  const pathOf = new Map(options.map((o) => [o.id, o.path]));
  const folderFor = (quizId: string) => {
    const first = (membership.get(quizId) ?? [])
      .map((g) => pathOf.get(g))
      .filter((path): path is string => Boolean(path))
      .sort()[0];
    if (!first)
      return {
        path: [] as string[],
        category: null as string | null,
        sub: null as string | null,
      };
    const path = first.split(" → ");
    const [head, ...rest] = path;
    // `path` is what the learner's browser nests on; the two names below are
    // kept for the older places that still read a category and a sub-category.
    return { path, category: head, sub: rest.length ? rest.join(" → ") : null };
  };

  return quizzes.map((z) => {
    const folder = folderFor(z.id);
    const totalPoints = z.questions.reduce((s, q) => s + q.points, 0);
    const percents = z.attempts
      .filter((a) => a.score != null && a.maxScore > 0)
      .map((a) => Math.round(((a.score as number) / a.maxScore) * 100));
    const best = percents.length ? Math.max(...percents) : null;
    return {
      id: z.id,
      title: z.title,
      description: z.description,
      courseId: z.courseId ?? null,
      courseTitle: z.course?.title ?? null,
      questionCount: z.questions.length,
      totalPoints,
      passingScore: z.passingScore,
      maxAttempts: z.maxAttempts || settings.quizAttemptLimit,
      attemptsUsed: z.attempts.length,
      bestPercent: best,
      passed: best != null && best >= z.passingScore,
      bookmarked: saved.has(z.id),
      sequence: z.sequence,
      quizNo: z.quizNo,
      quizType: z.quizType,
      difficulty: z.difficulty,
      categoryName: folder.category ?? z.category?.name ?? null,
      groupPath: folder.path,
      subCategoryName: folder.sub ?? z.subCategory?.name ?? null,
    };
  });
}

/** Quiz + questions for taking — WITHOUT correct-answer flags. */
export async function getQuizForAttempt(userId: string, quizId: string) {
  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, isPublished: true },
    include: {
      course: { select: { id: true, title: true } },
      category: { select: { name: true } },
      subCategory: { select: { name: true } },
      sources: { orderBy: { createdAt: "asc" }, select: { title: true } },
      questions: {
        orderBy: { order: "asc" },
        include: {
          options: {
            orderBy: { order: "asc" },
            select: { id: true, text: true },
          },
        },
      },
    },
  });
  if (!quiz || !quiz.courseId) return null;
  // A quiz still under wraps is not takeable by URL either.
  if (quiz.releaseAt && quiz.releaseAt.getTime() > Date.now()) return null;

  const enrolled = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: quiz.courseId } },
    select: { id: true },
  });
  if (!enrolled) return null;

  const [attemptsUsed, bookmark, { settings }, paused] = await Promise.all([
    // A paper paused part-way is not an attempt spent — it is this one, still
    // open. Counting it would lock a learner out of their own saved work.
    prisma.quizAttempt.count({
      where: { quizId, studentId: userId, status: { not: "IN_PROGRESS" } },
    }),
    prisma.bookmark.findFirst({
      where: { userId, quizId },
      select: { id: true },
    }),
    getSettings(),
    quiz.allowPause ? pausedWork(userId, quizId) : Promise.resolve(null),
  ]);
  // Same effective cap the submit path applies, so the button and the endpoint
  // never disagree about whether an attempt is left.
  const cap = quiz.maxAttempts || settings.quizAttemptLimit;

  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    courseTitle: quiz.course?.title ?? null,
    timeLimitMinutes: quiz.timeLimitMinutes,
    /** Seconds per question; null means only the whole-paper clock applies. */
    perQuestionSeconds: quiz.perQuestionSeconds,
    passingScore: quiz.passingScore,
    maxAttempts: cap,
    attemptsUsed,
    canAttempt: cap === 0 || attemptsUsed < cap || paused != null,
    /** Whether this paper may be stopped part-way. */
    allowPause: quiz.allowPause,
    /** What was saved at the last pause, if anything. */
    paused,
    bookmarked: bookmark != null,
    /** Marks each question as it is answered, rather than only at the end. */
    showAnswerPerQuestion: quiz.showAnswerPerQuestion,
    categoryName: quiz.subCategory?.name ?? quiz.category?.name ?? null,
    /** The notes this paper was prepared from — what to revise. */
    preparedFrom: quiz.sources.map((s) => s.title),
    totalPoints: quiz.questions.reduce((s, q) => s + q.points, 0),
    questions: quiz.questions.map((q) => ({
      id: q.id,
      type: q.type,
      text: q.text,
      points: q.points,
      options: q.options,
    })),
  };
}

// ── Marking as you go ────────────────────────────────────────────────────────

export interface CheckedAnswer {
  questionId: string;
  isCorrect: boolean | null;
  correctOptionIds: string[];
  explanation: string | null;
}

/**
 * Mark one question mid-attempt, for quizzes set to answer as you go.
 *
 * The answer key never rides along with the paper — it is asked for one
 * question at a time, only for a quiz whose settings allow it, and only by
 * someone enrolled on the course. A written answer has no key to give, so it
 * comes back unmarked.
 */
export async function checkQuizAnswer(
  userId: string,
  quizId: string,
  input: CheckAnswerInput,
): Promise<CheckedAnswer> {
  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, isPublished: true },
    select: { courseId: true, showAnswerPerQuestion: true, releaseAt: true },
  });
  if (!quiz || !quiz.courseId) throw AppError.notFound("Quiz not found.");
  if (!quiz.showAnswerPerQuestion) {
    throw AppError.badRequest("This quiz shows its answers at the end.");
  }
  if (quiz.releaseAt && quiz.releaseAt.getTime() > Date.now()) {
    throw AppError.badRequest("This quiz hasn't opened yet.");
  }

  const enrolled = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: quiz.courseId } },
    select: { id: true },
  });
  if (!enrolled)
    throw AppError.forbidden("You're not enrolled in this course.");

  const question = await prisma.question.findFirst({
    where: { id: input.questionId, quizId },
    select: {
      type: true,
      explanation: true,
      options: { select: { id: true, isCorrect: true } },
    },
  });
  if (!question) throw AppError.notFound("Question not found.");

  if (question.type === "SHORT_ANSWER") {
    return {
      questionId: input.questionId,
      isCorrect: null,
      correctOptionIds: [],
      explanation: question.explanation,
    };
  }

  const correctIds = question.options
    .filter((o) => o.isCorrect)
    .map((o) => o.id)
    .sort();
  const chosen = [...new Set(input.optionIds)].sort();
  return {
    questionId: input.questionId,
    isCorrect:
      correctIds.length === chosen.length &&
      correctIds.every((id, i) => id === chosen[i]),
    correctOptionIds: correctIds,
    explanation: question.explanation,
  };
}

// ── Submit + auto-grade ──────────────────────────────────────────────────────

export interface QuizResult {
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
  passingScore: number;
  attemptNo: number;
  breakdown: {
    questionId: string;
    isCorrect: boolean | null;
    correctOptionIds: string[];
    yourOptionIds: string[];
    explanation: string | null;
    /** What the question was worth, and what it earned. */
    points: number;
    pointsAwarded: number;
  }[];
  /** The whole answer key on the result screen. */
  showAnswers: boolean;
  /**
   * The paper answered as it went, so the learner has already seen every key —
   * the end-of-quiz summary shows them again whatever `showAnswers` says.
   */
  showAnswerPerQuestion: boolean;
}

export async function submitQuizAttempt(
  userId: string,
  quizId: string,
  input: SubmitQuizInput,
): Promise<QuizResult> {
  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, isPublished: true },
    include: {
      questions: {
        include: { options: { select: { id: true, isCorrect: true } } },
      },
    },
  });
  if (!quiz || !quiz.courseId) throw AppError.notFound("Quiz not found.");

  const enrolled = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: quiz.courseId } },
    select: { id: true },
  });
  if (!enrolled)
    throw AppError.forbidden("You're not enrolled in this course.");

  if (quiz.releaseAt && quiz.releaseAt.getTime() > Date.now()) {
    throw AppError.badRequest("This quiz hasn't opened yet.");
  }

  // The quiz's own cap, else the platform default from Settings → Learning.
  // 0 in both means unlimited — an instructor who wants open practice sets it
  // to 0 rather than to some large number.
  const { settings } = await getSettings();
  const cap = quiz.maxAttempts || settings.quizAttemptLimit;

  // A paused attempt is this submission, not a new one: it keeps its number and
  // does not count twice against the cap.
  const [paused, finished] = await Promise.all([
    prisma.quizAttempt.findFirst({
      where: { quizId, studentId: userId, status: "IN_PROGRESS" },
      select: { id: true, attemptNo: true, timeSpentSeconds: true },
    }),
    prisma.quizAttempt.count({
      where: { quizId, studentId: userId, status: { not: "IN_PROGRESS" } },
    }),
  ]);
  const attemptsUsed = finished;
  if (!paused && cap > 0 && finished >= cap) {
    throw AppError.badRequest("You've used all your attempts for this quiz.");
  }

  const answerMap = new Map(
    input.answers.map((a) => [a.questionId, a.optionIds]),
  );

  let score = 0;
  let maxScore = 0;
  const breakdown: QuizResult["breakdown"] = [];
  const responses: {
    questionId: string;
    selected: string[];
    isCorrect: boolean | null;
    points: number;
  }[] = [];

  for (const q of quiz.questions) {
    maxScore += q.points;
    const selected = answerMap.get(q.id) ?? [];
    const correctIds = q.options
      .filter((o) => o.isCorrect)
      .map((o) => o.id)
      .sort();

    let isCorrect: boolean | null;
    let points = 0;
    if (q.type === "SHORT_ANSWER") {
      isCorrect = null; // needs manual grading
    } else {
      const sel = [...selected].sort();
      isCorrect =
        correctIds.length === sel.length &&
        correctIds.every((id, i) => id === sel[i]);
      points = isCorrect ? q.points : 0;
    }
    score += points;
    responses.push({ questionId: q.id, selected, isCorrect, points });
    breakdown.push({
      questionId: q.id,
      isCorrect,
      correctOptionIds: correctIds,
      yourOptionIds: selected,
      explanation: q.explanation,
      points: q.points,
      pointsAwarded: points,
    });
  }

  const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  const passed = percent >= quiz.passingScore;
  const attemptNo = paused?.attemptNo ?? attemptsUsed + 1;
  const now = new Date();
  // Time already spent before the pause counts towards the total.
  const spent = (input.timeSpentSeconds ?? 0) + (paused?.timeSpentSeconds ?? 0);
  const rows = responses.map((r) => ({
    questionId: r.questionId,
    selectedOptions: r.selected as Prisma.InputJsonValue,
    isCorrect: r.isCorrect,
    pointsAwarded: r.points,
  }));

  if (paused) {
    // The half-finished answers are replaced wholesale by the submitted ones.
    await prisma.quizResponse.deleteMany({ where: { attemptId: paused.id } });
    await prisma.quizAttempt.update({
      where: { id: paused.id },
      data: {
        status: "GRADED",
        score,
        maxScore,
        timeSpentSeconds: spent,
        submittedAt: now,
        gradedAt: now,
        responses: { create: rows },
      },
    });
  } else {
    await prisma.quizAttempt.create({
      data: {
        quizId,
        studentId: userId,
        attemptNo,
        status: "GRADED",
        score,
        maxScore,
        timeSpentSeconds: spent,
        submittedAt: now,
        gradedAt: now,
        responses: { create: rows },
      },
      select: { id: true },
    });
  }

  void logActivity({
    userId,
    action: ACTIVITY_ACTIONS.QUIZ_SUBMIT,
    entityType: "Quiz",
    entityId: quizId,
    description: `Scored ${percent}% on “${quiz.title}”`,
    metadata: { score, maxScore, percent, passed },
  });

  return {
    score,
    maxScore,
    percent,
    passed,
    passingScore: quiz.passingScore,
    attemptNo,
    breakdown,
    showAnswers: quiz.showAnswers,
    showAnswerPerQuestion: quiz.showAnswerPerQuestion,
  };
}

// ── Pausing ──────────────────────────────────────────────────────────────────

export interface PausedWork {
  answers: { questionId: string; optionIds: string[]; text: string }[];
  timeSpentSeconds: number;
  pausedAt: string;
}

/**
 * Stop part-way and come back to it — "student should be able to pause the quiz
 * in some cases. Admin and instructor should have access to allow students or
 * not to pause."
 *
 * The half-finished paper is kept as an IN_PROGRESS attempt, which is the same
 * row the submission will later become: resuming does not spend a second
 * attempt, and the time already spent carries over.
 */
export async function pauseQuizAttempt(
  userId: string,
  quizId: string,
  input: {
    answers: { questionId: string; optionIds: string[]; text?: string }[];
    timeSpentSeconds?: number;
  },
): Promise<{ saved: number }> {
  const quiz = await prisma.quiz.findFirst({
    where: { id: quizId, isPublished: true },
    select: { id: true, courseId: true, allowPause: true },
  });
  if (!quiz || !quiz.courseId) throw AppError.notFound("Quiz not found.");
  if (!quiz.allowPause) {
    throw AppError.badRequest("This quiz can't be paused.");
  }

  const enrolled = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: quiz.courseId } },
    select: { id: true },
  });
  if (!enrolled)
    throw AppError.forbidden("You're not enrolled in this course.");

  const existing = await prisma.quizAttempt.findFirst({
    where: { quizId, studentId: userId, status: "IN_PROGRESS" },
    select: { id: true },
  });
  const finished = await prisma.quizAttempt.count({
    where: { quizId, studentId: userId, status: { not: "IN_PROGRESS" } },
  });

  // Nothing is marked here — a pause is a save, and the key must not leak into
  // a half-finished row that the learner could read back.
  const rows = input.answers.map((a) => ({
    questionId: a.questionId,
    selectedOptions: a.optionIds as Prisma.InputJsonValue,
    answerText: a.text?.trim() || null,
    isCorrect: null,
    pointsAwarded: 0,
  }));

  if (existing) {
    await prisma.quizResponse.deleteMany({ where: { attemptId: existing.id } });
    await prisma.quizAttempt.update({
      where: { id: existing.id },
      data: {
        timeSpentSeconds: input.timeSpentSeconds ?? 0,
        responses: { create: rows },
      },
    });
  } else {
    await prisma.quizAttempt.create({
      data: {
        quizId,
        studentId: userId,
        attemptNo: finished + 1,
        status: "IN_PROGRESS",
        maxScore: 0,
        timeSpentSeconds: input.timeSpentSeconds ?? 0,
        responses: { create: rows },
      },
    });
  }
  return { saved: rows.length };
}

/** The paper a learner left half-finished, if there is one. */
export async function pausedWork(
  userId: string,
  quizId: string,
): Promise<PausedWork | null> {
  const attempt = await prisma.quizAttempt.findFirst({
    where: { quizId, studentId: userId, status: "IN_PROGRESS" },
    select: {
      timeSpentSeconds: true,
      updatedAt: true,
      responses: {
        select: { questionId: true, selectedOptions: true, answerText: true },
      },
    },
  });
  if (!attempt) return null;

  return {
    answers: attempt.responses.map((r) => ({
      questionId: r.questionId,
      optionIds: Array.isArray(r.selectedOptions)
        ? (r.selectedOptions as unknown[]).filter(
            (v): v is string => typeof v === "string",
          )
        : [],
      text: r.answerText ?? "",
    })),
    timeSpentSeconds: attempt.timeSpentSeconds,
    pausedAt: attempt.updatedAt.toISOString(),
  };
}

/** Throw away a paused paper and start again. */
export async function discardPausedWork(
  userId: string,
  quizId: string,
): Promise<void> {
  await prisma.quizAttempt.deleteMany({
    where: { quizId, studentId: userId, status: "IN_PROGRESS" },
  });
}
