"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import {
  GENERATE_STYLES,
  GENERATE_STYLE_LABEL,
  QUESTION_TYPE_LABEL,
} from "@/lib/validations/quiz";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

interface NoteSource {
  id: string;
  kind: "BATCH_NOTE" | "LESSON";
  title: string;
  where: string;
  readable: boolean;
}
interface DraftQuestion {
  type: string;
  text: string;
  points: number;
  correctAnswer?: string;
  explanation?: string;
  options: { text: string; isCorrect: boolean }[];
}
interface Draft {
  questions: DraftQuestion[];
  engine: "model" | "builtin";
  sourceTitle: string;
  notice: string | null;
}

const PASTE = "paste";

/**
 * Draft a paper from the notes it is meant to test — the academy's "generate
 * quiz from notes with a single command".
 *
 * Every draft is reviewed before it lands: the questions come back here with
 * the sentence each one came from, and only the ones left ticked are written to
 * the quiz. Nothing is published, and nothing reaches a learner, on a machine's
 * say-so alone.
 */
export function QuizGenerateDialog({
  open,
  onOpenChange,
  quizId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quizId: string;
  onAdded?: () => void;
}) {
  const router = useRouter();
  const [sources, setSources] = useState<NoteSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [choice, setChoice] = useState<string>(PASTE);
  const [pasted, setPasted] = useState("");
  const [count, setCount] = useState("5");
  const [style, setStyle] = useState<string>("MIXED");
  const [link, setLink] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [keep, setKeep] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadingSources(true);
    try {
      const res = await api.get<{ sources: NoteSource[] }>(`/api/quizzes/${quizId}/sources`);
      setSources(res.sources);
      const first = res.sources.find((s) => s.readable);
      if (first) setChoice(`${first.kind}:${first.id}`);
    } catch {
      // Pasting notes still works without the list.
    } finally {
      setLoadingSources(false);
    }
  }, [quizId]);

  // Fetched on a timer rather than straight from the effect body: the dialog
  // should paint before the loading state cascades a second render, which is
  // also what the compiler's `set-state-in-effect` rule is asking for.
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [open, load]);

  function reset() {
    setDraft(null);
    setKeep({});
  }

  async function generate() {
    setBusy(true);
    reset();
    try {
      const [kind, id] = choice.split(":");
      const res = await api.post<Draft>(`/api/quizzes/${quizId}/generate`, {
        batchNoteId: kind === "BATCH_NOTE" ? id : undefined,
        lessonId: kind === "LESSON" ? id : undefined,
        text: choice === PASTE ? pasted : undefined,
        count: Number(count) || 5,
        style,
        linkSource: link,
      });
      setDraft(res);
      setKeep(Object.fromEntries(res.questions.map((_, i) => [i, true])));
      if (res.notice) toast.message(res.notice);
    } catch (err) {
      const d =
        err instanceof ApiError ? (err.details as { issues?: { message: string }[] }) : undefined;
      toast.error(
        d?.issues?.[0]?.message ??
          (err instanceof ApiError ? err.message : "Couldn't read those notes."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function addKept() {
    if (!draft) return;
    const questions = draft.questions.filter((_, i) => keep[i]);
    if (questions.length === 0) return;
    setSaving(true);
    try {
      const res = await api.post<{ message: string }>(
        `/api/quizzes/${quizId}/questions/import`,
        { questions, replace: false },
      );
      toast.success(res.message);
      onOpenChange(false);
      reset();
      onAdded?.();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add those questions.");
    } finally {
      setSaving(false);
    }
  }

  const keptCount = draft ? draft.questions.filter((_, i) => keep[i]).length : 0;
  const canGenerate = choice === PASTE ? pasted.trim().length > 200 : Boolean(choice);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4" /> Generate questions from notes
          </DialogTitle>
          <DialogDescription>
            Pick the notes this paper is being set from. Nothing is added until you say so.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Select value={choice} onValueChange={(v) => setChoice(v ?? PASTE)}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v) => {
                    if (!v || v === PASTE) return "Paste the notes";
                    const found = sources.find((s) => `${s.kind}:${s.id}` === v);
                    return found ? `${found.title} — ${found.where}` : "Paste the notes";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PASTE}>Paste the notes</SelectItem>
                {sources.map((s) => (
                  <SelectItem key={`${s.kind}:${s.id}`} value={`${s.kind}:${s.id}`} disabled={!s.readable}>
                    {s.title} — {s.where}
                    {s.readable ? "" : " (no readable text)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loadingSources ? (
              <p className="text-muted-foreground text-xs">Looking for notes…</p>
            ) : (
              <p className="text-muted-foreground text-xs">
                Batch notes and written lessons both work. A PDF or image attachment can&apos;t be
                read — paste its text instead.
              </p>
            )}
          </div>

          {choice === PASTE && (
            <div className="space-y-1.5">
              <Label htmlFor="gen-text">Notes text</Label>
              <Textarea
                id="gen-text"
                rows={6}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="Paste the notes this quiz is prepared from…"
              />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="gen-count">How many</Label>
              <Input
                id="gen-count"
                type="number"
                min={1}
                max={25}
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Question type</Label>
              <Select value={style} onValueChange={(v) => v && setStyle(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v) => GENERATE_STYLE_LABEL[String(v)]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {GENERATE_STYLES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {GENERATE_STYLE_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-start gap-2 pt-7 text-sm">
              <Checkbox checked={link} onCheckedChange={(v) => setLink(v === true)} />
              <span>Remember as this quiz&apos;s source</span>
            </label>
          </div>

          <Button onClick={generate} disabled={busy || !canGenerate} className="w-full">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            {busy ? "Reading the notes…" : "Generate draft"}
          </Button>

          {draft && (
            <div className="space-y-3">
              <div className="bg-muted/40 rounded-lg p-3 text-xs">
                <p className="font-medium">
                  {draft.questions.length} question{draft.questions.length === 1 ? "" : "s"} drafted
                  from “{draft.sourceTitle}”
                </p>
                <p className="text-muted-foreground mt-0.5">
                  {draft.engine === "model"
                    ? "Written by the AI service the platform is configured with."
                    : "Written by the built-in reader on this server — no outside service involved."}{" "}
                  Check each one against your notes before adding it.
                </p>
                {draft.notice && <p className="mt-1 text-amber-600 dark:text-amber-400">{draft.notice}</p>}
              </div>

              <div className="max-h-80 space-y-2 overflow-y-auto">
                {draft.questions.map((q, i) => (
                  <div key={`${i}-${q.text}`} className="rounded-xl border p-3">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={keep[i] ?? false}
                        onCheckedChange={(v) => setKeep((p) => ({ ...p, [i]: v === true }))}
                        aria-label={`Keep question ${i + 1}`}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">
                            {QUESTION_TYPE_LABEL[q.type] ?? q.type}
                          </Badge>
                          <span className="text-muted-foreground text-xs">{q.points} pt</span>
                        </div>
                        <p className="text-sm font-medium">{q.text}</p>
                        <ul className="mt-2 space-y-1">
                          {q.options.map((o) => (
                            <li
                              key={o.text}
                              className={cn(
                                "flex items-start gap-2 text-sm",
                                o.isCorrect
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-muted-foreground",
                              )}
                            >
                              <span
                                className={cn(
                                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                                  o.isCorrect
                                    ? "border-emerald-500 bg-emerald-500 text-white"
                                    : "border-input",
                                )}
                              >
                                {o.isCorrect && <Check className="size-3" />}
                              </span>
                              {o.text}
                            </li>
                          ))}
                        </ul>
                        {q.explanation && (
                          <p className="text-muted-foreground mt-2 text-xs">{q.explanation}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={addKept} disabled={saving || keptCount === 0}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Add {keptCount > 0 ? keptCount : ""} to quiz
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
