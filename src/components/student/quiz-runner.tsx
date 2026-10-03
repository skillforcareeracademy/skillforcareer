"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  memo,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  XCircle,
  Check,
  Lock,
  History,
  PauseCircle,
  RefreshCw,
  Trophy,
  Clock,
  Eye,
  NotebookText,
  Timer,
  Lightbulb,
  ListChecks,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { QuizNotesBar } from "./quiz-notes-bar";
import { QuestionReportDialog } from "./question-report-dialog";
import { AttemptHistorySheet } from "@/components/shared/attempt-history-sheet";
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
  /** Seconds per question; null = only the whole-paper clock applies. */
  perQuestionSeconds: number | null;
  passingScore: number;
  maxAttempts: number;
  attemptsUsed: number;
  canAttempt: boolean;
  bookmarked: boolean;
  /** Whether this paper may be stopped part-way and picked up later. */
  allowPause: boolean;
  /** What was saved at the last pause, if anything. */
  paused: {
    answers: { questionId: string; optionIds: string[]; text: string }[];
    timeSpentSeconds: number;
    pausedAt: string;
  } | null;
  /** Marks each question as it is answered, rather than only at the end. */
  showAnswerPerQuestion: boolean;
  categoryName: string | null;
  /** Notes this paper was set from — what to revise. */
  preparedFrom: string[];
  totalPoints: number;
  questions: Question[];
}
/** One question's verdict, asked for as the learner answers it. */
interface Checked {
  questionId: string;
  isCorrect: boolean | null;
  correctOptionIds: string[];
  explanation: string | null;
}
interface Result {
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
  passingScore: number;
  attemptNo: number;
  showAnswers: boolean;
  showAnswerPerQuestion: boolean;
  breakdown: {
    questionId: string;
    isCorrect: boolean | null;
    correctOptionIds: string[];
    yourOptionIds: string[];
    explanation: string | null;
    points: number;
    pointsAwarded: number;
  }[];
}

/** Option ids → the words the learner actually saw, for a summary line. */
function answerTextFor(
  question: Question,
  optionIds: string[],
  text: string,
): string {
  if (question.type === "SHORT_ANSWER") return text.trim() || "Not answered";
  const chosen = question.options
    .filter((o) => optionIds.includes(o.id))
    .map((o) => o.text);
  return chosen.length > 0 ? chosen.join(", ") : "Not answered";
}

/**
 * One question, on its own.
 *
 * Separate and memoised because of what the academy reported: a hundred-question
 * paper on a phone "gets stuck" when you tap an option. Every tap changed one
 * object in the parent, and the parent re-rendered all hundred cards and six
 * hundred option buttons for it — on a mid-range phone, a second of nothing
 * happening. A card now re-renders only when its own answer, verdict or lock
 * changes, so a tap costs one card.
 */
const QuestionCard = memo(function QuestionCard({
  q,
  i,
  a,
  verdict,
  isLocked,
  checking,
  paced,
  quizId,
  showAnswerPerQuestion,
  summaryOpen,
  onSummaryToggle,
  setSingle,
  toggleMulti,
  setText,
  checkOne,
}: {
  q: Question;
  i: number;
  a: { optionIds: string[]; text: string } | undefined;
  verdict: Checked | undefined;
  isLocked: boolean;
  checking: string | null;
  paced: boolean;
  quizId: string;
  showAnswerPerQuestion: boolean;
  summaryOpen: boolean;
  onSummaryToggle: (id: string) => void;
  setSingle: (qid: string, optId: string) => void;
  toggleMulti: (qid: string, optId: string) => void;
  setText: (qid: string, text: string) => void;
  checkOne: (q: Question) => void;
}) {
  const isMulti = q.type === "MULTIPLE_CHOICE";
  const answered = Boolean(a && (a.optionIds.length > 0 || a.text.trim()));
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
      {isMulti && (
        <p className="text-muted-foreground mb-2 text-xs">
          Select all that apply
        </p>
      )}

      {q.type === "SHORT_ANSWER" ? (
        <Input
          value={a?.text ?? ""}
          onChange={(e) => setText(q.id, e.target.value)}
          placeholder="Your answer…"
          disabled={Boolean(verdict) || isLocked}
        />
      ) : (
        <div className="space-y-2">
          {q.options.map((o) => {
            const selected = a?.optionIds.includes(o.id) ?? false;
            const isKey = verdict?.correctOptionIds.includes(o.id) ?? false;
            const wrongPick = Boolean(verdict) && selected && !isKey;
            return (
              <button
                key={o.id}
                type="button"
                disabled={Boolean(verdict) || isLocked}
                onClick={() =>
                  isMulti ? toggleMulti(q.id, o.id) : setSingle(q.id, o.id)
                }
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors",
                  // Once marked, the card reads as the answer key: the
                  // right option green, a wrong pick red, the rest plain.
                  isKey
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                    : wrongPick
                      ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
                      : selected
                        ? "border-primary bg-primary/5"
                        : verdict
                          ? "opacity-70"
                          : "hover:bg-accent",
                )}
              >
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center border",
                    isMulti ? "rounded-md" : "rounded-full",
                    isKey
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : wrongPick
                        ? "border-rose-500 bg-rose-500 text-white"
                        : selected
                          ? "border-primary bg-primary text-white"
                          : "border-input",
                  )}
                >
                  {isKey ? (
                    <Check className="size-3.5" />
                  ) : wrongPick ? (
                    <XCircle className="size-3.5" />
                  ) : (
                    selected && <Check className="size-3.5" />
                  )}
                </span>
                {o.text}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3">
        <QuestionReportDialog
          quizId={quizId}
          questionId={q.id}
          questionNo={i + 1}
        />
      </div>

      {paced && isLocked && !verdict && (
        <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-xs">
          <Timer className="size-3.5" /> Time up on this question — your answer
          is locked in.
        </p>
      )}

      {/* Answer as you go, when the quiz is set that way. Checking locks
                  the answer — seeing the key and then changing your mind isn't
                  practice. */}
      {showAnswerPerQuestion && (
        <div className="mt-3">
          {verdict ? (
            <div className="space-y-1">
              <p
                className={cn(
                  "flex items-center gap-1.5 text-sm font-medium",
                  verdict.isCorrect === null
                    ? "text-muted-foreground"
                    : verdict.isCorrect
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400",
                )}
              >
                {verdict.isCorrect === null ? (
                  <>
                    <Eye className="size-4" /> Your instructor marks this one.
                  </>
                ) : verdict.isCorrect ? (
                  <>
                    <CheckCircle2 className="size-4" /> Correct
                  </>
                ) : (
                  <>
                    <XCircle className="size-4" /> Not quite — the right answer
                    is marked above.
                  </>
                )}
              </p>
              {verdict.explanation && (
                <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                  <Lightbulb className="mt-0.5 size-3.5 shrink-0" />
                  <span>{verdict.explanation}</span>
                </p>
              )}

              {/* "View summary ka option aana chahiye if anyone wants to
                          see the summary question wise" — the question's own
                          summary, without leaving the paper. */}
              <button
                type="button"
                onClick={() => onSummaryToggle(q.id)}
                className="text-primary inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
              >
                <ListChecks className="size-3.5" />
                {summaryOpen ? "Hide summary" : "View summary"}
              </button>

              {summaryOpen && (
                <div className="bg-muted/40 space-y-1 rounded-lg p-3 text-xs">
                  <p>
                    <span className="text-muted-foreground">Your answer: </span>
                    {answerTextFor(q, a?.optionIds ?? [], a?.text ?? "")}
                  </p>
                  {q.type !== "SHORT_ANSWER" && (
                    <p>
                      <span className="text-muted-foreground">
                        Correct answer:{" "}
                      </span>
                      {answerTextFor(q, verdict.correctOptionIds, "")}
                    </p>
                  )}
                  <p className="text-muted-foreground">
                    Worth {q.points} point{q.points === 1 ? "" : "s"} ·{" "}
                    {verdict.isCorrect === null
                      ? "marked by your instructor"
                      : verdict.isCorrect
                        ? "you got this one"
                        : "not this time"}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!answered || checking === q.id}
              onClick={() => checkOne(q)}
            >
              {checking === q.id ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Eye className="size-4" />
              )}
              Check answer
            </Button>
          )}
        </div>
      )}
    </Card>
  );
});

export function QuizRunner({ quiz }: { quiz: QuizData }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<
    Record<string, { optionIds: string[]; text: string }>
  >(() =>
    // Picking up where they left off, when the paper was paused.
    Object.fromEntries(
      (quiz.paused?.answers ?? []).map((a) => [
        a.questionId,
        { optionIds: a.optionIds, text: a.text },
      ]),
    ),
  );
  const [checked, setChecked] = useState<Record<string, Checked>>({});
  const [checking, setChecking] = useState<string | null>(null);
  /** Questions whose summary the learner has opened mid-attempt. */
  const [summaryOpen, setSummaryOpen] = useState<Record<string, boolean>>({});
  /**
   * A per-question limit paces the paper: one question on screen, its own
   * countdown, and no going back once its seconds are up. The whole-paper clock
   * (if the academy set one too) still runs alongside.
   */
  const paced = (quiz.perQuestionSeconds ?? 0) > 0;
  /** Toggling one question's summary, kept stable so the cards stay memoised. */
  const toggleSummary = useCallback((qid: string) => {
    setSummaryOpen((p) => ({ ...p, [qid]: !p[qid] }));
  }, []);

  const [index, setIndex] = useState(0);
  const [locked, setLocked] = useState<Record<string, true>>({});
  const [questionLeft, setQuestionLeft] = useState<number | null>(
    paced ? (quiz.perQuestionSeconds as number) : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  /** Every earlier attempt, on demand. */
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pausing, setPausing] = useState(false);
  // Timer: only when the admin set a time limit — otherwise unlimited.
  const [remaining, setRemaining] = useState<number | null>(
    quiz.timeLimitMinutes ? quiz.timeLimitMinutes * 60 : null,
  );
  const submitRef = useRef<() => void>(() => {});
  /** The current question, so a paced paper can bring it into view. */
  const questionRef = useRef<HTMLDivElement>(null);
  const firstQuestionPaint = useRef(true);

  /** The latest state, for handlers that must not change identity. */
  const latest = useRef({ answers, checked, locked, checking });
  useEffect(() => {
    latest.current = { answers, checked, locked, checking };
  });

  /**
   * The handlers below are passed to every question card, so they have to keep
   * the same identity between renders — a new function each time would hand all
   * hundred cards new props and undo the memoising that keeps a tap cheap.
   * They read the guards off `latest` rather than closing over the state.
   */
  const setSingle = useCallback((qid: string, optId: string) => {
    const { checked: c, locked: l } = latest.current;
    if (c[qid] || l[qid]) return; // marked or timed out — it stands
    setAnswers((p) => ({ ...p, [qid]: { optionIds: [optId], text: "" } }));
  }, []);

  const toggleMulti = useCallback((qid: string, optId: string) => {
    const { checked: c, locked: l } = latest.current;
    if (c[qid] || l[qid]) return;
    setAnswers((p) => {
      const cur = p[qid]?.optionIds ?? [];
      const next = cur.includes(optId)
        ? cur.filter((x) => x !== optId)
        : [...cur, optId];
      return { ...p, [qid]: { optionIds: next, text: "" } };
    });
  }, []);

  const setText = useCallback((qid: string, text: string) => {
    const { checked: c, locked: l } = latest.current;
    if (c[qid] || l[qid]) return;
    setAnswers((p) => ({ ...p, [qid]: { optionIds: [], text } }));
  }, []);

  /**
   * Mark one question now, for a quiz set to answer as it goes. The key comes
   * from the server one question at a time — the paper never carries it — and
   * the answer locks once it has been marked.
   */
  const checkOne = useCallback(
    async (q: Question) => {
      const { answers: all, checked: c, checking: busy } = latest.current;
      const a = all[q.id];
      if (!a || (a.optionIds.length === 0 && !a.text.trim()) || c[q.id] || busy)
        return;
      setChecking(q.id);
      try {
        const res = await api.post<Checked>(`/api/quizzes/${quiz.id}/check`, {
          questionId: q.id,
          optionIds: a.optionIds,
        });
        setChecked((p) => ({ ...p, [q.id]: res }));
      } catch (err) {
        toast.error(
          err instanceof ApiError
            ? err.message
            : "Couldn't check that just now.",
        );
      } finally {
        setChecking(null);
      }
    },
    [quiz.id],
  );

  // The result screen replaces the paper in place, so a learner who submitted
  // from the last question stayed parked at the bottom of a long page instead
  // of seeing their score — "submit krne ke baad apne aap top me score board
  // pr nhi le jaa rha". Take them to it.
  useEffect(() => {
    if (result) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [result]);

  /**
   * A paced paper swaps one question for the next in place, and the page keeps
   * whatever scroll position the last one left it at. On a phone — where a
   * question with its options and an open summary is taller than the screen —
   * the next question opens halfway down, its number and wording above the
   * fold, and the page reads as stuck. Bring the question back into view, the
   * same way submitting takes them up to their score.
   */
  useEffect(() => {
    if (!paced || result) return;
    if (firstQuestionPaint.current) {
      firstQuestionPaint.current = false;
      return;
    }
    questionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [index, paced, result]);

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

  // The question's own clock. Runs down while the question is on screen and
  // locks it at zero — the answer as it stands is the answer.
  useEffect(() => {
    if (!paced || !quiz.canAttempt || result) return;
    const question = quiz.questions[index];
    if (!question || locked[question.id]) return;
    const deadline = Date.now() + (quiz.perQuestionSeconds as number) * 1000;
    const id = setInterval(() => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setQuestionLeft(left);
      if (left <= 0) {
        clearInterval(id);
        setLocked((p) => ({ ...p, [question.id]: true }));
      }
    }, 250);
    return () => clearInterval(id);
  }, [
    paced,
    index,
    quiz.canAttempt,
    quiz.questions,
    quiz.perQuestionSeconds,
    locked,
    result,
  ]);

  if (!quiz.canAttempt && !result) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-10 text-center">
        <div className="bg-muted mx-auto grid size-14 place-items-center rounded-2xl">
          <Lock className="text-muted-foreground size-7" />
        </div>
        <h1 className="text-xl font-bold">{quiz.title}</h1>
        <p className="text-muted-foreground text-sm">
          You&apos;ve used all {quiz.maxAttempts} attempt
          {quiz.maxAttempts === 1 ? "" : "s"} for this quiz.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/student/quizzes" />}
          >
            <ArrowLeft className="size-4" /> Back to quizzes
          </Button>
          <Button onClick={() => setHistoryOpen(true)}>
            <History className="size-4" /> See previous results
          </Button>
        </div>
        <QuizNotesBar
          quizId={quiz.id}
          bookmarked={quiz.bookmarked}
          className="mx-auto max-w-md text-left"
        />
        <AttemptHistorySheet
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          quizId={quiz.id}
        />
      </div>
    );
  }

  /** Lock what is on screen and move to the next question. */
  function nextQuestion() {
    const question = quiz.questions[index];
    if (question) setLocked((p) => ({ ...p, [question.id]: true }));
    if (index < quiz.questions.length - 1) {
      setIndex(index + 1);
      setQuestionLeft(quiz.perQuestionSeconds ?? null);
    }
  }

  const answeredCount = quiz.questions.filter((q) => {
    const a = answers[q.id];
    return a && (a.optionIds.length > 0 || a.text.trim().length > 0);
  }).length;

  /**
   * Stop here and come back to it. The answers so far and the time spent are
   * saved against this attempt, so resuming does not use up another one.
   */
  async function pause() {
    setPausing(true);
    try {
      await api.post(`/api/quizzes/${quiz.id}/pause`, {
        answers: quiz.questions.map((q) => ({
          questionId: q.id,
          optionIds: answers[q.id]?.optionIds ?? [],
          text: answers[q.id]?.text ?? "",
        })),
        timeSpentSeconds: spentSoFar(),
      });
      toast.success("Saved — pick it up whenever you like.");
      router.push("/student/quizzes");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Couldn't save that.",
      );
    } finally {
      setPausing(false);
    }
  }

  /** Seconds on this sitting, plus anything carried over from an earlier one. */
  function spentSoFar(): number {
    const thisSitting =
      quiz.timeLimitMinutes && remaining != null
        ? quiz.timeLimitMinutes * 60 - remaining
        : 0;
    return Math.max(0, thisSitting) + (quiz.paused?.timeSpentSeconds ?? 0);
  }

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
      const res = await api.post<Result>(
        `/api/quizzes/${quiz.id}/submit`,
        payload,
      );
      setResult(res);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't submit quiz.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ── Result screen ──────────────────────────────────────────────────────────
  if (result) {
    const bd = new Map(result.breakdown.map((b) => [b.questionId, b]));
    const tally = result.breakdown.reduce(
      (acc, b) => {
        const answered = b.yourOptionIds.length > 0;
        if (b.isCorrect === null) acc.manual += 1;
        else if (b.isCorrect) acc.correct += 1;
        else if (answered) acc.incorrect += 1;
        else acc.unanswered += 1;
        return acc;
      },
      { correct: 0, incorrect: 0, unanswered: 0, manual: 0 },
    );
    // A paper answered as it went has already shown every key, so the summary
    // at the end shows them too — "last me submit krne ke baad to summary with
    // all answers aayegi hi". Otherwise the admin's setting decides.
    const showSummary = result.showAnswers || result.showAnswerPerQuestion;
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-2">
        <Link
          href="/student/quizzes"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" /> Back to quizzes
        </Link>

        <Card
          className={cn(
            "p-8 text-center",
            result.passed
              ? "border-emerald-200 dark:border-emerald-900/40"
              : "border-amber-200 dark:border-amber-900/40",
          )}
        >
          <div
            className={cn(
              "mx-auto mb-4 grid size-16 place-items-center rounded-full text-white",
              result.passed
                ? "bg-gradient-to-br from-emerald-500 to-green-600"
                : "bg-gradient-to-br from-amber-500 to-orange-600",
            )}
          >
            {result.passed ? (
              <Trophy className="size-8" />
            ) : (
              <RefreshCw className="size-8" />
            )}
          </div>
          <p className="text-4xl font-bold tabular-nums">{result.percent}%</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {result.score} / {result.maxScore} points · Pass mark{" "}
            {result.passingScore}%
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
            {result.passed ? (
              <>
                <CheckCircle2 className="size-3.5" /> Passed
              </>
            ) : (
              "Not passed"
            )}
          </Badge>
          {/* "Only try again button shouldn't be coming. More buttons should be
              coming like see previous results." */}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/student/quizzes" />}
            >
              Back to quizzes
            </Button>
            <Button variant="outline" onClick={() => setHistoryOpen(true)}>
              <History className="size-4" /> See previous results
            </Button>
            {(quiz.maxAttempts === 0 ||
              quiz.attemptsUsed + 1 < quiz.maxAttempts) && (
              <Button onClick={() => router.refresh()}>
                <RefreshCw className="size-4" /> Try again
              </Button>
            )}
          </div>
        </Card>

        {/* The analysis the academy asked for: what was right, what wasn't, and
            what is still with the instructor — every time, whatever the answer
            key setting says. */}
        <Card className="p-5">
          <h2 className="mb-3 text-lg font-semibold">Analysis</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: "Correct",
                value: tally.correct,
                tone: "text-emerald-600 dark:text-emerald-400",
              },
              {
                label: "Incorrect",
                value: tally.incorrect,
                tone: "text-rose-600 dark:text-rose-400",
              },
              {
                label: "Unanswered",
                value: tally.unanswered,
                tone: "text-muted-foreground",
              },
              {
                label: "Being marked",
                value: tally.manual,
                tone: "text-amber-600 dark:text-amber-400",
              },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border p-3 text-center">
                <p
                  className={cn("text-2xl font-semibold tabular-nums", s.tone)}
                >
                  {s.value}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            Attempt {result.attemptNo} · {result.score} of {result.maxScore}{" "}
            points · {quiz.questions.length} question
            {quiz.questions.length === 1 ? "" : "s"}
          </p>
        </Card>

        <QuizNotesBar quizId={quiz.id} bookmarked={quiz.bookmarked} />

        {showSummary ? (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Summary — every question</h2>
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
                                isCorrect &&
                                  "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
                                chosen &&
                                  !isCorrect &&
                                  "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300",
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
                              {chosen && (
                                <span className="text-muted-foreground text-xs">
                                  (your answer)
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      {q.type === "SHORT_ANSWER" && (
                        <p className="text-muted-foreground mt-1 text-xs">
                          Short answers are reviewed by your instructor.
                        </p>
                      )}
                      {b?.explanation && (
                        <p className="text-muted-foreground mt-2 flex items-start gap-1.5 text-xs">
                          <Lightbulb className="mt-0.5 size-3.5 shrink-0" />
                          <span>{b.explanation}</span>
                        </p>
                      )}
                      <div className="mt-2">
                        <QuestionReportDialog
                          quizId={quiz.id}
                          questionId={q.id}
                          questionNo={i + 1}
                        />
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          // The academy chose not to show the answers. The learner still gets
          // their own paper back, question by question, without the key.
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Summary</h2>
            {quiz.questions.map((q, i) => {
              const b = bd.get(q.id);
              return (
                <Card key={q.id} className="flex items-start gap-2 p-4">
                  {b?.isCorrect === null ? (
                    <Clock className="mt-0.5 size-4 shrink-0 text-amber-500" />
                  ) : b?.isCorrect ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {i + 1}. {q.text}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {b?.isCorrect === null
                        ? "Your instructor is marking this one."
                        : `${b?.pointsAwarded ?? 0} of ${b?.points ?? q.points} point${(b?.points ?? q.points) === 1 ? "" : "s"}`}
                    </p>
                  </div>
                </Card>
              );
            })}
            <p className="text-muted-foreground text-xs">
              The answer key isn&apos;t shown for this quiz.
            </p>
          </div>
        )}

        <AttemptHistorySheet
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          quizId={quiz.id}
        />
      </div>
    );
  }

  // ── Taking screen ──────────────────────────────────────────────────────────
  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-6 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/student/quizzes"
            className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-sm"
          >
            <ArrowLeft className="size-4" /> Quizzes
          </Link>
          <h1 className="text-2xl font-bold">{quiz.title}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {quiz.categoryName ? `${quiz.categoryName} · ` : ""}
            {quiz.courseTitle} · {quiz.questions.length} questions ·{" "}
            {quiz.totalPoints} points · Pass {quiz.passingScore}%
          </p>
          {quiz.preparedFrom.length > 0 && (
            <p className="text-muted-foreground mt-1 flex items-start gap-1.5 text-xs">
              <NotebookText className="mt-0.5 size-3.5 shrink-0" />
              <span>Set from your notes: {quiz.preparedFrom.join(", ")}</span>
            </p>
          )}
        </div>
        <div className="sticky top-4 flex shrink-0 flex-col items-end gap-1.5">
          {remaining != null && (
            <div
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 font-mono text-sm font-semibold tabular-nums ${
                remaining <= 60
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  : "bg-muted"
              }`}
              aria-label="Time remaining"
            >
              <Clock className="size-4" />
              {String(Math.floor(remaining / 60)).padStart(2, "0")}:
              {String(remaining % 60).padStart(2, "0")}
            </div>
          )}
          {/* The question's own clock, when the academy set one. */}
          {paced && questionLeft != null && (
            <div
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold tabular-nums ${
                questionLeft <= 5
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  : "bg-muted"
              }`}
              aria-label="Time left on this question"
            >
              <Timer className="size-3.5" />
              {questionLeft}s
            </div>
          )}
        </div>
      </div>

      {quiz.paused && (
        <p className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs">
          <PauseCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Picked up where you left off — your answers from{" "}
            {new Date(quiz.paused.pausedAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            are still here. This still counts as the same attempt.
          </span>
        </p>
      )}

      <QuizNotesBar quizId={quiz.id} bookmarked={quiz.bookmarked} />

      <div ref={questionRef} className="scroll-mt-20 space-y-4">
        {(paced ? quiz.questions.slice(index, index + 1) : quiz.questions).map(
          (q) => (
            <QuestionCard
              key={q.id}
              q={q}
              i={quiz.questions.indexOf(q)}
              a={answers[q.id]}
              verdict={checked[q.id]}
              isLocked={Boolean(locked[q.id])}
              checking={checking}
              paced={paced}
              quizId={quiz.id}
              showAnswerPerQuestion={quiz.showAnswerPerQuestion}
              summaryOpen={Boolean(summaryOpen[q.id])}
              onSummaryToggle={toggleSummary}
              setSingle={setSingle}
              toggleMulti={toggleMulti}
              setText={setText}
              checkOne={checkOne}
            />
          ),
        )}
      </div>

      <div className="bg-background/80 sticky bottom-0 flex items-center justify-between gap-3 border-t py-3 backdrop-blur">
        <p className="text-muted-foreground text-sm">
          {paced
            ? `Question ${index + 1} of ${quiz.questions.length}`
            : `${answeredCount}/${quiz.questions.length} answered`}
        </p>
        <div className="flex items-center gap-2">
          {quiz.allowPause && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void pause()}
              disabled={pausing || submitting}
            >
              {pausing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PauseCircle className="size-4" />
              )}
              Pause
            </Button>
          )}
          {paced && index < quiz.questions.length - 1 ? (
            <Button type="button" onClick={nextQuestion}>
              Next question
            </Button>
          ) : (
            <Button type="submit" disabled={submitting || answeredCount === 0}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Submit quiz
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
