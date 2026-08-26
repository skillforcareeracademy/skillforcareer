"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Bookmark,
  BookOpen,
  Check,
  ExternalLink,
  FileQuestion,
  NotebookPen,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/shared/button-link";
import type { SavedItem } from "@/server/services/learning-service";
import { cn } from "@/lib/utils";

const TAB_TRIGGER = "gap-1.5 px-3";

/** mm:ss for a note taken at a point in a video; blank at the very start. */
function stamp(seconds: number): string | null {
  if (seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function StudentNotesClient({ items: initial }: { items: SavedItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // The server's copy wins once it catches up, but a delete has already been
  // painted locally. Adjusted during render rather than in an effect, so the
  // list never flashes the row back before removing it again.
  const [synced, setSynced] = useState(initial);
  if (synced !== initial) {
    setSynced(initial);
    setItems(initial);
  }

  const notes = useMemo(() => items.filter((i) => i.kind === "note"), [items]);
  const bookmarks = useMemo(() => items.filter((i) => i.kind === "bookmark"), [items]);

  function matching(list: SavedItem[]) {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((i) =>
      [i.text, i.source.title, i.source.courseTitle ?? ""].some((s) =>
        s.toLowerCase().includes(q),
      ),
    );
  }

  async function remove(item: SavedItem) {
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setBusy(item.id);
    try {
      await api.del(`/api/${item.kind === "note" ? "notes" : "bookmarks"}/${item.id}`);
      router.refresh();
    } catch (e) {
      setItems(previous);
      toast.error(e instanceof ApiError ? e.message : "Couldn't delete. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit(item: SavedItem) {
    const content = draft.trim();
    if (!content || content === item.text) {
      setEditing(null);
      return;
    }
    setBusy(item.id);
    try {
      await api.patch(`/api/notes/${item.id}`, { content });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, text: content } : i)));
      setEditing(null);
      toast.success("Note updated.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function renderItem(item: SavedItem) {
    const SourceIcon = item.source.type === "quiz" ? FileQuestion : BookOpen;
    const at = stamp(item.timestampSeconds);
    const isEditing = editing === item.id;

    return (
      <Card key={item.id} className="gap-0 p-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <SourceIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
          <span className="text-muted-foreground min-w-0 truncate text-xs">
            {item.source.courseTitle && (
              <>
                {item.source.courseTitle} <span aria-hidden>›</span>{" "}
              </>
            )}
            <span className="text-foreground font-medium">{item.source.title}</span>
          </span>
          {at && (
            <Badge variant="secondary" className="tabular-nums">
              {at}
            </Badge>
          )}
          <span className="text-muted-foreground ml-auto shrink-0 text-xs">
            {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
          </span>
        </div>

        {isEditing ? (
          <div className="mt-3 space-y-2">
            <Textarea
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => saveEdit(item)} disabled={busy === item.id}>
                <Check className="size-4" /> Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                <X className="size-4" /> Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p
            className={cn(
              "mt-2 text-sm whitespace-pre-wrap",
              !item.text && "text-muted-foreground italic",
            )}
          >
            {item.text ||
              (item.source.type === "quiz"
                ? "Saved for revision"
                : "Saved without a label")}
          </p>
        )}

        {!isEditing && (
          <div className="mt-3 flex items-center gap-1">
            {item.source.href && (
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href={item.source.href} />}
              >
                <ExternalLink className="size-4" />
                {item.source.type === "quiz" ? "Open quiz" : "Open lesson"}
              </Button>
            )}
            {item.kind === "note" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(item.id);
                  setDraft(item.text);
                }}
              >
                <Pencil className="size-4" /> Edit
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive ml-auto"
              onClick={() => remove(item)}
              disabled={busy === item.id}
            >
              <Trash2 className="size-4" />
              <span className="sr-only">Delete</span>
            </Button>
          </div>
        )}
      </Card>
    );
  }

  function renderList(list: SavedItem[], kind: "note" | "bookmark") {
    const shown = matching(list);
    if (list.length === 0) {
      return (
        <EmptyState
          icon={kind === "note" ? NotebookPen : Bookmark}
          title={kind === "note" ? "No notes yet" : "Nothing saved yet"}
          description={
            kind === "note"
              ? "Jot a note while you watch a lesson or revise a quiz, and it will show up here."
              : "Save a moment in a lesson, or a whole quiz, and you can come back to it from here."
          }
          action={<ButtonLink href="/student/learning">Go to my learning</ButtonLink>}
        />
      );
    }
    if (shown.length === 0) {
      return (
        <EmptyState
          icon={Search}
          title="Nothing matches"
          description={`No ${kind === "note" ? "notes" : "bookmarks"} mention “${query.trim()}”.`}
        />
      );
    }
    return <div className="grid gap-3 lg:grid-cols-2">{shown.map(renderItem)}</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notes"
        description="Everything you've written down or saved, across every course and quiz."
      />

      <Tabs defaultValue="notes">
        <div className="flex flex-wrap items-center gap-3">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="notes" className={TAB_TRIGGER}>
              <NotebookPen className="size-4" /> Notes
              <Badge variant="secondary" className="tabular-nums">
                {notes.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="bookmarks" className={TAB_TRIGGER}>
              <Bookmark className="size-4" /> Bookmarks
              <Badge variant="secondary" className="tabular-nums">
                {bookmarks.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {items.length > 0 && (
            <div className="relative ml-auto w-full sm:w-64">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your notes"
                className="pl-9"
                aria-label="Search notes and bookmarks"
              />
            </div>
          )}
        </div>

        <TabsContent value="notes" className="mt-4">
          {renderList(notes, "note")}
        </TabsContent>
        <TabsContent value="bookmarks" className="mt-4">
          {renderList(bookmarks, "bookmark")}
        </TabsContent>
      </Tabs>
    </div>
  );
}
