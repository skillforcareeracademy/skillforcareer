"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Plus, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { QUESTION_TYPES, QUESTION_TYPE_LABEL } from "@/lib/validations/quiz";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { cn } from "@/lib/utils";

export interface EditableQuestion {
  id: string;
  type: string;
  text: string;
  points: number;
  explanation: string | null;
  options: { id: string; text: string; isCorrect: boolean }[];
}

interface Opt {
  text: string;
  isCorrect: boolean;
}

function defaultsFor(type: string, current: Opt[]): Opt[] {
  if (type === "SHORT_ANSWER") return [];
  if (type === "TRUE_FALSE") {
    return [
      { text: "True", isCorrect: current[0]?.isCorrect ?? false },
      { text: "False", isCorrect: current[1]?.isCorrect ?? false },
    ];
  }
  const base = current.filter((o) => o.text !== "True" && o.text !== "False");
  while (base.length < 2) base.push({ text: "", isCorrect: false });
  return base;
}

export function QuestionDialog({
  open,
  onOpenChange,
  quizId,
  question,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quizId: string;
  question: EditableQuestion | null;
  onSaved: () => void | Promise<void>;
}) {
  const editing = Boolean(question);
  const [type, setType] = useState(question?.type ?? "SINGLE_CHOICE");
  const [text, setText] = useState(question?.text ?? "");
  const [points, setPoints] = useState(String(question?.points ?? 1));
  const [explanation, setExplanation] = useState(question?.explanation ?? "");
  const [options, setOptions] = useState<Opt[]>(() =>
    question
      ? question.type === "SHORT_ANSWER"
        ? []
        : question.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect }))
      : [
          { text: "", isCorrect: false },
          { text: "", isCorrect: false },
        ],
  );
  const [saving, setSaving] = useState(false);

  const isChoice = type !== "SHORT_ANSWER";
  const single = type === "SINGLE_CHOICE" || type === "TRUE_FALSE";
  const canAddOption = type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE";

  function changeType(next: string) {
    setType(next);
    setOptions((prev) => defaultsFor(next, prev));
  }
  function setOption(i: number, patch: Partial<Opt>) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }
  function toggleCorrect(i: number) {
    setOptions((prev) =>
      prev.map((o, idx) =>
        single ? { ...o, isCorrect: idx === i } : idx === i ? { ...o, isCorrect: !o.isCorrect } : o,
      ),
    );
  }
  function addOption() {
    setOptions((prev) => [...prev, { text: "", isCorrect: false }]);
  }
  function removeOption(i: number) {
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      type,
      text,
      points: Number(points) || 1,
      explanation: explanation || undefined,
      options: isChoice ? options.map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect })) : [],
    };
    try {
      if (editing && question) {
        await api.patch(`/api/questions/${question.id}`, payload);
        toast.success("Question saved.");
      } else {
        await api.post(`/api/quizzes/${quizId}/questions`, payload);
        toast.success("Question added.");
      }
      await onSaved();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        const d = err.details as { issues?: { message: string }[] } | undefined;
        toast.error(d?.issues?.[0]?.message ?? err.message);
      } else toast.error("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const canSave =
    text.trim().length > 0 &&
    (!isChoice ||
      (options.length >= 2 &&
        options.every((o) => o.text.trim().length > 0) &&
        options.some((o) => o.isCorrect)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit question" : "Add question"}</DialogTitle>
          <DialogDescription>Set the question, its type and correct answers.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => v && changeType(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v) => QUESTION_TYPE_LABEL[String(v)]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {QUESTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {QUESTION_TYPE_LABEL[t]}
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
                value={points}
                onChange={(e) => setPoints(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="q-text">Question</Label>
            <Textarea
              id="q-text"
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type your question…"
            />
          </div>

          {isChoice && (
            <div className="space-y-2">
              <Label>
                Options{" "}
                <span className="text-muted-foreground font-normal">
                  ({single ? "pick one correct" : "pick all correct"})
                </span>
              </Label>
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleCorrect(i)}
                    aria-label={o.isCorrect ? "Correct" : "Mark correct"}
                    className={cn(
                      "grid size-6 shrink-0 place-items-center border transition-colors",
                      single ? "rounded-full" : "rounded-md",
                      o.isCorrect
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-input hover:bg-accent",
                    )}
                  >
                    {o.isCorrect && <Check className="size-3.5" />}
                  </button>
                  <Input
                    value={o.text}
                    onChange={(e) => setOption(i, { text: e.target.value })}
                    placeholder={`Option ${i + 1}`}
                    disabled={type === "TRUE_FALSE"}
                  />
                  {canAddOption && options.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground shrink-0"
                      onClick={() => removeOption(i)}
                      aria-label="Remove option"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
              {canAddOption && options.length < 10 && (
                <Button type="button" variant="outline" size="sm" onClick={addOption}>
                  <Plus className="size-4" /> Add option
                </Button>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="q-exp">Explanation (optional)</Label>
            <Textarea
              id="q-exp"
              rows={2}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Shown to learners after they answer"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave || saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save question" : "Add question"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
