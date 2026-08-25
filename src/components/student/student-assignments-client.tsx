"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ClipboardList,
  CheckCircle2,
  Hourglass,
  Award,
  Loader2,
  CalendarClock,
  FileText,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import type { StudentAssignment } from "@/server/services/student-assignment-service";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/shared/button-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type A = StudentAssignment;

function statusOf(a: A): { label: string; cls: string } {
  const s = a.submission;
  if (s?.status === "GRADED") return { label: "Graded", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" };
  if (s?.status === "RESUBMIT_REQUESTED") return { label: "Resubmit", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" };
  if (s?.status === "LATE") return { label: "Submitted late", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" };
  if (s?.status === "SUBMITTED") return { label: "Submitted", cls: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" };
  if (a.isOverdue && !a.allowLate) return { label: "Missed", cls: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" };
  return { label: "Not submitted", cls: "bg-muted text-muted-foreground" };
}

export function StudentAssignmentsClient({ assignments }: { assignments: A[] }) {
  const [active, setActive] = useState<A | null>(null);

  const stats = {
    total: assignments.length,
    submitted: assignments.filter((a) => a.submission && a.submission.status !== "GRADED").length,
    graded: assignments.filter((a) => a.submission?.status === "GRADED").length,
    todo: assignments.filter((a) => !a.submission && !(a.isOverdue && !a.allowLate)).length,
  };
  const statCards = [
    { label: "Assignments", value: stats.total, icon: ClipboardList, tone: "text-rose-500" },
    { label: "To do", value: stats.todo, icon: Hourglass, tone: "text-amber-500" },
    { label: "Submitted", value: stats.submitted, icon: CheckCircle2, tone: "text-sky-500" },
    { label: "Graded", value: stats.graded, icon: Award, tone: "text-emerald-500" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assignments"
        description="Submit your work and see your grades and feedback."
      />

      {assignments.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No assignments yet"
          description="Assignments from your enrolled courses will appear here."
          action={<ButtonLink href="/courses">Browse courses</ButtonLink>}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
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
            {assignments.map((a) => {
              const st = statusOf(a);
              const graded = a.submission?.status === "GRADED";
              return (
                <Card key={a.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{a.title}</h3>
                      <p className="text-muted-foreground truncate text-xs">{a.courseTitle}</p>
                    </div>
                    <Badge variant="secondary" className={cn("shrink-0", st.cls)}>
                      {st.label}
                    </Badge>
                  </div>

                  <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className={cn("flex items-center gap-1", a.isOverdue && !a.submission && "text-rose-600")}>
                      <CalendarClock className="size-3.5" />
                      {a.dueDate ? `Due ${format(new Date(a.dueDate), "d MMM yyyy")}` : "No due date"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Award className="size-3.5" /> {a.maxScore} pts
                    </span>
                  </div>

                  {graded && (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                      <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                        Score: {a.submission!.score}/{a.maxScore}
                      </p>
                      {a.submission!.feedback && (
                        <p className="text-muted-foreground mt-1 text-xs">{a.submission!.feedback}</p>
                      )}
                    </div>
                  )}

                  <div className="mt-4">
                    <Button
                      variant={a.submission ? "outline" : "default"}
                      size="sm"
                      onClick={() => setActive(a)}
                    >
                      {graded ? "View" : a.submission ? "View / resubmit" : "Submit"}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <SubmitDialog assignment={active} onOpenChange={(o) => !o && setActive(null)} />
    </div>
  );
}

function SubmitDialog({
  assignment,
  onOpenChange,
}: {
  assignment: A | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  /** Per-question answers, for MCQ / Q&A papers. */
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [written, setWritten] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState<string | null>(null);

  // Reset the form when a new assignment opens (without a synchronous effect).
  if (assignment && key !== assignment.id) {
    setKey(assignment.id);
    setContent(assignment.submission?.content ?? "");
    setFileUrl(assignment.submission?.fileUrl ?? "");
    setPicked({});
    setWritten({});
  }

  if (!assignment) return <Dialog open={false} onOpenChange={onOpenChange} />;

  const graded = assignment.submission?.status === "GRADED";
  const locked = graded;
  /** A question paper rather than a free-text/upload submission. */
  const isPaper = assignment.type !== "FILE" && assignment.questions.length > 0;

  function choose(question: { id: string; type: string }, optionId: string) {
    setPicked((prev) => {
      const current = prev[question.id] ?? [];
      if (question.type === "MULTIPLE_CHOICE") {
        return {
          ...prev,
          [question.id]: current.includes(optionId)
            ? current.filter((id) => id !== optionId)
            : [...current, optionId],
        };
      }
      // Single choice and true/false replace whatever was picked before.
      return { ...prev, [question.id]: [optionId] };
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!assignment) return;
    setSaving(true);
    try {
      if (isPaper) {
        const res = await api.post<{ message: string }>(
          `/api/assignments/${assignment.id}/answers`,
          {
            answers: assignment.questions.map((q) => ({
              questionId: q.id,
              optionIds: picked[q.id] ?? [],
              text: written[q.id] ?? "",
            })),
            fileUrl: fileUrl || undefined,
          },
        );
        toast.success(res.message);
      } else {
        await api.post(`/api/assignments/${assignment.id}/submit`, {
          content,
          fileUrl: fileUrl || undefined,
        });
        toast.success("Assignment submitted.");
      }
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const d = err.details as { issues?: { message: string }[] } | undefined;
        toast.error(d?.issues?.[0]?.message ?? err.message);
      } else toast.error("Submission failed.");
    } finally {
      setSaving(false);
    }
  }

  /** Every question answered — what the submit button waits for. */
  const paperComplete =
    !isPaper ||
    assignment.questions.every((q) =>
      q.options.length > 0
        ? (picked[q.id] ?? []).length > 0
        : (written[q.id] ?? "").trim().length > 0,
    );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{assignment.title}</DialogTitle>
          <DialogDescription>
            {assignment.courseTitle} · {assignment.maxScore} points
          </DialogDescription>
        </DialogHeader>

        {assignment.instructions && (
          <div className="rounded-xl border p-3">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-medium">
              <FileText className="size-4 text-muted-foreground" /> Instructions
            </p>
            <p className="text-muted-foreground text-sm whitespace-pre-wrap">{assignment.instructions}</p>
          </div>
        )}

        {graded && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              Graded: {assignment.submission!.score}/{assignment.maxScore}
            </p>
            {assignment.submission!.feedback && (
              <p className="text-muted-foreground mt-1 text-sm">{assignment.submission!.feedback}</p>
            )}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          {isPaper ? (
            <ol className="space-y-4">
              {assignment.questions.map((q, i) => (
                <li key={q.id} className="rounded-xl border p-4">
                  <p className="text-sm font-medium">
                    {i + 1}. {q.text}
                    <span className="text-muted-foreground ml-2 text-xs font-normal">
                      {q.points} point{q.points === 1 ? "" : "s"}
                    </span>
                  </p>
                  {q.options.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {q.options.map((o) => {
                        const on = (picked[q.id] ?? []).includes(o.id);
                        return (
                          <label
                            key={o.id}
                            className={
                              on
                                ? "border-primary bg-primary/5 flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm"
                                : "hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-sm"
                            }
                          >
                            <input
                              type={q.type === "MULTIPLE_CHOICE" ? "checkbox" : "radio"}
                              name={`q-${q.id}`}
                              checked={on}
                              onChange={() => choose(q, o.id)}
                              disabled={locked}
                              className="accent-primary size-4"
                            />
                            {o.text}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <Textarea
                      className="mt-3"
                      rows={4}
                      value={written[q.id] ?? ""}
                      onChange={(e) =>
                        setWritten((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                      placeholder="Write your answer…"
                      disabled={locked}
                    />
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="sub-content">Your submission</Label>
              <Textarea
                id="sub-content"
                rows={5}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your answer, or paste your notes / repo link here…"
                disabled={locked}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="sub-file">Link (optional)</Label>
            <Input
              id="sub-file"
              type="url"
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              placeholder="https://github.com/… or a file link"
              disabled={locked}
            />
            {fileUrl && locked && (
              <a href={fileUrl} target="_blank" rel="noopener" className="text-primary inline-flex items-center gap-1 text-xs hover:underline">
                <ExternalLink className="size-3.5" /> Open submitted link
              </a>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {!locked && (
              <Button
                type="submit"
                disabled={
                  saving || (isPaper ? !paperComplete : content.trim().length === 0)
                }
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                {assignment.submission ? "Resubmit" : "Submit"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
