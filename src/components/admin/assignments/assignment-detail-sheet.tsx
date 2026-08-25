"use client";

import { useEffect, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  BookOpen,
  CalendarClock,
  Award,
  FileText,
  Loader2,
  CheckCircle2,
  ClipboardList,
  Users,
} from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { SUBMISSION_STATUS_LABEL } from "@/lib/validations/assignment";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface AnswerRecord {
  questionId: string;
  optionIds?: string[];
  text?: string;
  points?: number;
  isCorrect?: boolean | null;
}
interface Submission {
  id: string;
  status: string;
  score: number | null;
  autoScore: number | null;
  feedback: string | null;
  content: string | null;
  fileUrl: string | null;
  answers: AnswerRecord[] | null;
  submittedAt: string | null;
  batchId: string | null;
  batchName: string | null;
  student: { id: string; name: string; email: string; avatarUrl: string | null };
}
interface QuestionRow {
  id: string;
  type: string;
  text: string;
  points: number;
  correctAnswer: string | null;
  options: { id: string; text: string; isCorrect: boolean }[];
}
interface Detail {
  id: string;
  title: string;
  type: string;
  gradingMode: string;
  description: string | null;
  instructions: string | null;
  maxScore: number;
  dueDate: string | null;
  allowLate: boolean;
  course: { title: string; slug: string } | null;
  createdBy: { name: string; avatarUrl: string | null };
  batches: { id: string; name: string }[];
  questions: QuestionRow[];
  submissions: Submission[];
}

const ALL_BATCHES = "all";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  SUBMITTED: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  GRADED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  RESUBMIT_REQUESTED: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  LATE: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
};

function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function AssignmentDetailSheet({
  assignmentId,
  onOpenChange,
}: {
  assignmentId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={assignmentId != null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {assignmentId && <DetailBody key={assignmentId} assignmentId={assignmentId} />}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({ assignmentId }: { assignmentId: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState(false);
  const [gradingId, setGradingId] = useState<string | null>(null);
  /** Read submissions one cohort at a time — the client's main ask here. */
  const [batchFilter, setBatchFilter] = useState<string>(ALL_BATCHES);

  function load() {
    return api
      .get<Detail>(`/api/assignments/${assignmentId}`)
      .then(setData)
      .catch(() => setError(true));
  }

  useEffect(() => {
    let alive = true;
    api
      .get<Detail>(`/api/assignments/${assignmentId}`)
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [assignmentId]);

  if (error) {
    return (
      <div className="p-6">
        <SheetHeader className="p-0">
          <SheetTitle>Assignment</SheetTitle>
          <SheetDescription>Couldn&apos;t load this assignment.</SheetDescription>
        </SheetHeader>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  // Every cohort that actually has a submission, plus any the work was set for.
  const batchOptions = [
    ...new Map(
      [
        ...data.batches.map((b) => [b.id, b.name] as const),
        ...data.submissions
          .filter((s) => s.batchId && s.batchName)
          .map((s) => [s.batchId as string, s.batchName as string] as const),
      ].map(([id, name]) => [id, name]),
    ).entries(),
  ].map(([id, name]) => ({ id, name }));

  const visible =
    batchFilter === ALL_BATCHES
      ? data.submissions
      : data.submissions.filter((s) => s.batchId === batchFilter);

  const graded = visible.filter((s) => s.status === "GRADED").length;
  const pending = visible.filter((s) => s.status === "SUBMITTED" || s.status === "LATE").length;

  return (
    <div className="flex flex-col">
      <SheetHeader className="border-b p-6 pb-4">
        <SheetTitle className="pr-8 text-xl leading-snug">{data.title}</SheetTitle>
        <SheetDescription>
          {data.course ? data.course.title : "No course"} · by {data.createdBy.name}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 p-6">
        {/* Meta */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <MetaBox icon={Award} label="Max score" value={String(data.maxScore)} />
          <MetaBox
            icon={CalendarClock}
            label="Due"
            value={data.dueDate ? format(new Date(data.dueDate), "d MMM") : "—"}
          />
          <MetaBox
            icon={CheckCircle2}
            label="Late"
            value={data.allowLate ? "Allowed" : "No"}
          />
        </div>

        {data.course && (
          <div className="flex items-center gap-3">
            <span className="bg-muted grid size-9 shrink-0 place-items-center rounded-lg">
              <BookOpen className="size-4 text-rose-500" />
            </span>
            <div className="min-w-0">
              <p className="text-muted-foreground text-xs">Course</p>
              <p className="truncate text-sm font-medium">{data.course.title}</p>
            </div>
          </div>
        )}

        {(data.description || data.instructions) && (
          <section className="rounded-xl border p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <FileText className="size-4 text-muted-foreground" /> Details
            </div>
            {data.description && <p className="text-sm">{data.description}</p>}
            {data.instructions && (
              <p className="text-muted-foreground mt-2 text-sm whitespace-pre-wrap">
                {data.instructions}
              </p>
            )}
          </section>
        )}

        {/* Submissions */}
        <section>
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <ClipboardList className="size-4 text-muted-foreground" />
            Submissions
            <span className="text-muted-foreground font-normal">({visible.length})</span>
            {pending > 0 && (
              <Badge variant="secondary" className="ml-auto bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                {pending} to grade
              </Badge>
            )}
          </div>

          {batchOptions.length > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <Users className="text-muted-foreground size-4 shrink-0" />
              <Select value={batchFilter} onValueChange={(v) => v && setBatchFilter(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) =>
                      !v || v === ALL_BATCHES
                        ? "All batches"
                        : (batchOptions.find((b) => b.id === v)?.name ?? "Batch")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_BATCHES}>All batches</SelectItem>
                  {batchOptions.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {visible.length === 0 ? (
            <div className="rounded-xl border border-dashed py-8 text-center">
              <ClipboardList className="text-muted-foreground mx-auto mb-2 size-6" />
              <p className="text-sm font-medium">
                {batchFilter === ALL_BATCHES ? "No submissions yet" : "Nothing from this batch"}
              </p>
              <p className="text-muted-foreground mx-auto mt-1 max-w-xs text-xs">
                Learner submissions will appear here for grading.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {visible.map((s) => (
                <li key={s.id} className="rounded-xl border p-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-9">
                      {s.student.avatarUrl && <AvatarImage src={s.student.avatarUrl} alt={s.student.name} />}
                      <AvatarFallback className="text-xs">{initials(s.student.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.student.name}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {s.submittedAt ? format(new Date(s.submittedAt), "d MMM, h:mm a") : "Not submitted"}
                        {s.batchName ? ` · ${s.batchName}` : ""}
                      </p>
                    </div>
                    {s.score != null && (
                      <span className="text-sm font-semibold tabular-nums">
                        {s.score}
                        <span className="text-muted-foreground font-normal">/{data.maxScore}</span>
                      </span>
                    )}
                    <Badge variant="secondary" className={cn("shrink-0", STATUS_BADGE[s.status])}>
                      {SUBMISSION_STATUS_LABEL[s.status] ?? s.status}
                    </Badge>
                  </div>

                  {/* What they actually answered — a marker shouldn't have to
                      open another screen to see it. */}
                  {data.questions.length > 0 && s.answers && s.answers.length > 0 && (
                    <AnswerSheet
                      questions={data.questions}
                      answers={s.answers}
                      autoScore={s.autoScore}
                      maxScore={data.maxScore}
                    />
                  )}
                  {s.content && (
                    <p className="bg-muted/40 mt-2 rounded-lg p-3 text-sm whitespace-pre-wrap">
                      {s.content}
                    </p>
                  )}
                  {s.fileUrl && (
                    <a
                      href={s.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary mt-2 inline-flex items-center gap-1.5 text-xs hover:underline"
                    >
                      <FileText className="size-3.5" /> Open submitted file
                    </a>
                  )}

                  {gradingId === s.id ? (
                    <GradeForm
                      submission={s}
                      maxScore={data.maxScore}
                      onCancel={() => setGradingId(null)}
                      onDone={async () => {
                        setGradingId(null);
                        await load();
                      }}
                    />
                  ) : (
                    (s.status === "SUBMITTED" || s.status === "LATE" || s.status === "GRADED") && (
                      <div className="mt-2 flex justify-end">
                        <Button variant="outline" size="sm" onClick={() => setGradingId(s.id)}>
                          {s.status === "GRADED" ? "Re-grade" : "Grade"}
                        </Button>
                      </div>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}

          {visible.length > 0 && (
            <p className="text-muted-foreground mt-3 text-xs">
              {graded} graded · {pending} pending
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function MetaBox({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Award;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border p-3">
      <Icon className="text-muted-foreground mx-auto size-4" />
      <p className="mt-1 text-sm font-semibold">{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}

function GradeForm({
  submission,
  maxScore,
  onCancel,
  onDone,
}: {
  submission: Submission;
  maxScore: number;
  onCancel: () => void;
  onDone: () => void | Promise<void>;
}) {
  const [score, setScore] = useState(submission.score != null ? String(submission.score) : "");
  const [feedback, setFeedback] = useState(submission.feedback ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/api/submissions/${submission.id}/grade`, {
        score: Number(score),
        feedback,
        status: "GRADED",
      });
      toast.success("Submission graded.");
      await onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't grade.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 border-t pt-3">
      <div className="space-y-1">
        <Label htmlFor={`score-${submission.id}`} className="text-xs">
          Score (out of {maxScore})
        </Label>
        <Input
          id={`score-${submission.id}`}
          type="number"
          min={0}
          max={maxScore}
          value={score}
          onChange={(e) => setScore(e.target.value)}
          className="w-28"
        />
      </div>
      <Textarea
        rows={2}
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Feedback (optional)"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving || score === ""}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Save grade
        </Button>
      </div>
    </form>
  );
}

/**
 * A learner's answers laid against the paper, with the key shown alongside.
 *
 * Choice questions carry what the auto-marker awarded; written ones are the
 * reason a person is reading this at all, so they get the model answer next to
 * the response.
 */
function AnswerSheet({
  questions,
  answers,
  autoScore,
  maxScore,
}: {
  questions: QuestionRow[];
  answers: AnswerRecord[];
  autoScore: number | null;
  maxScore: number;
}) {
  const byQuestion = new Map(answers.map((a) => [a.questionId, a]));

  return (
    <details className="mt-3 rounded-lg border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        Answers
        {autoScore != null && (
          <span className="text-muted-foreground ml-2 font-normal">
            auto-marked {autoScore}/{maxScore}
          </span>
        )}
      </summary>
      <ol className="space-y-3 border-t p-3">
        {questions.map((q, i) => {
          const a = byQuestion.get(q.id);
          const chosen = new Set(a?.optionIds ?? []);
          return (
            <li key={q.id} className="text-sm">
              <p className="font-medium">
                {i + 1}. {q.text}
              </p>
              {q.options.length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {q.options.map((o) => {
                    const picked = chosen.has(o.id);
                    return (
                      <li
                        key={o.id}
                        className={cn(
                          "flex items-center gap-1.5 text-xs",
                          o.isCorrect
                            ? "text-emerald-700 dark:text-emerald-400"
                            : picked
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-muted-foreground",
                        )}
                      >
                        <span className="w-10 shrink-0 font-medium">
                          {picked ? "chose" : ""}
                        </span>
                        {o.text}
                        {o.isCorrect && <CheckCircle2 className="size-3 shrink-0" />}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="mt-1 space-y-1">
                  <p className="bg-muted/40 rounded p-2 text-xs whitespace-pre-wrap">
                    {a?.text?.trim() ? a.text : "No answer given."}
                  </p>
                  {q.correctAnswer && (
                    <p className="text-muted-foreground text-xs">
                      <span className="font-medium">Model answer:</span> {q.correctAnswer}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
