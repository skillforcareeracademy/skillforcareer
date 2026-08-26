"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  PlayCircle,
  ListVideo,
  StickyNote,
  Bookmark,
  Plus,
  Trash2,
  ArrowRight,
  Loader2,
  FileText,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { resolveEmbed, embedLabel } from "@/lib/media";

interface Lesson {
  id: string;
  title: string;
  type: string;
  durationSeconds: number;
  isPreview: boolean;
  content: string | null;
  videoUrl: string | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
  completed: boolean;
  lastPosition: number;
}
interface Chapter {
  id: string;
  title: string;
  lessons: Lesson[];
}
export interface PlayerData {
  id: string;
  title: string;
  slug: string;
  instructor: { name: string; avatarUrl: string | null; headline: string | null };
  chapters: Chapter[];
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
  resumeLessonId: string | null;
}
interface NoteItem {
  id: string;
  content: string;
  timestampSeconds: number;
  createdAt: string;
}
interface BookmarkItem {
  id: string;
  label: string | null;
  timestampSeconds: number;
  createdAt: string;
}

function fmt(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
function initials(name: string): string {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export function CoursePlayer({
  player,
  viewerLabel,
}: {
  player: PlayerData;
  viewerLabel?: string;
}) {
  const allLessons = useMemo(() => player.chapters.flatMap((c) => c.lessons), [player]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastSave = useRef(0);

  // `?lesson=` wins over the resume point, so a note or bookmark opened from
  // Student → Notes lands on the lesson it was written against. An id that is
  // no longer in the course falls back to the normal resume behaviour.
  const requestedId = useSearchParams().get("lesson");
  const startId =
    (requestedId && allLessons.some((l) => l.id === requestedId) ? requestedId : null) ??
    player.resumeLessonId ??
    allLessons[0]?.id ??
    "";

  const [currentId, setCurrentId] = useState(startId);
  const [completed, setCompleted] = useState<Set<string>>(
    () => new Set(allLessons.filter((l) => l.completed).map((l) => l.id)),
  );
  const [pct, setPct] = useState(player.progressPercent);
  const [tab, setTab] = useState<"notes" | "bookmarks">("notes");
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [bmLabel, setBmLabel] = useState("");
  const [marking, setMarking] = useState(false);

  const current = allLessons.find((l) => l.id === currentId) ?? allLessons[0];
  const currentIndex = allLessons.findIndex((l) => l.id === currentId);
  const next = allLessons[currentIndex + 1] ?? null;
  /**
   * How this lesson's material should be shown. A lesson carries either a video
   * URL or a document/link attachment, and either may be a Drive or YouTube
   * share link rather than a file the browser can play directly.
   */
  const embed = resolveEmbed(current?.videoUrl ?? current?.attachmentUrl);
  const isDone = current ? completed.has(current.id) : false;

  // Load notes + bookmarks whenever the lesson changes.
  useEffect(() => {
    if (!currentId) return;
    let alive = true;
    api.get<NoteItem[]>(`/api/lessons/${currentId}/notes`).then((n) => alive && setNotes(n)).catch(() => {});
    api.get<BookmarkItem[]>(`/api/lessons/${currentId}/bookmarks`).then((bm) => alive && setBookmarks(bm)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [currentId]);

  function saveProgress(body: { position?: number; watched?: number; completed?: boolean }) {
    return api.post(`/api/lessons/${currentId}/progress`, body).catch(() => null);
  }

  function onTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    const now = Date.now();
    if (now - lastSave.current > 10000) {
      lastSave.current = now;
      saveProgress({ position: Math.floor(v.currentTime), watched: Math.floor(v.currentTime) });
    }
  }
  function onLoadedMeta() {
    const v = videoRef.current;
    if (v && current && current.lastPosition > 5 && current.lastPosition < v.duration - 5) {
      v.currentTime = current.lastPosition;
    }
  }

  async function markComplete(value: boolean) {
    if (!current) return;
    setMarking(true);
    const v = videoRef.current;
    const res = await saveProgress({ completed: value, position: v ? Math.floor(v.currentTime) : undefined });
    setCompleted((prev) => {
      const nextSet = new Set(prev);
      if (value) nextSet.add(current.id);
      else nextSet.delete(current.id);
      return nextSet;
    });
    if (res && typeof res === "object" && "progressPercent" in res) {
      const r = res as { progressPercent: number; certificateIssued?: boolean };
      setPct(r.progressPercent);
      if (r.certificateIssued) {
        toast.success("🎉 Course complete — your certificate has been issued!");
      }
    }
    setMarking(false);
    if (value && next) selectLesson(next.id);
  }

  function selectLesson(id: string) {
    if (id === currentId) return;
    const v = videoRef.current;
    if (v && current?.videoUrl) saveProgress({ position: Math.floor(v.currentTime) });
    setNotes([]);
    setBookmarks([]);
    setCurrentId(id);
  }
  function seekTo(seconds: number) {
    const v = videoRef.current;
    if (v) {
      v.currentTime = seconds;
      void v.play().catch(() => {});
    }
  }

  async function addNote() {
    const content = noteDraft.trim();
    if (!content) return;
    const ts = videoRef.current ? Math.floor(videoRef.current.currentTime) : 0;
    try {
      // Append the saved note straight from the create response. Previously we
      // re-fetched the whole list and fell back to a stale copy on failure —
      // so a hiccup on the refetch made a just-saved note vanish.
      const res = await api.post<{ id: string }>(`/api/lessons/${currentId}/notes`, {
        content,
        timestampSeconds: ts,
      });
      setNoteDraft("");
      setNotes((prev) =>
        [...prev, { id: res.id, content, timestampSeconds: ts, createdAt: new Date().toISOString() }].sort(
          (a, b) => a.timestampSeconds - b.timestampSeconds,
        ),
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save note.");
    }
  }
  async function removeNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await api.del(`/api/notes/${id}`).catch(() => {});
  }
  async function addBookmark() {
    const ts = videoRef.current ? Math.floor(videoRef.current.currentTime) : 0;
    const label = bmLabel.trim();
    try {
      const res = await api.post<{ id: string }>(`/api/lessons/${currentId}/bookmarks`, {
        timestampSeconds: ts,
        label: label || undefined,
      });
      setBmLabel("");
      setBookmarks((prev) =>
        [...prev, { id: res.id, label: label || null, timestampSeconds: ts, createdAt: new Date().toISOString() }].sort(
          (a, b) => a.timestampSeconds - b.timestampSeconds,
        ),
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save bookmark.");
    }
  }
  async function removeBookmark(id: string) {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
    await api.del(`/api/bookmarks/${id}`).catch(() => {});
  }

  const completedCount = completed.size;

  return (
    <div className="-m-4 flex min-h-[calc(100vh-4rem)] flex-col sm:-m-6 lg:flex-row">
      {/* Main */}
      <div className="min-w-0 flex-1 p-4 sm:p-6">
        <Link
          href="/student/learning"
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" /> {player.title}
        </Link>

        {/* Player */}
        <div
          className="relative overflow-hidden rounded-2xl bg-black select-none"
          onContextMenu={(e) => e.preventDefault()}
        >
          {embed?.kind === "video-file" ? (
            <video
              key={current!.id}
              ref={videoRef}
              src={embed.src}
              controls
              playsInline
              controlsList="nodownload noplaybackrate"
              disablePictureInPicture
              className="aspect-video w-full bg-black"
              onLoadedMetadata={onLoadedMeta}
              onTimeUpdate={onTimeUpdate}
              onEnded={() => markComplete(true)}
            />
          ) : embed?.kind === "iframe" || embed?.kind === "pdf" ? (
            // YouTube / Vimeo / Google Drive / a hosted PDF. Each of these needs
            // a frame rather than a <video>, which is why a pasted Drive link
            // used to show nothing at all.
            <iframe
              key={current!.id}
              src={embed.src}
              title={current!.title}
              className="aspect-video w-full bg-white"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
            />
          ) : embed?.kind === "link" ? (
            <div className="bg-muted grid aspect-video place-items-center p-6 text-center">
              <div>
                <FileText className="text-muted-foreground mx-auto mb-2 size-8" />
                <p className="text-sm font-medium">{current?.title}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  This material opens in a new tab.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-muted grid aspect-video place-items-center p-6 text-center">
              <div>
                <FileText className="text-muted-foreground mx-auto mb-2 size-8" />
                <p className="text-sm font-medium">{current?.title}</p>
                <p className="text-muted-foreground text-xs">No material for this lesson yet.</p>
              </div>
            </div>
          )}

          {/* Anti-piracy watermark — the viewer's email, so leaked screenshots are traceable. */}
          {embed?.kind === "video-file" && viewerLabel && (
            <div className="pointer-events-none absolute inset-0 flex flex-wrap items-center justify-center gap-x-16 gap-y-12 overflow-hidden opacity-[0.09]">
              {Array.from({ length: 8 }).map((_, i) => (
                <span key={i} className="rotate-[-20deg] text-[11px] font-medium whitespace-nowrap text-white">
                  {viewerLabel}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Lesson header */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{current?.title}</h1>
            <p className="text-muted-foreground text-xs">
              Lesson {currentIndex + 1} of {allLessons.length}
              {current?.durationSeconds ? ` · ${fmt(current.durationSeconds)}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={isDone ? "outline" : "default"}
              size="sm"
              onClick={() => markComplete(!isDone)}
              disabled={marking}
            >
              {marking ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              {isDone ? "Completed" : "Mark complete"}
            </Button>
            {next && (
              <Button variant="secondary" size="sm" onClick={() => selectLesson(next.id)}>
                Next <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>

        {embed && (
          <a
            href={embed.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground mt-3 inline-flex items-center gap-1.5 text-sm"
          >
            <ExternalLink className="size-4" />
            {current?.attachmentName ?? embedLabel(embed)}
          </a>
        )}

        {/* Article content */}
        {!current?.videoUrl && current?.content && (
          <div
            className="prose prose-sm dark:prose-invert mt-4 max-w-none"
            dangerouslySetInnerHTML={{ __html: current.content }}
          />
        )}

        {/* Notes / Bookmarks */}
        <div className="mt-6 rounded-2xl border">
          <div className="flex border-b">
            <TabButton active={tab === "notes"} onClick={() => setTab("notes")} icon={StickyNote} label={`Notes (${notes.length})`} />
            <TabButton active={tab === "bookmarks"} onClick={() => setTab("bookmarks")} icon={Bookmark} label={`Bookmarks (${bookmarks.length})`} />
          </div>

          {tab === "notes" ? (
            <div className="space-y-3 p-4">
              <div className="flex gap-2">
                <Textarea
                  rows={1}
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="Add a note at the current time…"
                  className="min-h-9 flex-1"
                />
                <Button size="sm" onClick={addNote} disabled={!noteDraft.trim()}>
                  <Plus className="size-4" /> Add
                </Button>
              </div>
              {notes.length === 0 ? (
                <p className="text-muted-foreground text-sm">No notes yet.</p>
              ) : (
                <ul className="space-y-2">
                  {notes.map((n) => (
                    <li key={n.id} className="flex items-start gap-3 rounded-lg border p-2.5">
                      <button
                        type="button"
                        onClick={() => seekTo(n.timestampSeconds)}
                        className="bg-muted hover:bg-accent mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-xs"
                      >
                        {fmt(n.timestampSeconds)}
                      </button>
                      <p className="min-w-0 flex-1 text-sm">{n.content}</p>
                      <Button variant="ghost" size="icon-sm" className="text-muted-foreground shrink-0" onClick={() => removeNote(n.id)} aria-label="Delete note">
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-3 p-4">
              <div className="flex gap-2">
                <Input
                  value={bmLabel}
                  onChange={(e) => setBmLabel(e.target.value)}
                  placeholder="Bookmark this moment (optional label)…"
                />
                <Button size="sm" onClick={addBookmark}>
                  <Bookmark className="size-4" /> Save
                </Button>
              </div>
              {bookmarks.length === 0 ? (
                <p className="text-muted-foreground text-sm">No bookmarks yet.</p>
              ) : (
                <ul className="space-y-2">
                  {bookmarks.map((bm) => (
                    <li key={bm.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                      <button
                        type="button"
                        onClick={() => seekTo(bm.timestampSeconds)}
                        className="bg-muted hover:bg-accent shrink-0 rounded px-1.5 py-0.5 font-mono text-xs"
                      >
                        {fmt(bm.timestampSeconds)}
                      </button>
                      <p className="min-w-0 flex-1 text-sm">{bm.label || "Bookmark"}</p>
                      <Button variant="ghost" size="icon-sm" className="text-muted-foreground shrink-0" onClick={() => removeBookmark(bm.id)} aria-label="Remove bookmark">
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Curriculum sidebar */}
      <aside className="bg-muted/20 shrink-0 border-t lg:w-[360px] lg:border-t-0 lg:border-l">
        <div className="border-b p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <ListVideo className="size-4" /> Course content
          </p>
          <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
            <span>
              {completedCount}/{allLessons.length} lessons
            </span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="bg-muted mt-1.5 h-1.5 overflow-hidden rounded-full">
            <div
              className={cn("h-full rounded-full", pct >= 100 ? "bg-emerald-500" : "bg-primary")}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto lg:max-h-[calc(100vh-14rem)]">
          {player.chapters.map((ch, ci) => (
            <div key={ch.id} className="border-b last:border-b-0">
              <p className="bg-muted/40 px-4 py-2.5 text-sm font-medium">
                {ci + 1}. {ch.title}
              </p>
              <ul>
                {ch.lessons.map((l) => {
                  const isCurrent = l.id === currentId;
                  const isComplete = completed.has(l.id);
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => selectLesson(l.id)}
                        className={cn(
                          "hover:bg-accent flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                          isCurrent && "bg-accent",
                        )}
                      >
                        {isComplete ? (
                          <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                        ) : isCurrent ? (
                          <PlayCircle className="text-primary size-4 shrink-0" />
                        ) : (
                          <Circle className="text-muted-foreground size-4 shrink-0" />
                        )}
                        <span className={cn("min-w-0 flex-1 truncate", isCurrent && "font-medium")}>
                          {l.title}
                        </span>
                        {l.durationSeconds > 0 && (
                          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                            {fmt(l.durationSeconds)}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t p-4">
          <Avatar className="size-9">
            {player.instructor.avatarUrl && <AvatarImage src={player.instructor.avatarUrl} alt={player.instructor.name} />}
            <AvatarFallback className="text-xs">{initials(player.instructor.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">Instructor</p>
            <p className="truncate text-sm font-medium">{player.instructor.name}</p>
          </div>
          {pct >= 100 && (
            <Badge variant="secondary" className="ml-auto bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              Done
            </Badge>
          )}
        </div>
      </aside>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof StickyNote;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
        active ? "border-primary text-foreground" : "text-muted-foreground border-transparent hover:text-foreground",
      )}
    >
      <Icon className="size-4" /> {label}
    </button>
  );
}
