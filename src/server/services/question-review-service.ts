import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mail/mailer";
import {
  reviewRaisedForStudent,
  reviewRaisedForTeam,
  reviewAnsweredForStudent,
} from "@/lib/mail/templates/question-review";
import { notify } from "./notification-service";
import { ROLES } from "@/config/roles";
import type { AnswerReviewInput, RaiseReviewInput } from "@/lib/validations/question-review";

/**
 * "This question looks wrong."
 *
 * A learner can flag any question they have been given; an admin or the
 * course's instructor answers it. Both sides get the message twice — in the
 * dashboard and by email — because that is how the academy asked for it:
 * "Inbox and email dono jaane chahiye admin, student and instructor ko."
 *
 * Every request carries a reference the learner can quote (SFC2001, SFC2002, …).
 */

const REF_PREFIX = "SFC";
/** The academy's example started here, so the first request is SFC2001. */
const REF_START = 2000;

async function nextRef(): Promise<string> {
  const rows = await prisma.$queryRaw<{ maxNo: bigint | number | null }[]>`
    SELECT MAX(CAST(SUBSTRING(ref, ${REF_PREFIX.length + 1}) AS UNSIGNED)) AS maxNo
    FROM QuestionReview
    WHERE ref LIKE ${`${REF_PREFIX}%`}
  `;
  const highest = Number(rows[0]?.maxNo ?? 0);
  return `${REF_PREFIX}${Math.max(highest, REF_START) + 1}`;
}

/** Who answers a request: every admin, plus the course's own instructor. */
async function teamFor(quizId: string): Promise<{ id: string; name: string; email: string }[]> {
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    select: { createdById: true, course: { select: { instructorId: true } } },
  });
  const ids = [quiz?.createdById, quiz?.course?.instructorId].filter(
    (id): id is string => Boolean(id),
  );
  const people = await prisma.user.findMany({
    where: {
      OR: [
        { role: { slug: { in: [ROLES.SUPER_ADMIN, ROLES.ADMIN] } }, status: "ACTIVE" },
        { id: { in: ids } },
      ],
    },
    select: { id: true, name: true, email: true },
  });
  return people;
}

export interface RaisedReview {
  id: string;
  ref: string;
  message: string;
}

/** The learner raises one. Returns the reference and the words to show them. */
export async function raiseQuestionReview(
  studentId: string,
  quizId: string,
  input: RaiseReviewInput,
): Promise<RaisedReview> {
  const question = await prisma.question.findFirst({
    where: { id: input.questionId, quizId },
    select: { id: true, order: true, text: true, quiz: { select: { title: true } } },
  });
  if (!question) throw AppError.notFound("Question not found.");

  // One open request per learner per question — a second tap on the button
  // should not raise a second ticket.
  const existing = await prisma.questionReview.findFirst({
    where: { questionId: question.id, studentId, status: "OPEN" },
    select: { id: true, ref: true },
  });
  if (existing) {
    return {
      id: existing.id,
      ref: existing.ref,
      message: `You've already raised this one — your review request number is ${existing.ref}.`,
    };
  }

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { name: true, email: true },
  });
  if (!student) throw AppError.notFound("Account not found.");

  const ref = await nextRef();
  const questionNo = question.order + 1;
  const quizTitle = question.quiz.title;

  const review = await prisma.questionReview.create({
    data: {
      ref,
      quizId,
      questionId: question.id,
      studentId,
      message: input.message?.trim() || null,
    },
    select: { id: true },
  });

  // The learner's own wording, as the academy wrote it.
  const learnerLine =
    `Your request for the review this question no. ${questionNo} of the quiz named ` +
    `“${quizTitle}” has been submitted. Your Instructor or Admin shall review and revert ` +
    `you back soon. Your review request number is this ${ref}.`;

  void notify({
    userIds: [studentId],
    type: "QUIZ",
    title: `Review request ${ref} submitted`,
    message: learnerLine,
    actionUrl: "/student/quizzes",
  });
  void sendMail({
    to: student.email,
    ...reviewRaisedForStudent({
      name: student.name,
      ref,
      questionNo,
      quizTitle,
      body: learnerLine,
    }),
  }).catch(() => undefined);

  // …and the teaching team's side of it.
  const team = await teamFor(quizId);
  if (team.length > 0) {
    void notify({
      userIds: team.map((t) => t.id),
      type: "QUIZ",
      title: `Question review ${ref}`,
      message: `${student.name} has flagged question ${questionNo} of “${quizTitle}”.`,
      actionUrl: "/admin/quiz-reviews",
    });
    for (const person of team) {
      void sendMail({
        to: person.email,
        ...reviewRaisedForTeam({
          name: person.name,
          ref,
          questionNo,
          quizTitle,
          studentName: student.name,
          questionText: question.text,
          note: input.message?.trim() || null,
        }),
      }).catch(() => undefined);
    }
  } else {
    logger.warn("question_review.no_team", { quizId, ref });
  }

  return { id: review.id, ref, message: learnerLine };
}

// ── The teaching team's side ─────────────────────────────────────────────────

export interface ReviewRow {
  id: string;
  ref: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  message: string | null;
  reply: string | null;
  studentName: string;
  studentEmail: string;
  quizId: string;
  quizTitle: string;
  questionNo: number;
  questionText: string;
  resolvedByName: string | null;
}

export interface ReviewListQuery {
  status?: string;
  /** Scope to the quizzes an instructor owns. */
  ownerId?: string;
  page: number;
  pageSize: number;
}

export async function listQuestionReviews(q: ReviewListQuery) {
  const where = {
    ...(q.status ? { status: q.status as "OPEN" | "RECTIFIED" | "INVALID" } : {}),
    ...(q.ownerId
      ? {
          quiz: {
            OR: [{ createdById: q.ownerId }, { course: { instructorId: q.ownerId } }],
          },
        }
      : {}),
  };
  const [total, rows, open] = await Promise.all([
    prisma.questionReview.count({ where }),
    prisma.questionReview.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        ref: true,
        status: true,
        message: true,
        reply: true,
        createdAt: true,
        resolvedAt: true,
        student: { select: { name: true, email: true } },
        quiz: { select: { id: true, title: true } },
        question: { select: { order: true, text: true } },
        resolvedBy: { select: { name: true } },
      },
    }),
    prisma.questionReview.count({ where: { ...where, status: "OPEN" } }),
  ]);

  const reviews: ReviewRow[] = rows.map((r) => ({
    id: r.id,
    ref: r.ref,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    message: r.message,
    reply: r.reply,
    studentName: r.student.name,
    studentEmail: r.student.email,
    quizId: r.quiz.id,
    quizTitle: r.quiz.title,
    questionNo: r.question.order + 1,
    questionText: r.question.text,
    resolvedByName: r.resolvedBy?.name ?? null,
  }));
  return { total, reviews, open };
}

/** The default wording for each verdict — editable before it is sent. */
export const REVIEW_REPLIES = {
  RECTIFIED: "Thank you for pointing out this error or mistake. This has been rectified.",
  INVALID: "This review request for the question is invalid. The question is right.",
} as const;

export async function answerQuestionReview(
  id: string,
  resolvedById: string,
  input: AnswerReviewInput,
): Promise<void> {
  const review = await prisma.questionReview.findUnique({
    where: { id },
    select: {
      id: true,
      ref: true,
      studentId: true,
      student: { select: { name: true, email: true } },
      quiz: { select: { title: true } },
      question: { select: { order: true } },
    },
  });
  if (!review) throw AppError.notFound("Review request not found.");

  const reply = input.reply?.trim() || REVIEW_REPLIES[input.status];
  await prisma.questionReview.update({
    where: { id },
    data: { status: input.status, reply, resolvedById, resolvedAt: new Date() },
  });

  const questionNo = review.question.order + 1;
  void notify({
    userIds: [review.studentId],
    type: "QUIZ",
    title: `Review request ${review.ref} answered`,
    message: reply,
    actionUrl: "/student/quizzes",
  });
  void sendMail({
    to: review.student.email,
    ...reviewAnsweredForStudent({
      name: review.student.name,
      ref: review.ref,
      questionNo,
      quizTitle: review.quiz.title,
      reply,
      rectified: input.status === "RECTIFIED",
    }),
  }).catch(() => undefined);
}

/** The badge on the admin nav — how many are waiting. */
export async function openReviewCount(ownerId?: string): Promise<number> {
  return prisma.questionReview.count({
    where: {
      status: "OPEN",
      ...(ownerId
        ? { quiz: { OR: [{ createdById: ownerId }, { course: { instructorId: ownerId } }] } }
        : {}),
    },
  });
}
