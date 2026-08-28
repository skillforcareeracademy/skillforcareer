"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  Download,
  FileSpreadsheet,
  GripVertical,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { parseQuestionBank } from "@/lib/question-csv";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ASSIGNMENT_QUESTION_TYPES,
  ASSIGNMENT_QUESTION_TYPE_LABEL,
} from "@/lib/validations/assignment";

interface Option {
  id?: string;
  text: string;
  isCorrect: boolean;
}
interface Question {
  id: string;
  type: string;
  text: string;
  points: number;
  order: number;
  correctAnswer: string | null;
  explanation: string | null;
  options: { id: string; text: string; isCorrect: boolean; order: number }[];
}
interface AssignmentLite {
  id: string;
  title: string;
  type: string;
}

type Draft = {
  type: string;
  text: string;
  points: string;
  correctAnswer: string;
  explanation: string;
  options: Option[];
};

function blankDraft(assignmentType: string): Draft {
  // An MCQ paper defaults to choices; a Q&A paper defaults to a written answer.
  const type = assignmentType === "QNA" ? "SHORT_ANSWER" : "SINGLE_CHOICE";
  return {
    type,
    text: "",
    points: "1",
    correctAnswer: "",
    explanation: "",
    options:
      type === "SHORT_ANSWER"
        ? []
        : [
            { text: "", isCorrect: true },
            { text: "", isCorrect: false },
          ],
  };
}

function draftFrom(q: Question): Draft {
  return {
    type: q.type,
    text: q.text,
    points: String(q.points),
    correctAnswer: q.correctAnswer ?? "",
    explanation: q.explanation ?? "",
    options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
  };
}

/**
 * The question paper behind an MCQ or Q&A assignment — the same shape as the
 * quiz builder, so an admin who has set one has set the other.
 *
 * Papers of any size are the point of the import button: nobody is typing fifty
 * questions into a dialog.
 */
export function AssignmentQuestionsSheet({
  assignment,
  canExport = true,
  onOpenChange,
}: {
  assignment: AssignmentLite | null;
  /** Instructors can import a paper but not download the answer key. */
  canExport?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={assignment != null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        {assignment && (
          <Body key={assignment.id} assignment={assignment} canExport={canExport} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function Body({
  assignment,
  canExport,
}: {
  assignment: AssignmentLite;
  canExport: boolean;
}) {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [editing, setEditing] = useState<Question | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ questions: Question[] }>(
        `/api/assignments/${assignment.id}/questions`,
      );
      setQuestions(d.questions);
    } catch {
      setQuestions([]);
    }
  }, [assignment.id]);

  useEffect(() => {
    let alive = true;
    api
      .get<{ questions: Question[] }>(`/api/assignments/${assignment.id}/questions`)
      .then((d) => alive && setQuestions(d.questions))
      .catch(() => alive && setQuestions([]));
    return () => {
      alive = false;
    };
  }, [assignment.id]);

  function openNew() {
    setEditing(null);
    setDraft(blankDraft(assignment.type));
  }
  function openEdit(q: Question) {
    setEditing(q);
    setDraft(draftFrom(q));
  }

  function setType(type: string) {
    setDraft((d) =>
      d
        ? {
            ...d,
            type,
            options:
              type === "SHORT_ANSWER"
                ? []
                : type === "TRUE_FALSE"
                  ? [
                      { text: "True", isCorrect: true },
                      { text: "False", isCorrect: false },
                    ]
                  : d.options.length >= 2
                    ? d.options
                    : [
                        { text: "", isCorrect: true },
                        { text: "", isCorrect: false },
                      ],
          }
        : d,
    );
  }

  function setOption(index: number, patch: Partial<Option>) {
    setDraft((d) => {
      if (!d) return d;
      const options = d.options.map((o, i) => (i === index ? { ...o, ...patch } : o));
      // Single-answer questions can only have one correct choice.
      if (patch.isCorrect && (d.type === "SINGLE_CHOICE" || d.type === "TRUE_FALSE")) {
        return {
          ...d,
          options: options.map((o, i) => ({ ...o, isCorrect: i === index })),
        };
      }
      return { ...d, options };
    });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    const payload = {
      type: draft.type,
      text: draft.text,
      points: Number(draft.points) || 1,
      correctAnswer: draft.correctAnswer || undefined,
      explanation: draft.explanation || undefined,
      options: draft.type === "SHORT_ANSWER" ? [] : draft.options,
    };
    try {
      if (editing) {
        await api.patch(
          `/api/assignments/${assignment.id}/questions/${editing.id}`,
          payload,
        );
        toast.success("Question saved.");
      } else {
        await api.post(`/api/assignments/${assignment.id}/questions`, payload);
        toast.success("Question added.");
      }
      setDraft(null);
      setEditing(null);
      await load();
      router.refresh();
    } catch (err) {
      const d =
        err instanceof ApiError ? (err.details as { issues?: { message: string }[] }) : undefined;
      toast.error(
        d?.issues?.[0]?.message ?? (err instanceof ApiError ? err.message : "Couldn't save."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(q: Question) {
    try {
      await api.del(`/api/assignments/${assignment.id}/questions/${q.id}`);
      toast.success("Question deleted.");
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't delete.");
    }
  }

  /**
   * Read a question paper back in — the CSV the export now produces, or the
   * JSON older exports did. Parsed here so a bad row can be named; the API
   * still validates every question it is handed.
   */
  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const { questions: parsed, errors } = parseQuestionBank(await file.text());
      if (parsed.length === 0) {
        toast.error(errors[0]?.message ?? "That file has no questions in it.");
        return;
      }
      const res = await api.post<{ count: number; message: string }>(
        `/api/assignments/${assignment.id}/questions/import`,
        { questions: parsed, replace: false },
      );
      toast.success(
        errors.length > 0
          ? `${res.message} ${errors.length} row${errors.length === 1 ? "" : "s"} skipped — row ${errors[0].row}: ${errors[0].message}`
          : res.message,
      );
      await load();
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

  const totalPoints = (questions ?? []).reduce((sum, q) => sum + q.points, 0);

  return (
    <div className="flex flex-col">
      <SheetHeader className="border-b p-6 pb-4">
        <SheetTitle className="leading-snug">Questions · {assignment.title}</SheetTitle>
        <SheetDescription>
          {questions?.length ?? 0} question{questions?.length === 1 ? "" : "s"} ·{" "}
          {totalPoints} point{totalPoints === 1 ? "" : "s"}. The assignment&apos;s
          max score follows this total.
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-wrap gap-2 border-b p-4">
        <Button size="sm" onClick={openNew}>
          <Plus className="size-4" /> Add question
        </Button>
        <Button
          size="sm"
          variant="ghost"
          nativeButton={false}
          render={
            <a href={`/api/assignments/${assignment.id}/questions/template`} download />
          }
        >
          <FileSpreadsheet className="size-4" /> Sample sheet
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
        >
          {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
          Import
        </Button>
        {canExport && (
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={
              <a
                href={`/api/assignments/${assignment.id}/questions/export`}
                download
              />
            }
          >
            <Download className="size-4" /> Export
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,application/json,.json"
          className="hidden"
          onChange={onImport}
        />
      </div>

      <div className="p-4">
        {!questions ? (
          <Skeleton className="h-32 w-full rounded-lg" />
        ) : questions.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed py-12 text-center">
            <ListChecks className="mx-auto mb-2 size-8" />
            <p className="text-sm font-medium">No questions yet</p>
            <p className="text-xs">Add them one at a time, or import a paper you already have.</p>
          </div>
        ) : (
          <ol className="space-y-3">
            {questions.map((q, i) => (
              <li key={q.id} className="rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <GripVertical className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {ASSIGNMENT_QUESTION_TYPE_LABEL[q.type] ?? q.type}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {q.points} point{q.points === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium">
                      {i + 1}. {q.text}
                    </p>
                    {q.options.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {q.options.map((o) => (
                          <li
                            key={o.id}
                            className={
                              o.isCorrect
                                ? "flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400"
                                : "text-muted-foreground flex items-center gap-1.5 text-sm"
                            }
                          >
                            {o.isCorrect ? (
                              <Check className="size-3.5 shrink-0" />
                            ) : (
                              <span className="size-3.5 shrink-0" />
                            )}
                            {o.text}
                          </li>
                        ))}
                      </ul>
                    )}
                    {q.correctAnswer && (
                      <p className="text-muted-foreground mt-2 text-xs">
                        <span className="font-medium">Model answer:</span> {q.correctAnswer}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Edit question"
                      onClick={() => openEdit(q)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete question"
                      className="text-destructive"
                      onClick={() => remove(q)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Add / edit one question */}
      <Dialog open={draft != null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit question" : "Add question"}</DialogTitle>
            <DialogDescription>
              Choice questions are marked automatically; written answers are
              marked against the model answer.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <form onSubmit={save} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={draft.type} onValueChange={(v) => v && setType(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v) => ASSIGNMENT_QUESTION_TYPE_LABEL[String(v)]}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {ASSIGNMENT_QUESTION_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {ASSIGNMENT_QUESTION_TYPE_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="q-points">Points</Label>
                  <Input
                    id="q-points"
                    type="number"
                    min={1}
                    value={draft.points}
                    onChange={(e) => setDraft((d) => (d ? { ...d, points: e.target.value } : d))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="q-text">Question</Label>
                <Textarea
                  id="q-text"
                  rows={3}
                  value={draft.text}
                  onChange={(e) => setDraft((d) => (d ? { ...d, text: e.target.value } : d))}
                  placeholder="What are you asking?"
                />
              </div>

              {draft.type === "SHORT_ANSWER" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="q-answer">Model answer</Label>
                  <Textarea
                    id="q-answer"
                    rows={3}
                    value={draft.correctAnswer}
                    onChange={(e) =>
                      setDraft((d) => (d ? { ...d, correctAnswer: e.target.value } : d))
                    }
                    placeholder="What a full-marks answer looks like — shown to the marker only."
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Options</Label>
                  {draft.options.map((o, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Checkbox
                        checked={o.isCorrect}
                        onCheckedChange={(v) => setOption(i, { isCorrect: Boolean(v) })}
                        aria-label={`Option ${i + 1} is correct`}
                      />
                      <Input
                        value={o.text}
                        onChange={(e) => setOption(i, { text: e.target.value })}
                        placeholder={`Option ${i + 1}`}
                      />
                      {draft.options.length > 2 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove option ${i + 1}`}
                          onClick={() =>
                            setDraft((d) =>
                              d ? { ...d, options: d.options.filter((_, j) => j !== i) } : d,
                            )
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {draft.type !== "TRUE_FALSE" && draft.options.length < 10 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setDraft((d) =>
                          d ? { ...d, options: [...d.options, { text: "", isCorrect: false }] } : d,
                        )
                      }
                    >
                      <Plus className="size-4" /> Add option
                    </Button>
                  )}
                  <p className="text-muted-foreground text-xs">
                    Tick every option that counts as correct.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="q-exp">Explanation (optional)</Label>
                <Textarea
                  id="q-exp"
                  rows={2}
                  value={draft.explanation}
                  onChange={(e) =>
                    setDraft((d) => (d ? { ...d, explanation: e.target.value } : d))
                  }
                  placeholder="Shown after marking, to explain the answer."
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || draft.text.trim().length === 0}>
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  {editing ? "Save question" : "Add question"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
