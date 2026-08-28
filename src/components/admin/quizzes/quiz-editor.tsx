"use client";

import { useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Send,
  Undo2,
  Check,
  ListChecks,
  Upload,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { parseQuestionBank } from "@/lib/question-csv";
import { GRADING_MODES, GRADING_MODE_LABEL, QUESTION_TYPE_LABEL } from "@/lib/validations/quiz";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
import { QuestionDialog, type EditableQuestion } from "@/components/admin/quizzes/question-dialog";
import { AudiencePicker } from "@/components/shared/audience-picker";
import { cn } from "@/lib/utils";

interface Quiz {
  id: string;
  title: string;
  description: string | null;
  courseId: string | null;
  timeLimitMinutes: number | null;
  passingScore: number;
  gradingMode: string;
  maxAttempts: number;
  shuffleQuestions: boolean;
  showAnswers: boolean;
  isPublished: boolean;
  batchIds: string[];
  questions: EditableQuestion[];
  totalPoints: number;
}
interface BatchOpt {
  id: string;
  name: string;
  courseId: string;
  courseTitle: string;
}

export function QuizEditor({
  quiz,
  courses,
  batches,
  basePath = "/admin/quizzes",
  canExport = true,
}: {
  quiz: Quiz;
  courses: { id: string; title: string }[];
  batches: BatchOpt[];
  basePath?: string;
  /** Instructors may import a question bank but not download the answer key. */
  canExport?: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: quiz.title,
    description: quiz.description ?? "",
    courseId: quiz.courseId ?? "",
    timeLimitMinutes: quiz.timeLimitMinutes != null ? String(quiz.timeLimitMinutes) : "",
    passingScore: String(quiz.passingScore),
    gradingMode: quiz.gradingMode,
    maxAttempts: String(quiz.maxAttempts),
    shuffleQuestions: quiz.shuffleQuestions,
    showAnswers: quiz.showAnswers,
    batchIds: quiz.batchIds,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [dialogNonce, setDialogNonce] = useState(0);
  const [dialog, setDialog] = useState<{ open: boolean; editing: EditableQuestion | null }>({
    open: false,
    editing: null,
  });
  const [deletingQuestion, setDeletingQuestion] = useState<EditableQuestion | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Switching course invalidates cohorts picked from the previous one.
      if (key === "courseId") {
        next.batchIds = prev.batchIds.filter(
          (id) => batches.find((b) => b.id === id)?.courseId === value,
        );
      }
      return next;
    });
  }

  /** Cohorts of the course this quiz belongs to. */
  const formBatches = form.courseId
    ? batches.filter((b) => b.courseId === form.courseId)
    : batches;

  /**
   * Read a question bank back in, appending to what's here.
   *
   * The sheet is parsed in the browser so a bad row can be named before
   * anything is sent; the API still validates every question it is given.
   * Accepts the CSV the export now produces, and the JSON older exports did.
   */
  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const { questions, errors } = parseQuestionBank(await file.text());
      if (questions.length === 0) {
        toast.error(errors[0]?.message ?? "That file has no questions in it.");
        return;
      }
      const res = await api.post<{ message: string }>(
        `/api/quizzes/${quiz.id}/questions/import`,
        { questions, replace: false },
      );
      // Rows the sheet got wrong are worth saying out loud — silently importing
      // 48 of 50 questions is how a paper goes out with two missing.
      toast.success(
        errors.length > 0
          ? `${res.message} ${errors.length} row${errors.length === 1 ? "" : "s"} skipped — row ${errors[0].row}: ${errors[0].message}`
          : res.message,
      );
      router.refresh();
    } catch (err) {
      const d =
        err instanceof ApiError ? (err.details as { issues?: { message: string }[] }) : undefined;
      toast.error(
        d?.issues?.[0]?.message ??
          (err instanceof ApiError ? err.message : "That file isn't a question export."),
      );
    } finally {
      setImporting(false);
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    try {
      await api.patch(`/api/quizzes/${quiz.id}`, {
        title: form.title,
        description: form.description || undefined,
        courseId: form.courseId || undefined,
        timeLimitMinutes: form.timeLimitMinutes ? Number(form.timeLimitMinutes) : undefined,
        passingScore: Number(form.passingScore) || 0,
        gradingMode: form.gradingMode,
        maxAttempts: Number(form.maxAttempts) || 1,
        shuffleQuestions: form.shuffleQuestions,
        showAnswers: form.showAnswers,
        batchIds: form.batchIds,
      });
      toast.success("Settings saved.");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const d = err.details as { issues?: { message: string }[] } | undefined;
        toast.error(d?.issues?.[0]?.message ?? err.message);
      } else toast.error("Save failed.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function togglePublish() {
    setPublishing(true);
    try {
      await api.post(`/api/quizzes/${quiz.id}/publish`, { publish: !quiz.isPublished });
      toast.success(quiz.isPublished ? "Unpublished." : "Published.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setPublishing(false);
    }
  }

  function openAdd() {
    setDialog({ open: true, editing: null });
    setDialogNonce((n) => n + 1);
  }
  function openEdit(q: EditableQuestion) {
    setDialog({ open: true, editing: q });
    setDialogNonce((n) => n + 1);
  }

  async function confirmDeleteQuestion() {
    if (!deletingQuestion) return;
    try {
      await api.del(`/api/questions/${deletingQuestion.id}`);
      toast.success("Question deleted.");
      setDeletingQuestion(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={basePath}
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" /> Back to quizzes
        </Link>
        <PageHeader
          title={quiz.title}
          description={quiz.isPublished ? "Published" : "Draft"}
          actions={
            <Button
              variant={quiz.isPublished ? "outline" : "default"}
              onClick={togglePublish}
              disabled={publishing}
            >
              {publishing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : quiz.isPublished ? (
                <Undo2 className="size-4" />
              ) : (
                <Send className="size-4" />
              )}
              {quiz.isPublished ? "Unpublish" : "Publish"}
            </Button>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Settings */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>How this quiz behaves.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="q-title">Title</Label>
              <Input id="q-title" value={form.title} onChange={(e) => set("title", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-desc">Description</Label>
              <Textarea
                id="q-desc"
                rows={2}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Course</Label>
              <Select
                value={form.courseId || "none"}
                onValueChange={(v) => set("courseId", v === "none" ? "" : (v ?? ""))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v) =>
                      !v || v === "none" ? "None" : (courses.find((c) => c.id === v)?.title ?? "None")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Who sits this quiz. Nothing chosen = everyone on the course,
                which is how quizzes behaved before cohorts could be named. */}
            <AudiencePicker
              label="Batches"
              emptyMeans="No batch chosen — everyone on the course sits it."
              searchPlaceholder="Search batches…"
              options={formBatches.map((b) => ({
                id: b.id,
                label: b.name,
                hint: b.courseTitle,
              }))}
              selected={form.batchIds}
              onChange={(ids) => set("batchIds", ids)}
              maxHeight="11rem"
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="q-pass">Pass %</Label>
                <Input
                  id="q-pass"
                  type="number"
                  min={0}
                  max={100}
                  value={form.passingScore}
                  onChange={(e) => set("passingScore", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="q-time">Time (min)</Label>
                <Input
                  id="q-time"
                  type="number"
                  min={1}
                  value={form.timeLimitMinutes}
                  onChange={(e) => set("timeLimitMinutes", e.target.value)}
                  placeholder="none"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="q-att">Max attempts</Label>
                <Input
                  id="q-att"
                  type="number"
                  min={1}
                  value={form.maxAttempts}
                  onChange={(e) => set("maxAttempts", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Grading</Label>
                <Select value={form.gradingMode} onValueChange={(v) => v && set("gradingMode", v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v) => GRADING_MODE_LABEL[String(v)]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {GRADING_MODES.map((g) => (
                      <SelectItem key={g} value={g}>
                        {GRADING_MODE_LABEL[g]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>Shuffle questions</span>
              <Switch
                checked={form.shuffleQuestions}
                onCheckedChange={(v) => set("shuffleQuestions", v)}
              />
            </label>
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>Show answers after</span>
              <Switch checked={form.showAnswers} onCheckedChange={(v) => set("showAnswers", v)} />
            </label>
            <Button onClick={saveSettings} disabled={savingSettings} className="w-full">
              {savingSettings && <Loader2 className="size-4 animate-spin" />}
              Save settings
            </Button>
          </CardContent>
        </Card>

        {/* Question builder */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Questions</CardTitle>
              <CardDescription>
                {quiz.questions.length} question{quiz.questions.length === 1 ? "" : "s"} ·{" "}
                {quiz.totalPoints} points
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* The blank sheet first: an admin who has never imported a paper
                  needs to see the columns before the Import button means
                  anything. */}
              <Button
                variant="ghost"
                nativeButton={false}
                render={
                  <a href={`/api/quizzes/${quiz.id}/questions/template`} download />
                }
              >
                <FileSpreadsheet className="size-4" /> Sample sheet
              </Button>
              <Button
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={importing}
              >
                {importing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                Import
              </Button>
              {canExport && (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<a href={`/api/quizzes/${quiz.id}/questions/export`} download />}
                >
                  <Download className="size-4" /> Export
                </Button>
              )}
              <Button onClick={openAdd}>
                <Plus className="size-4" /> Add question
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,application/json,.json"
                className="hidden"
                onChange={onImport}
              />
            </div>
          </CardHeader>
          <CardContent>
            {quiz.questions.length === 0 ? (
              <div className="rounded-xl border border-dashed py-12 text-center">
                <ListChecks className="text-muted-foreground mx-auto mb-2 size-7" />
                <p className="text-sm font-medium">No questions yet</p>
                <p className="text-muted-foreground mx-auto mt-1 max-w-xs text-xs">
                  Add questions to build your quiz. You need at least one to publish.
                </p>
              </div>
            ) : (
              <ol className="space-y-3">
                {quiz.questions.map((q, i) => (
                  <li key={q.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="text-muted-foreground text-xs font-medium">Q{i + 1}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {QUESTION_TYPE_LABEL[q.type] ?? q.type}
                          </Badge>
                          <span className="text-muted-foreground text-xs">
                            {q.points} pt{q.points === 1 ? "" : "s"}
                          </span>
                        </div>
                        <p className="text-sm font-medium">{q.text}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(q)} aria-label="Edit">
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground"
                          onClick={() => setDeletingQuestion(q)}
                          aria-label="Delete"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>

                    {q.options.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {q.options.map((o) => (
                          <li
                            key={o.id}
                            className={cn(
                              "flex items-center gap-2 text-sm",
                              o.isCorrect ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                            )}
                          >
                            <span
                              className={cn(
                                "grid size-4 shrink-0 place-items-center rounded-full border",
                                o.isCorrect ? "border-emerald-500 bg-emerald-500 text-white" : "border-input",
                              )}
                            >
                              {o.isCorrect && <Check className="size-3" />}
                            </span>
                            {o.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {dialog.open && (
        <QuestionDialog
          key={`${dialog.editing?.id ?? "new"}-${dialogNonce}`}
          open={dialog.open}
          onOpenChange={(o) => setDialog((prev) => ({ ...prev, open: o }))}
          quizId={quiz.id}
          question={dialog.editing}
          onSaved={() => router.refresh()}
        />
      )}

      <AlertDialog open={!!deletingQuestion} onOpenChange={(o) => !o && setDeletingQuestion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this question?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the question and its options. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteQuestion}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
