"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  CheckCircle2,
  ChevronLeft,
  Clock,
  CircleDashed,
  Loader2,
  XCircle,
} from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Every attempt, and what happened in each one.
 *
 * The academy asked for the result to stop being a number: "instead numbers
 * there should be complete record". So an attempt opens into the whole paper —
 * every question, what the learner put, what was right, and what was left
 * blank. The same sheet serves the learner looking at their own paper and the
 * staff looking at theirs; the server decides what each may see.
 */

type AnswerState = "CORRECT" | "WRONG" | "UNANSWERED" | "AWAITING";

interface Summary {
  id: string;
  attemptNo: number;
  status: string;
  score: number | null;
  maxScore: number;
  percent: number;
  passed: boolean;
  correct: number;
  wrong: number;
  unanswered: number;
  awaiting: number;
  timeSpentSeconds: number;
  startedAt: string;
  submittedAt: string | null;
  studentName: string;
}

interface AttemptQuestion {
  questionId: string;
  number: number;
  text: string;
  type: string;
  points: number;
  pointsAwarded: number;
  state: AnswerState;
  yourAnswer: string;
  correctAnswer: string;
  explanation: string | null;
}

interface Detail extends Summary {
  quizTitle: string;
  passingScore: number;
  showAnswers: boolean;
  questions: AttemptQuestion[];
}

const STATE_LABEL: Record<AnswerState, string> = {
  CORRECT: "Correct",
  WRONG: "Wrong",
  UNANSWERED: "Not answered",
  AWAITING: "Being marked",
};

function StateIcon({ state }: { state: AnswerState }) {
  if (state === "CORRECT") return <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />;
  if (state === "WRONG") return <XCircle className="size-4 shrink-0 text-rose-500" />;
  if (state === "AWAITING") return <Clock className="size-4 shrink-0 text-amber-500" />;
  return <CircleDashed className="text-muted-foreground size-4 shrink-0" />;
}

/** "1h 04m" / "3m 20s" — a duration a person reads, not a count of seconds. */
function spent(seconds: number): string {
  if (seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function Tally({ n, label, className }: { n: number; label: string; className: string }) {
  return (
    <div className="rounded-lg border p-2 text-center">
      <p className={cn("text-lg font-semibold tabular-nums", className)}>{n}</p>
      <p className="text-muted-foreground text-[11px]">{label}</p>
    </div>
  );
}

export function AttemptHistorySheet({
  open,
  onOpenChange,
  quizId,
  /** Whose attempts. Omit for your own. */
  studentId,
  title = "Previous results",
  /** Quizzes and assignments keep the same shape, on different routes. */
  kind = "quiz",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quizId: string;
  studentId?: string;
  title?: string;
  kind?: "quiz" | "assignment";
}) {
  const listPath = kind === "assignment" ? "assignments" : "quizzes";
  const detailPath = kind === "assignment" ? "assignment-attempts" : "quiz-attempts";
  const [attempts, setAttempts] = useState<Summary[]>([]);
  const [quizTitle, setQuizTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ attempts: Summary[]; quizTitle: string }>(
        `/api/${listPath}/${quizId}/attempts${studentId ? `?student=${studentId}` : ""}`,
      );
      setAttempts(res.attempts);
      setQuizTitle(res.quizTitle);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't load the attempts.");
    } finally {
      setLoading(false);
    }
  }, [quizId, studentId, listPath]);

  // Deferred so the sheet paints before the loading cascade.
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [open, load]);

  // Going back to the list when the sheet is closed, so re-opening starts fresh.
  useEffect(() => {
    if (!open) {
      const id = setTimeout(() => setDetail(null), 200);
      return () => clearTimeout(id);
    }
  }, [open]);

  async function openAttempt(id: string) {
    setOpening(id);
    try {
      setDetail(await api.get<Detail>(`/api/${detailPath}/${id}`));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't open that attempt.");
    } finally {
      setOpening(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b p-6 pb-4">
          <SheetTitle className="leading-snug">
            {detail ? `Attempt ${detail.attemptNo}` : title}
          </SheetTitle>
          <SheetDescription>
            {detail
              ? `${detail.quizTitle} · ${detail.studentName}`
              : quizTitle
                ? `${quizTitle} · ${attempts.length} attempt${attempts.length === 1 ? "" : "s"}`
                : "Loading…"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-muted-foreground flex items-center justify-center gap-2 py-10 text-sm">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </p>
          ) : detail ? (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setDetail(null)}>
                <ChevronLeft className="size-4" /> All attempts
              </Button>

              <Card className="p-4 text-center">
                <p className="text-3xl font-bold tabular-nums">{detail.percent}%</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {detail.score ?? 0} / {detail.maxScore} points · Pass mark{" "}
                  {detail.passingScore}%
                </p>
                <Badge
                  variant="secondary"
                  className={cn(
                    "mt-2",
                    detail.passed
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
                  )}
                >
                  {detail.passed ? "Passed" : "Not passed"}
                </Badge>
              </Card>

              <div className="grid grid-cols-4 gap-2">
                <Tally n={detail.correct} label="Correct" className="text-emerald-600" />
                <Tally n={detail.wrong} label="Wrong" className="text-rose-600" />
                <Tally n={detail.unanswered} label="Unanswered" className="text-muted-foreground" />
                <Tally n={detail.awaiting} label="Being marked" className="text-amber-600" />
              </div>

              <p className="text-muted-foreground text-xs">
                Taken {format(new Date(detail.startedAt), "d MMM yyyy, h:mm a")}
                {detail.submittedAt
                  ? ` · submitted ${format(new Date(detail.submittedAt), "h:mm a")}`
                  : ""}{" "}
                · {spent(detail.timeSpentSeconds)} spent
              </p>

              <div className="space-y-2">
                {detail.questions.map((q) => (
                  <Card key={q.questionId} className="p-4">
                    <div className="flex items-start gap-2">
                      <StateIcon state={q.state} />
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm font-medium">
                          {q.number}. {q.text}
                        </p>
                        <p className="text-xs">
                          <span className="text-muted-foreground">Your answer: </span>
                          {q.yourAnswer || <span className="italic">left blank</span>}
                        </p>
                        {q.correctAnswer && q.state !== "CORRECT" && (
                          <p className="text-xs">
                            <span className="text-muted-foreground">Correct answer: </span>
                            {q.correctAnswer}
                          </p>
                        )}
                        {q.explanation && (
                          <p className="text-muted-foreground text-xs">{q.explanation}</p>
                        )}
                        <p className="text-muted-foreground text-[11px]">
                          {STATE_LABEL[q.state]} · {q.pointsAwarded} of {q.points} point
                          {q.points === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
              {!detail.showAnswers && (
                <p className="text-muted-foreground text-xs">
                  The answer key isn&apos;t shown for this quiz.
                </p>
              )}
            </div>
          ) : attempts.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              No attempts yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {attempts.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => void openAttempt(a.id)}
                    disabled={opening !== null}
                    className="w-full text-left"
                  >
                    <Card className="hover:border-primary/60 p-4 transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {opening === a.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : null}
                          Attempt {a.attemptNo}
                        </span>
                        <span className="flex items-center gap-2">
                          <Badge
                            variant="secondary"
                            className={cn(
                              a.passed
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
                            )}
                          >
                            {a.percent}%
                          </Badge>
                          <span className="text-muted-foreground text-xs tabular-nums">
                            {a.score ?? 0}/{a.maxScore}
                          </span>
                        </span>
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {a.correct} correct · {a.wrong} wrong · {a.unanswered} unanswered
                        {a.awaiting > 0 ? ` · ${a.awaiting} being marked` : ""}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {format(new Date(a.startedAt), "d MMM yyyy, h:mm a")} ·{" "}
                        {spent(a.timeSpentSeconds)}
                      </p>
                    </Card>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
