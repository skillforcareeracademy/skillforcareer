import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

/**
 * What the assistant inside the panels can answer from, beyond the answers an
 * admin typed.
 *
 * "Internal chatbot picks our notes, quiz and assignments to answer educational
 * questions." So when nothing in the trained set matches, the learner's own
 * reading, papers and assignments are searched — and only theirs: the search
 * runs through the same scoping as the pages that list them, so one batch never
 * sees another's material.
 */

export interface KnowledgeHit {
  kind: "MATERIAL" | "QUIZ" | "ASSIGNMENT" | "TERM";
  id: string;
  title: string;
  /** A line of what it says, when there is one worth quoting. */
  snippet: string | null;
  url: string;
}

const LABEL: Record<KnowledgeHit["kind"], string> = {
  MATERIAL: "Study material",
  QUIZ: "Quiz",
  ASSIGNMENT: "Assignment",
  TERM: "Dictionary",
};

/** Words worth searching on — the short ones match everything. */
function keywords(question: string): string[] {
  const stop = new Set([
    "what",
    "when",
    "where",
    "which",
    "who",
    "whom",
    "how",
    "why",
    "the",
    "and",
    "for",
    "are",
    "was",
    "with",
    "from",
    "that",
    "this",
    "have",
    "has",
    "can",
    "you",
    "your",
    "about",
    "please",
    "tell",
    "explain",
    "mean",
    "means",
    "give",
    "show",
    "there",
    "any",
    "all",
    "does",
    "did",
    "will",
    "would",
    "should",
  ]);
  return [
    ...new Set(
      question
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s/-]+/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !stop.has(w)),
    ),
  ].slice(0, 5);
}

/** Strip markup and pick the sentence around the first hit. */
function snippetAround(body: string | null, words: string[]): string | null {
  if (!body) return null;
  const text = body
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const at = words
    .map((w) => lower.indexOf(w))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];
  const from = at != null && at > 80 ? at - 80 : 0;
  const cut = text.slice(from, from + 260).trim();
  return `${from > 0 ? "…" : ""}${cut}${text.length > from + 260 ? "…" : ""}`;
}

/**
 * The courses a learner is actually on. Staff get everything, which is what
 * makes the same assistant useful to an instructor looking something up.
 */
async function visibleCourseIds(userId: string): Promise<string[] | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: { select: { slug: true } },
      extraRoles: { select: { role: { select: { slug: true } } } },
    },
  });
  if (!user) return [];

  const slugs = [
    user.role?.slug,
    ...user.extraRoles.map((r) => r.role.slug),
  ].filter(Boolean) as string[];
  const isStaff = slugs.some((s) =>
    ["SUPER_ADMIN", "ADMIN", "INSTRUCTOR"].includes(s),
  );
  if (isStaff) return null; // null = no restriction

  const enrolments = await prisma.enrollment.findMany({
    where: { userId, status: { in: ["ACTIVE", "COMPLETED"] } },
    select: { courseId: true },
  });
  return enrolments.map((e) => e.courseId);
}

/**
 * Search a learner's own material for something that answers the question.
 * Returns at most `take` hits, best-guess first: a title match beats a body
 * match, because somebody named the thing that on purpose.
 */
export async function searchKnowledge(input: {
  question: string;
  userId: string;
  /** The page they were on, which biases what is looked at first. */
  screen?: string | null;
  take?: number;
}): Promise<KnowledgeHit[]> {
  const words = keywords(input.question);
  if (words.length === 0) return [];

  const courseIds = await visibleCourseIds(input.userId);
  if (courseIds != null && courseIds.length === 0) return [];
  const courseScope = courseIds == null ? {} : { courseId: { in: courseIds } };

  const anyOf = (field: string) =>
    words.map((w) => ({ [field]: { contains: w } }) as Record<string, unknown>);

  const [materials, quizzes, assignments, terms] = await Promise.all([
    prisma.studyMaterial.findMany({
      where: {
        isPublished: true,
        ...courseScope,
        OR: [
          ...anyOf("title"),
          ...anyOf("body"),
        ] as Prisma.StudyMaterialWhereInput[],
      },
      take: 4,
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, body: true },
    }),
    prisma.quiz.findMany({
      where: {
        isPublished: true,
        ...courseScope,
        OR: [
          ...anyOf("title"),
          ...anyOf("description"),
        ] as Prisma.QuizWhereInput[],
      },
      take: 3,
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, description: true },
    }),
    prisma.assignment.findMany({
      where: {
        // Assignments have no published flag; a release date in the future is
        // what hides one, so an unreleased paper stays out of the answer.
        OR: [{ releaseAt: null }, { releaseAt: { lte: new Date() } }],
        ...courseScope,
        AND: [
          {
            OR: [
              ...anyOf("title"),
              ...anyOf("instructions"),
            ] as Prisma.AssignmentWhereInput[],
          },
        ],
      },
      take: 3,
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, instructions: true },
    }),
    prisma.term.findMany({
      where: { OR: anyOf("word") as Prisma.TermWhereInput[] },
      take: 3,
      select: { id: true, word: true, explanation: true },
    }),
  ]);

  const hits: KnowledgeHit[] = [
    ...terms.map((t) => ({
      kind: "TERM" as const,
      id: t.id,
      title: t.word,
      snippet: snippetAround(t.explanation, words),
      url: "/student/terminology",
    })),
    ...materials.map((m) => ({
      kind: "MATERIAL" as const,
      id: m.id,
      title: m.title,
      snippet: snippetAround(m.body, words),
      url: "/student/materials",
    })),
    ...quizzes.map((q) => ({
      kind: "QUIZ" as const,
      id: q.id,
      title: q.title,
      snippet: q.description,
      url: `/student/quizzes/${q.id}`,
    })),
    ...assignments.map((a) => ({
      kind: "ASSIGNMENT" as const,
      id: a.id,
      title: a.title,
      snippet: snippetAround(a.instructions, words),
      url: "/student/assignments",
    })),
  ];

  // Whatever the learner is looking at goes first. A question asked on the
  // quizzes page is usually about a quiz.
  const screen = input.screen ?? "";
  const preferred: KnowledgeHit["kind"] | null = screen.includes("/quizzes")
    ? "QUIZ"
    : screen.includes("/assignments")
      ? "ASSIGNMENT"
      : screen.includes("/materials") || screen.includes("/notes")
        ? "MATERIAL"
        : screen.includes("/terminology")
          ? "TERM"
          : null;

  if (preferred) {
    hits.sort(
      (a, b) => Number(b.kind === preferred) - Number(a.kind === preferred),
    );
  }
  return hits.slice(0, input.take ?? 3);
}

/** Write the hits up as something Ami can say. */
export function answerFromKnowledge(hits: KnowledgeHit[]): string {
  if (hits.length === 0) return "";
  const lines = hits.map((h) => {
    const detail = h.snippet ? ` — ${h.snippet}` : "";
    return `• ${LABEL[h.kind]}: ${h.title}${detail}`;
  });
  return `Here's what I found in your own course material:\n\n${lines.join("\n\n")}`;
}
