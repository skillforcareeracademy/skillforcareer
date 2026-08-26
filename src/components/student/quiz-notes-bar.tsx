"use client";

import { useEffect, useState } from "react";
import { Bookmark, Loader2, NotebookPen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface QuizNote {
  id: string;
  content: string;
  timestampSeconds: number;
  createdAt: string;
}

/**
 * Save a quiz for later, and keep revision notes against it.
 *
 * Both live in the same tables as lesson notes and bookmarks, so everything
 * written here also turns up under Student → Notes. The notes list is only
 * fetched once the panel is opened — most visits to a quiz never open it.
 */
export function QuizNotesBar({
  quizId,
  bookmarked: initiallySaved,
  className,
}: {
  quizId: string;
  bookmarked: boolean;
  className?: string;
}) {
  const [saved, setSaved] = useState(initiallySaved);
  const [savingBookmark, setSavingBookmark] = useState(false);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<QuizNote[] | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open || notes !== null) return;
    let alive = true;
    api
      .get<QuizNote[]>(`/api/quizzes/${quizId}/notes`)
      .then((n) => alive && setNotes(n))
      .catch(() => alive && setNotes([]));
    return () => {
      alive = false;
    };
  }, [open, notes, quizId]);

  async function toggleBookmark() {
    setSavingBookmark(true);
    // Painted first so the star doesn't lag the tap; rolled back on failure.
    const next = !saved;
    setSaved(next);
    try {
      const res = await api.post<{ saved: boolean }>(`/api/quizzes/${quizId}/bookmark`, {});
      setSaved(res.saved);
      toast.success(res.saved ? "Saved for later." : "Removed from saved.");
    } catch (e) {
      setSaved(!next);
      toast.error(e instanceof ApiError ? e.message : "Couldn't save. Try again.");
    } finally {
      setSavingBookmark(false);
    }
  }

  async function addNote() {
    const content = draft.trim();
    if (!content) return;
    setAdding(true);
    try {
      const res = await api.post<{ id: string }>(`/api/quizzes/${quizId}/notes`, { content });
      setDraft("");
      setNotes((prev) => [
        ...(prev ?? []),
        { id: res.id, content, timestampSeconds: 0, createdAt: new Date().toISOString() },
      ]);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save note.");
    } finally {
      setAdding(false);
    }
  }

  async function removeNote(id: string) {
    const previous = notes ?? [];
    setNotes(previous.filter((n) => n.id !== id));
    try {
      await api.del(`/api/notes/${id}`);
    } catch {
      setNotes(previous);
      toast.error("Couldn't delete that note.");
    }
  }

  const count = notes?.length ?? 0;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={saved ? "secondary" : "outline"}
          onClick={toggleBookmark}
          disabled={savingBookmark}
        >
          <Bookmark className={cn("size-4", saved && "fill-current")} />
          {saved ? "Saved" : "Save for later"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={open ? "secondary" : "outline"}
          onClick={() => setOpen((v) => !v)}
        >
          <NotebookPen className="size-4" />
          My notes
          {notes !== null && count > 0 && <span className="tabular-nums">({count})</span>}
        </Button>
      </div>

      {open && (
        <Card className="gap-3 p-4">
          {notes === null ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" /> Loading your notes…
            </p>
          ) : (
            <>
              {notes.length > 0 && (
                <ul className="space-y-2">
                  {notes.map((n) => (
                    <li
                      key={n.id}
                      className="bg-muted/40 flex items-start gap-2 rounded-md px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 flex-1 whitespace-pre-wrap">{n.content}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => removeNote(n.id)}
                        aria-label="Delete note"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <Textarea
                rows={2}
                value={draft}
                placeholder="What do you want to remember about this quiz?"
                onChange={(e) => setDraft(e.target.value)}
              />
              <div>
                <Button
                  type="button"
                  size="sm"
                  onClick={addNote}
                  disabled={adding || !draft.trim()}
                >
                  {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  Add note
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
