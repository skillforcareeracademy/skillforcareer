"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  Check,
  Lock,
  RefreshCw,
  Trophy,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Option {
  id: string;
  text: string;
}
interface Question {
  id: string;
  type: string;
  text: string;
  points: number;
  options: Option[];
}
interface QuizData {
  id: string;
  title: string;
  description: string | null;
  courseTitle: string | null;
  timeLimitMinutes: number | null;
  passingScore: number;
  maxAttempts: number;
  attemptsUsed: number;
  canAttempt: boolean;
  totalPoints: number;
  questions: Question[];
}
interface Result {
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
  passingScore: number;
  attemptNo: number;
  showAnswers: boolean;
  breakdown: {
    questionId: string;
    isCorrect: boolean | null;
    correctOptionIds: string[];
    yourOptionIds: string[];
    explanation: string | null;
  }[];
}

export function QuizRunner({ quiz }: { quiz: QuizData }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, { optionIds: string[]; text: string }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  // Timer: only when the admin set a time limit — otherwise unlimited.
  const [remaining, setRemaining] = useState<number | null>(
    quiz.timeLimitMinutes ? quiz.timeLimitMinutes * 60 : null,
  );
  const submitRef = useRef<() => void>(() => {});

  // Keep a stable pointer to the latest submit for the timer to call on timeout.
  useEffect(() => {
    submitRef.current = () => {
      void submit();
    };
  });

  // Countdown + auto-submit when time runs out (only for timed quizzes).
  useEffect(() => {
    if (!quiz.timeLimitMinutes || !quiz.canAttempt) return;
    const deadline = Date.now() + quiz.timeLimitMinutes * 60_000;
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        clearInterval(id);
        toast.message("Time's up — submitting your quiz.");
        submitRef.current();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [quiz.timeLimitMinutes, quiz.canAttempt]);

  if (!quiz.canAttempt && !result) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-10 text-center">
        <div className="bg-muted mx-auto grid size-14 place-items-center rounded-2xl">
          <Lock className="text-muted-foreground size-7" />
        </div>
        <h1 className="text-xl font-bold">{quiz.title}</h1>
        <p className="text-muted-foreground text-sm">
          You&apos;ve used all {quiz.maxAttempts} attempt{quiz.maxAttempts === 1 ? "" : "s"} for this quiz.
        </p>
        <Button nativeButton={false} render={<Link href="/student/quizzes" />}>
          <ArrowLeft className="size-4" /> Back to quizzes
        </Button>
      </div>
    );
  }

  function setSingle(qid: string, optId: string) {
    setAnswers((p) => ({ ...p, [qid]: { optionIds: [optId], text: "" } }));
  }
  function toggleMulti(qid: string, optId: string) {
    setAnswers((p) => {
      const cur = p[qid]?.optionIds ?? [];
      const next = cur.includes(optId) ? cur.filter((x) => x !== optId) : [...cur, optId];
      return { ...p, [qid]: { optionIds: next, text: "" } };
    });
  }
  function setText(qid: string, text: string) {
    setAnswers((p) => ({ ...p, [qid]: { optionIds: [], text } }));
  }

  const answeredCount = quiz.questions.filter((q) => {
    const a = answers[q.id];
    return a && (a.optionIds.length > 0 || a.text.trim().length > 0);
  }).length;

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (submitting || result) return; // guard against double / post-timeout submit
    setSubmitting(true);
    try {
      const payload = {
        answers: quiz.questions.map((q) => ({
          questionId: q.id,
          optionIds: answers[q.id]?.optionIds ?? [],
          text: answers[q.id]?.text ?? "",
        })),
      };
      const res = await api.post<Result>(`/api/quizzes/${quiz.id}/submit`, payload);
      setResult(res);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't submit quiz.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Result screen ──────────────────────────────────────────────────────────
  if (result) {
    const bd = new Map(result.breakdown.map((b) => [b.questionId, b]));
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-2">
        <Link href="/student/quizzes" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm">
          <ArrowLeft className="size-4" /> Back to quizzes
        </Link>

        <Card
          className={cn(
            "p-8 text-center",
            result.passed ? "border-emerald-200 dark:border-emerald-900/40" : "border-amber-200 dark:border-amber-900/40",
          )}
        >
          <div
            className={cn(
              "mx-auto mb-4 grid size-16 place-items-center rounded-full text-white",
              result.passed ? "bg-gradient-to-br from-emerald-500 to-green-600" : "bg-gradient-to-br from-amber-500 to-orange-600",
            )}
          >
            {result.passed ? <Trophy className="size-8" /> : <RefreshCw className="size-8" />}
          </div>
          <p className="text-4xl font-bold tabular-nums">{result.percent}%</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {result.score} / {result.maxScore} points · Pass mark {result.passingScore}%
          </p>
          <Badge
            variant="secondary"
            className={cn(
              "mt-3",
              result.passed
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
            )}
          >
            {result.passed ? "Passed 🎉" : "Not passed"}
          </Badge>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="outline" nativeButton={false} render={<Link href="/student/quizzes" />}>
              Back to quizzes
            </Button>
            {quiz.attemptsUsed + 1 < quiz.maxAttempts && (
              <Button onClick={() => router.refresh()}>
                <RefreshCw className="size-4" /> Try again
              </Button>
            )}
          </div>
        </Card>

        {result.showAnswers && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Review</h2>
            {quiz.questions.map((q, i) => {
              const b = bd.get(q.id);
              return (
                <Card key={q.id} className="p-4">
                  <div className="flex items-start gap-2">
                    {b?.isCorrect ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                    ) : (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {i + 1}. {q.text}
                      </p>
                      <ul className="mt-2 space-y-1">
                        {q.options.map((o) => {
                          const isCorrect = b?.correctOptionIds.includes(o.id);
                          const chosen = b?.yourOptionIds.includes(o.id);
                          return (
                            <li
                              key={o.id}
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1 text-sm",
                                isCorrect && "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
                                chosen && !isCorrect && "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
                              )}
                            >
                              {isCorrect ? (
                                <Check className="size-3.5" />
                              ) : chosen ? (
                                <XCircle className="size-3.5" />
                              ) : (
                                <span className="size-3.5" />
                              )}
                              {o.text}
                              {chosen && <span className="text-muted-foreground text-xs">(your answer)</span>}
                            </li>
                          );
                        })}
                      </ul>
                      {q.type === "SHORT_ANSWER" && (
                        <p className="text-muted-foreground mt-1 text-xs">Short answers are reviewed by your instructor.</p>
                      )}
                      {b?.explanation && (
                        <p className="text-muted-foreground mt-2 text-xs">💡 {b.explanation}</p>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Taking screen ──────────────────────────────────────────────────────────
  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-6 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/student/quizzes" className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-sm">
            <ArrowLeft className="size-4" /> Quizzes
          </Link>
          <h1 className="text-2xl font-bold">{quiz.title}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {quiz.courseTitle} · {quiz.questions.length} questions · {quiz.totalPoints} points · Pass {quiz.passingScore}%
          </p>
        </div>
        {remaining != null && (
          <div
            className={`sticky top-4 flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 font-mono text-sm font-semibold tabular-nums ${
              remaining <= 60
                ? "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                : "bg-muted"
            }`}
            aria-label="Time remaining"
          >
            <Clock className="size-4" />
            {String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}
          </div>
        )}
      </div>

      {quiz.questions.map((q, i) => {
        const a = answers[q.id];
        const isMulti = q.type === "MULTIPLE_CHOICE";
        return (
          <Card key={q.id} className="p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="font-medium">
                {i + 1}. {q.text}
              </p>
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {q.points} pt{q.points === 1 ? "" : "s"}
              </Badge>
            </div>
            {isMulti && <p className="text-muted-foreground mb-2 text-xs">Select all that apply</p>}

            {q.type === "SHORT_ANSWER" ? (
              <Input
                value={a?.text ?? ""}
                onChange={(e) => setText(q.id, e.target.value)}
                placeholder="Your answer…"
              />
            ) : (
              <div className="space-y-2">
                {q.options.map((o) => {
                  const selected = a?.optionIds.includes(o.id) ?? false;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => (isMulti ? toggleMulti(q.id, o.id) : setSingle(q.id, o.id))}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors",
                        selected ? "border-primary bg-primary/5" : "hover:bg-accent",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-5 shrink-0 place-items-center border",
                          isMulti ? "rounded-md" : "rounded-full",
                          selected ? "border-primary bg-primary text-white" : "border-input",
                        )}
                      >
                        {selected && <Check className="size-3.5" />}
                      </span>
                      {o.text}
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}

      <div className="bg-background/80 sticky bottom-0 flex items-center justify-between gap-3 border-t py-3 backdrop-blur">
        <p className="text-muted-foreground text-sm">
          {answeredCount}/{quiz.questions.length} answered
        </p>
        <Button type="submit" disabled={submitting || answeredCount === 0}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          Submit quiz
        </Button>
      </div>
    </form>
  );
}
