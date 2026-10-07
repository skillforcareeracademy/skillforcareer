"use client";

import { useMemo, useState } from "react";
import {
  FileQuestion,
  ListChecks,
  Award,
  CheckCircle2,
  RefreshCw,
  PlayCircle,
  Search,
  History,
} from "lucide-react";
import type { StudentQuiz } from "@/server/services/student-quiz-service";
import { QUIZ_DIFFICULTY_LABEL, QUIZ_TYPE_LABEL } from "@/lib/validations/quiz";
import { PageHeader } from "@/components/shared/page-header";
import { StatCards, type StatCard } from "@/components/shared/stat-cards";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/shared/button-link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { QuizBookmarkToggle } from "./quiz-bookmark-toggle";
import { GroupBrowser } from "./group-browser";
import { Button } from "@/components/ui/button";
import { AttemptHistorySheet } from "@/components/shared/attempt-history-sheet";

export function StudentQuizzesClient({ quizzes }: { quizzes: StudentQuiz[] }) {
  /** Which quiz's attempts are open, if any. */
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  /** Behind the figures above: all, only sat, or only passed. */
  const [only, setOnly] = useState<"all" | "attempted" | "passed">("all");
  /** Practice papers, graded exams, or both — the admin list has the same tabs. */
  const [kind, setKind] = useState<"ALL" | "PRACTICE" | "EXAM">("ALL");

  // Searching cuts across every group; without one, the groups lead.
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byKind =
      kind === "ALL" ? quizzes : quizzes.filter((z) => z.quizType === kind);
    const narrowed =
      only === "attempted"
        ? byKind.filter((z) => z.attemptsUsed > 0)
        : only === "passed"
          ? byKind.filter((z) => z.passed)
          : byKind;
    if (!q) return narrowed;
    return narrowed.filter(
      (z) =>
        z.title.toLowerCase().includes(q) ||
        (z.categoryName ?? "").toLowerCase().includes(q) ||
        (z.subCategoryName ?? "").toLowerCase().includes(q) ||
        (z.courseTitle ?? "").toLowerCase().includes(q),
    );
  }, [quizzes, search, only, kind]);

  const stats = {
    total: quizzes.length,
    attempted: quizzes.filter((q) => q.attemptsUsed > 0).length,
    passed: quizzes.filter((q) => q.passed).length,
  };
  const statCards: StatCard[] = [
    {
      label: "Quizzes",
      value: stats.total,
      icon: FileQuestion,
      tone: "text-rose-500",
      hint: "Every quiz set for you. Tap to show them all.",
      active: only === "all",
      onClick: () => setOnly("all"),
    },
    {
      label: "Attempted",
      value: stats.attempted,
      icon: ListChecks,
      tone: "text-sky-500",
      hint: "Quizzes you have sat at least once.",
      active: only === "attempted",
      onClick: () => setOnly(only === "attempted" ? "all" : "attempted"),
    },
    {
      label: "Passed",
      value: stats.passed,
      icon: Award,
      tone: "text-emerald-500",
      hint: "Quizzes you have passed.",
      active: only === "passed",
      onClick: () => setOnly(only === "passed" ? "all" : "passed"),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quizzes"
        description="Test your knowledge and track your best scores."
      />

      {quizzes.length === 0 ? (
        <EmptyState
          icon={FileQuestion}
          title="No quizzes yet"
          description="Quizzes from your enrolled courses will appear here."
          action={<ButtonLink href="/courses">Browse courses</ButtonLink>}
        />
      ) : (
        <>
          <StatCards
            cards={statCards}
            className="grid grid-cols-3 gap-3 sm:gap-4"
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative max-w-sm flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                placeholder="Search every group…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Practice or exam, the same tabs the admin list has — "ye practice
                exam quiz wale tab student panel me bhi hone chahiye. Student
                differentiate kaise krega quizes ke beech." Hidden when the
                academy has not typed any of its quizzes yet. */}
            {quizzes.some((q) => q.quizType) && (
              <div className="flex gap-2">
                {(
                  [
                    ["ALL", "All"],
                    ["PRACTICE", QUIZ_TYPE_LABEL.PRACTICE],
                    ["EXAM", QUIZ_TYPE_LABEL.EXAM],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={kind === value ? "default" : "outline"}
                    onClick={() => setKind(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Groups first, papers on a tap — "student can click on group to
              open content. Access Group wise and sub group wise." */}
          <GroupBrowser
            items={matches}
            query={search}
            noun={{ one: "quiz", many: "quizzes" }}
            columns="lg:grid-cols-2"
            renderItem={(q) => {
              // 0 is unlimited — a practice set must not read as "used up".
              const exhausted =
                q.maxAttempts > 0 && q.attemptsUsed >= q.maxAttempts;
              const cta =
                q.attemptsUsed === 0
                  ? "Start quiz"
                  : exhausted
                    ? "View result"
                    : "Retake";
              const Icon =
                q.attemptsUsed === 0
                  ? PlayCircle
                  : exhausted
                    ? Award
                    : RefreshCw;
              return (
                <Card key={q.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">
                        {q.sequence > 0 && (
                          <span className="text-muted-foreground">
                            {q.sequence}.{" "}
                          </span>
                        )}
                        {q.title}
                      </h3>
                      <p className="text-muted-foreground truncate text-xs">
                        {[
                          // The academy's permanent number — the one the office
                          // quotes down the phone, and what the admin list shows.
                          q.quizNo ? `Quiz ${q.quizNo}` : null,
                          q.categoryName,
                          q.subCategoryName,
                          q.courseTitle,
                          QUIZ_DIFFICULTY_LABEL[q.difficulty] ?? null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {/* Practice or exam — "student differentiate kaise krega
                          quizes ke beech". */}
                      {q.quizType && (
                        <Badge
                          variant="secondary"
                          className={
                            q.quizType === "EXAM"
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                              : "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
                          }
                        >
                          {QUIZ_TYPE_LABEL[q.quizType] ?? q.quizType}
                        </Badge>
                      )}
                      {q.bestPercent != null && (
                        <Badge
                          variant="secondary"
                          className={
                            q.passed
                              ? "gap-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                          }
                        >
                          {q.passed && <CheckCircle2 className="size-3" />}
                          {q.bestPercent}%
                        </Badge>
                      )}
                      <QuizBookmarkToggle
                        quizId={q.id}
                        bookmarked={q.bookmarked}
                      />
                    </div>
                  </div>

                  <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="flex items-center gap-1">
                      <ListChecks className="size-3.5" /> {q.questionCount}{" "}
                      questions
                    </span>
                    <span>Pass {q.passingScore}%</span>
                    <span>
                      {q.maxAttempts > 0
                        ? `Attempts ${q.attemptsUsed}/${q.maxAttempts}`
                        : `Attempts ${q.attemptsUsed} · unlimited`}
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <ButtonLink
                      href={`/student/quizzes/${q.id}`}
                      size="sm"
                      variant={q.attemptsUsed === 0 ? "default" : "outline"}
                    >
                      <Icon className="size-4" /> {cta}
                    </ButtonLink>
                    {/* Every attempt, not just the last one — and without
                        having to open the paper again. */}
                    {q.attemptsUsed > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setHistoryFor(q.id)}
                      >
                        <History className="size-4" /> Previous results
                      </Button>
                    )}
                  </div>
                </Card>
              );
            }}
          />
        </>
      )}

      <AttemptHistorySheet
        open={historyFor !== null}
        onOpenChange={(o) => !o && setHistoryFor(null)}
        quizId={historyFor ?? ""}
      />
    </div>
  );
}
