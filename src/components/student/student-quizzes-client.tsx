import { FileQuestion, ListChecks, Award, CheckCircle2, RefreshCw, PlayCircle } from "lucide-react";
import type { StudentQuiz } from "@/server/services/student-quiz-service";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/shared/button-link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function StudentQuizzesClient({ quizzes }: { quizzes: StudentQuiz[] }) {
  const stats = {
    total: quizzes.length,
    attempted: quizzes.filter((q) => q.attemptsUsed > 0).length,
    passed: quizzes.filter((q) => q.passed).length,
  };
  const statCards = [
    { label: "Quizzes", value: stats.total, icon: FileQuestion, tone: "text-rose-500" },
    { label: "Attempted", value: stats.attempted, icon: ListChecks, tone: "text-sky-500" },
    { label: "Passed", value: stats.passed, icon: Award, tone: "text-emerald-500" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Quizzes" description="Test your knowledge and track your best scores." />

      {quizzes.length === 0 ? (
        <EmptyState
          icon={FileQuestion}
          title="No quizzes yet"
          description="Quizzes from your enrolled courses will appear here."
          action={<ButtonLink href="/courses">Browse courses</ButtonLink>}
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {statCards.map((s) => (
              <Card key={s.label}>
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="bg-muted grid size-10 shrink-0 place-items-center rounded-lg">
                    <s.icon className={`size-5 ${s.tone}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl font-semibold leading-none tabular-nums">{s.value}</p>
                    <p className="text-muted-foreground mt-1 truncate text-xs">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {quizzes.map((q) => {
              const exhausted = q.attemptsUsed >= q.maxAttempts;
              const cta = q.attemptsUsed === 0 ? "Start quiz" : exhausted ? "View result" : "Retake";
              const Icon = q.attemptsUsed === 0 ? PlayCircle : exhausted ? Award : RefreshCw;
              return (
                <Card key={q.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{q.title}</h3>
                      <p className="text-muted-foreground truncate text-xs">{q.courseTitle}</p>
                    </div>
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
                  </div>

                  <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="flex items-center gap-1">
                      <ListChecks className="size-3.5" /> {q.questionCount} questions
                    </span>
                    <span>Pass {q.passingScore}%</span>
                    <span>
                      Attempts {q.attemptsUsed}/{q.maxAttempts}
                    </span>
                  </div>

                  <div className="mt-4">
                    <ButtonLink
                      href={`/student/quizzes/${q.id}`}
                      size="sm"
                      variant={q.attemptsUsed === 0 ? "default" : "outline"}
                    >
                      <Icon className="size-4" /> {cta}
                    </ButtonLink>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
