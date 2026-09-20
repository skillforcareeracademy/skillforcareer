"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, FileQuestion, Loader2, Plus, X } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import type {
  AssignableItem,
  BatchProfile,
  BatchProfileAssignment,
  BatchProfileQuiz,
} from "@/server/services/batch-profile-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { BatchProfileAccess } from "./batch-profile-view";
import { percent, toneFor, when } from "./format";
import { cn } from "@/lib/utils";

type Kind = "quiz" | "assignment";

interface Removal {
  kind: Kind;
  id: string;
  title: string;
  /** Removing it leaves no batch and no named learner — it goes course-wide. */
  opensUp: boolean;
}

/**
 * Quizzes and assignments this batch sees: the ones set for it, and the
 * course-wide ones nobody narrowed down. Existing ones from the same course can
 * be set for the batch here, or taken off it.
 */
export function AssessmentsTab({
  profile,
  access,
}: {
  profile: BatchProfile;
  access: BatchProfileAccess;
}) {
  const router = useRouter();
  const [removal, setRemoval] = useState<Removal | null>(null);
  const learners = profile.learners.length;
  const canEdit = access.canTeach;

  async function confirmRemove() {
    if (!removal) return;
    try {
      const path = removal.kind === "quiz" ? "quizzes" : "assignments";
      await api.del(`/api/batches/${profile.id}/${path}/${removal.id}`);
      toast.success(
        `${removal.kind === "quiz" ? "Quiz" : "Assignment"} removed from this batch.`,
      );
      setRemoval(null);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't remove it.",
      );
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileQuestion className="size-4 text-amber-500" /> Quizzes & tests
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canEdit && (
            <AssignPicker
              batchId={profile.id}
              kind="quiz"
              options={profile.assignableQuizzes}
              onDone={() => router.refresh()}
            />
          )}
          {profile.quizzes.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No quizzes for this batch yet.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {profile.quizzes.map((q) => (
                <QuizRow
                  key={q.id}
                  quiz={q}
                  learners={learners}
                  href={`${access.basePath}/quizzes/${q.id}`}
                  onRemove={
                    canEdit && q.scope === "batch"
                      ? () =>
                          setRemoval({
                            kind: "quiz",
                            id: q.id,
                            title: q.title,
                            opensUp:
                              q.otherBatches === 0 && q.individuals === 0,
                          })
                      : undefined
                  }
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="size-4 text-indigo-500" /> Assignments
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canEdit && (
            <AssignPicker
              batchId={profile.id}
              kind="assignment"
              options={profile.assignableAssignments}
              onDone={() => router.refresh()}
            />
          )}
          {profile.assignments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No assignments for this batch yet.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {profile.assignments.map((a) => (
                <AssignmentRow
                  key={a.id}
                  assignment={a}
                  learners={learners}
                  onRemove={
                    canEdit && a.scope === "batch"
                      ? () =>
                          setRemoval({
                            kind: "assignment",
                            id: a.id,
                            title: a.title,
                            opensUp:
                              a.otherBatches === 0 && a.individuals === 0,
                          })
                      : undefined
                  }
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!removal}
        onOpenChange={(o) => !o && setRemoval(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove “{removal?.title}” from this batch?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removal?.opensUp
                ? "This batch is the only one it is set for. Without any batch it goes back to being open to everyone on the course."
                : "Learners on this batch will no longer see it. Attempts and submissions already made are kept."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ScopeBadge({
  scope,
  others,
}: {
  scope: "batch" | "course";
  others: number;
}) {
  return scope === "course" ? (
    <Badge variant="outline" className="text-[10px]">
      Whole course
    </Badge>
  ) : (
    <Badge variant="secondary" className="text-[10px]">
      {others > 0
        ? `This + ${others} batch${others === 1 ? "" : "es"}`
        : "This batch"}
    </Badge>
  );
}

function QuizRow({
  quiz,
  learners,
  href,
  onRemove,
}: {
  quiz: BatchProfileQuiz;
  learners: number;
  href: string;
  onRemove?: () => void;
}) {
  return (
    <li className="flex items-start gap-3 px-3 py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={href}
            className="truncate text-sm font-medium hover:underline"
          >
            {quiz.title}
          </Link>
          <ScopeBadge scope={quiz.scope} others={quiz.otherBatches} />
          {!quiz.isPublished && (
            <Badge variant="outline" className="text-[10px]">
              Draft
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          {quiz.attempted}/{learners} attempted · {quiz.passed} passed · avg{" "}
          <span className={toneFor(quiz.averageScore)}>
            {percent(quiz.averageScore)}
          </span>
          {quiz.releaseAt ? ` · opens ${when(quiz.releaseAt)}` : ""}
        </p>
      </div>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${quiz.title}`}
          onClick={onRemove}
        >
          <X className="size-4" />
        </Button>
      )}
    </li>
  );
}

function AssignmentRow({
  assignment,
  learners,
  onRemove,
}: {
  assignment: BatchProfileAssignment;
  learners: number;
  onRemove?: () => void;
}) {
  const rate = learners
    ? Math.round((assignment.submitted / learners) * 100)
    : null;
  return (
    <li className="flex items-start gap-3 px-3 py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">
            {assignment.title}
          </span>
          <ScopeBadge
            scope={assignment.scope}
            others={assignment.otherBatches}
          />
        </div>
        <p className="text-muted-foreground text-xs">
          <span className={cn(toneFor(rate))}>
            {assignment.submitted}/{learners} submitted
          </span>{" "}
          · {assignment.graded} graded · avg {percent(assignment.averageScore)}
          {assignment.dueDate ? ` · due ${when(assignment.dueDate)}` : ""}
        </p>
      </div>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${assignment.title}`}
          onClick={onRemove}
        >
          <X className="size-4" />
        </Button>
      )}
    </li>
  );
}

function AssignPicker({
  batchId,
  kind,
  options,
  onDone,
}: {
  batchId: string;
  kind: Kind;
  options: AssignableItem[];
  onDone: () => void;
}) {
  const [picked, setPicked] = useState("");
  const [saving, setSaving] = useState(false);
  const chosen = options.find((o) => o.id === picked);
  const noun = kind === "quiz" ? "quiz" : "assignment";

  async function assign() {
    if (!picked) return;
    setSaving(true);
    try {
      const path = kind === "quiz" ? "quizzes" : "assignments";
      const body =
        kind === "quiz" ? { quizId: picked } : { assignmentId: picked };
      const res = await api.post<{ message: string }>(
        `/api/batches/${batchId}/${path}`,
        body,
      );
      toast.success(res.message);
      setPicked("");
      onDone();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : `Couldn't set that ${noun}.`,
      );
    } finally {
      setSaving(false);
    }
  }

  if (options.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        Every {noun} of this course already reaches this batch.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Select
          value={picked}
          onValueChange={(v) => setPicked(v ? String(v) : "")}
        >
          <SelectTrigger className="min-w-0 flex-1">
            <SelectValue placeholder={`Set an existing ${noun}…`}>
              {(v) =>
                options.find((o) => o.id === v)?.title ??
                `Set an existing ${noun}…`
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.title}
                {o.courseWide ? " · whole course" : ""}
                {!o.isPublished ? " · draft" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={assign} disabled={!picked || saving}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Set
        </Button>
      </div>
      {chosen?.courseWide && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          This {noun} is open to everyone on the course right now. Setting it
          for this batch limits it to the batches it is set for.
        </p>
      )}
    </div>
  );
}
