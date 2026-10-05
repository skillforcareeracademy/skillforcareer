"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenCheck,
  Download,
  FileText,
  Highlighter,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  Lock,
  Search,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { HIGHLIGHT_COLORS } from "@/lib/validations/study-material";
import type {
  LearnerMaterial,
  LearnerMaterialDetail,
} from "@/server/services/material-learner-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/shared/empty-state";
import { GroupBrowser } from "./group-browser";
import { cn } from "@/lib/utils";
import { WordLookup } from "@/components/shared/word-lookup";

/**
 * The reading a learner has been set, and the reader they read it in.
 *
 * Grouped the way the academy grouped it, with the filters and sort the client
 * asked for. Opening a piece starts a clock — the same twenty-second heartbeat
 * the batch-notes reader uses, counted only while the tab is in front — and a
 * learner can select any passage of written material to highlight it and keep a
 * note against it. Those marks are theirs alone.
 */

const ALL = "__all";
const HEARTBEAT_MS = 20_000;

function readable(seconds: number): string {
  if (seconds <= 0) return "";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

const SWATCH: Record<string, string> = {
  yellow: "bg-amber-200 dark:bg-amber-400/40",
  green: "bg-emerald-200 dark:bg-emerald-400/40",
  blue: "bg-sky-200 dark:bg-sky-400/40",
  pink: "bg-pink-200 dark:bg-pink-400/40",
};

function send(materialId: string, seconds: number, opened: boolean) {
  void fetch(`/api/student/materials/${materialId}/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seconds, opened }),
    keepalive: true,
  }).catch(() => {});
}

/** Counts the time a piece is open and in front, and reports it as it goes. */
function useReadingClock(materialId: string | null) {
  const [progress, setProgress] = useState<{
    id: string;
    seconds: number;
  } | null>(null);

  useEffect(() => {
    if (!materialId) return;
    const id = materialId;
    send(id, 0, true);

    let counted = 0;
    let since = Date.now();
    let visible = document.visibilityState === "visible";

    function take(): number {
      const now = Date.now();
      const seconds = visible ? Math.round((now - since) / 1000) : 0;
      since = now;
      return seconds;
    }
    function beat(report: boolean): void {
      const seconds = take();
      if (seconds <= 0) return;
      counted += seconds;
      send(id, seconds, false);
      if (report) setProgress({ id, seconds: counted });
    }
    function onVisibility(): void {
      beat(true);
      visible = document.visibilityState === "visible";
      since = Date.now();
    }

    const tick = () => beat(true);
    const leave = () => beat(false);
    const timer = window.setInterval(tick, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", leave);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", leave);
      beat(false);
    };
  }, [materialId]);

  return progress;
}

/** The written material, with this learner's marks drawn over it. */
/** Reading written in the panel arrives as HTML once it has been edited. */
function looksLikeHtml(body: string): boolean {
  return /<(p|h[1-6]|ul|ol|li|strong|em|blockquote|br)\b/i.test(body);
}

/**
 * Paint a learner's highlights over rendered HTML.
 *
 * The plain-text path below can rebuild the whole string; HTML cannot be split
 * that way without destroying its markup, so this walks the text nodes and
 * wraps the matches in place. React never manages this subtree — the effect
 * writes it — so there is nothing for it to disagree with.
 */
function paint(root: HTMLElement, quote: string, color: string) {
  if (!quote.trim()) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.nodeValue?.includes(quote)) hits.push(node);
  }
  for (const node of hits) {
    const value = node.nodeValue ?? "";
    const at = value.indexOf(quote);
    if (at < 0) continue;
    const after = node.splitText(at);
    after.splitText(quote.length);
    const mark = document.createElement("mark");
    mark.className = `rounded px-0.5 text-inherit ${SWATCH[color] ?? SWATCH.yellow}`;
    mark.textContent = quote;
    after.replaceWith(mark);
  }
}

function HtmlBody({
  body,
  marks,
}: {
  body: string;
  marks: LearnerMaterialDetail["marks"];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.innerHTML = body;
    // Longest first, so an overlapping shorter quote can't split a longer one.
    for (const m of [...marks].sort((a, b) => b.quote.length - a.quote.length)) {
      paint(root, m.quote, m.color);
    }
  }, [body, marks]);

  return (
    <div
      ref={ref}
      // The same marks the panel's editor can apply: a first-level heading,
      // a highlight, and a picture.
      className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-lg [&_mark]:rounded [&_mark]:px-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
    />
  );
}

function MarkedUpBody({
  body,
  marks,
}: {
  body: string;
  marks: LearnerMaterialDetail["marks"];
}) {
  // Longest first, so an overlapping shorter quote can't split a longer one.
  const ordered = useMemo(
    () => [...marks].sort((a, b) => b.quote.length - a.quote.length),
    [marks],
  );

  const pieces = useMemo(() => {
    type Piece = { text: string; color?: string };
    let parts: Piece[] = [{ text: body }];
    for (const mark of ordered) {
      const next: Piece[] = [];
      for (const part of parts) {
        if (part.color || !part.text.includes(mark.quote)) {
          next.push(part);
          continue;
        }
        const chunks = part.text.split(mark.quote);
        chunks.forEach((chunk, i) => {
          if (chunk) next.push({ text: chunk });
          if (i < chunks.length - 1)
            next.push({ text: mark.quote, color: mark.color });
        });
      }
      parts = next;
    }
    return parts;
  }, [body, ordered]);

  return (
    <p className="text-sm leading-relaxed whitespace-pre-line">
      {pieces.map((p, i) =>
        p.color ? (
          <mark
            key={i}
            className={cn("rounded px-0.5 text-inherit", SWATCH[p.color])}
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  );
}

export function StudentMaterialsClient({
  materials,
}: {
  materials: LearnerMaterial[];
}) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState(ALL);
  const [sort, setSort] = useState<"sequence" | "newest" | "title" | "unread">(
    "sequence",
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LearnerMaterialDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState("");
  const [note, setNote] = useState("");
  const [color, setColor] = useState<"yellow" | "green" | "blue" | "pink">(
    "yellow",
  );
  const [savingMark, setSavingMark] = useState(false);
  const progress = useReadingClock(openId);

  const groups = useMemo(() => {
    const names = new Set<string>();
    for (const m of materials) {
      if (m.categoryName) {
        names.add(
          m.subCategoryName
            ? `${m.categoryName} → ${m.subCategoryName}`
            : m.categoryName,
        );
      }
    }
    return [...names].sort();
  }, [materials]);

  const rows = useMemo(() => {
    let list = materials;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          (m.description ?? "").toLowerCase().includes(q) ||
          (m.categoryName ?? "").toLowerCase().includes(q),
      );
    }
    if (group !== ALL) {
      list = list.filter(
        (m) =>
          (m.subCategoryName
            ? `${m.categoryName} → ${m.subCategoryName}`
            : m.categoryName) === group,
      );
    }
    const sorted = [...list];
    if (sort === "newest")
      sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    else if (sort === "title")
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "unread")
      sorted.sort((a, b) => a.readSeconds - b.readSeconds);
    return sorted;
  }, [materials, search, group, sort]);

  const open = useCallback(async (id: string) => {
    setOpenId(id);
    setDetail(null);
    setSelection("");
    setNote("");
    setLoading(true);
    try {
      const res = await api.get<{ material: LearnerMaterialDetail }>(
        `/api/student/materials/${id}`,
      );
      setDetail(res.material);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't open that.",
      );
      setOpenId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  function captureSelection() {
    const text = window.getSelection()?.toString().trim() ?? "";
    if (text.length > 1) setSelection(text.slice(0, 4000));
  }

  async function saveMark() {
    if (!detail || !selection) return;
    setSavingMark(true);
    try {
      const res = await api.post<{ id: string }>(
        `/api/student/materials/${detail.id}/highlights`,
        {
          quote: selection,
          startOffset: Math.max(0, (detail.body ?? "").indexOf(selection)),
          note,
          color,
        },
      );
      setDetail({
        ...detail,
        highlights: detail.highlights + 1,
        marks: [
          ...detail.marks,
          {
            id: res.id,
            quote: selection,
            startOffset: 0,
            note: note.trim() || null,
            color,
            createdAt: new Date().toISOString(),
          },
        ],
      });
      setSelection("");
      setNote("");
      toast.success("Highlighted.");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't save that.",
      );
    } finally {
      setSavingMark(false);
    }
  }

  async function removeMark(id: string) {
    if (!detail) return;
    try {
      await api.del(`/api/student/highlights/${id}`);
      setDetail({
        ...detail,
        highlights: Math.max(0, detail.highlights - 1),
        marks: detail.marks.filter((m) => m.id !== id),
      });
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Couldn't remove that.",
      );
    }
  }

  async function download(id: string) {
    try {
      const file = await api.post<{ url: string; name: string }>(
        `/api/student/materials/${id}/download`,
      );
      const a = document.createElement("a");
      a.href = file.url;
      a.download = file.name;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.click();
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "That download isn't available.",
      );
    }
  }

  if (materials.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No study material yet"
        description="Your instructor hasn't shared any reading with your batch so far. It will appear here when they do."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search the reading…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={group} onValueChange={(v) => setGroup(String(v))}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Every group">
              {(v) => (!v || v === ALL ? "Every group" : String(v))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Every group</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sort}
          onValueChange={(v) => setSort(String(v) as typeof sort)}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Sort">
              {(v) =>
                ({
                  sequence: "In order",
                  newest: "Newest first",
                  title: "Title",
                  unread: "Not read yet",
                })[String(v ?? "sequence")] ?? "In order"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sequence">In order</SelectItem>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="title">Title</SelectItem>
            <SelectItem value="unread">Not read yet</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Groups first, the reading on a tap — the same two levels the academy
          files it under, and the same behaviour as the quizzes page. */}
      <GroupBrowser
        items={rows}
        query={search}
        noun={{ one: "item", many: "items" }}
        columns="md:grid-cols-2"
        renderItem={(m) => {
          const seconds =
            m.readSeconds + (progress?.id === m.id ? progress.seconds : 0);
          return (
            <Card key={m.id} className="gap-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    <span className="text-muted-foreground mr-1.5 text-xs tabular-nums">
                      {m.number}.
                    </span>
                    {m.title}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {m.courseTitle ?? "Study material"}
                    {m.fileName ? ` · ${m.fileName}` : ""}
                  </p>
                </div>
                {seconds > 0 && (
                  <Badge
                    variant="secondary"
                    className="shrink-0 gap-1 bg-emerald-100 text-[10px] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                  >
                    <BookOpenCheck className="size-3" /> {readable(seconds)}
                  </Badge>
                )}
              </div>
              {m.description && (
                <p className="text-muted-foreground line-clamp-2 text-sm">
                  {m.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void open(m.id)}
                >
                  {seconds > 0 ? "Read again" : "Read"}
                </Button>
                {m.fileUrl &&
                  (m.downloadsEnabled ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void download(m.id)}
                    >
                      <Download className="size-4" /> Download
                    </Button>
                  ) : (
                    <span className="text-muted-foreground flex items-center gap-1 text-xs">
                      <Lock className="size-3" /> Reading only
                    </span>
                  ))}
                {m.highlights > 0 && (
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <Highlighter className="size-3" /> {m.highlights}
                  </span>
                )}
              </div>
            </Card>
          );
        }}
      />

      {/* ── The reader ───────────────────────────────────────────────────── */}
      <Sheet open={openId !== null} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{detail?.title ?? "Opening…"}</SheetTitle>
            <SheetDescription>
              {detail
                ? [
                    detail.categoryName,
                    detail.subCategoryName,
                    detail.courseTitle,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Study material"
                : ""}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-4 pb-8">
            {loading && (
              <p className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
                <Loader2 className="size-4 animate-spin" /> Opening…
              </p>
            )}

            {detail?.description && (
              <p className="text-muted-foreground text-sm">
                {detail.description}
              </p>
            )}

            {detail?.fileUrl && (
              <div className="bg-muted/50 flex min-w-0 items-center gap-2 rounded-lg px-3 py-2">
                <FileText className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {detail.fileName || "Attached document"}
                </span>
                {detail.downloadsEnabled ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void download(detail.id)}
                  >
                    <Download className="size-4" /> Download
                  </Button>
                ) : (
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <Lock className="size-3" /> Reading only
                  </span>
                )}
              </div>
            )}

            {/* Everything attached to the reading, beyond the main file. */}
            {detail && detail.assets.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {detail.assets.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="text-muted-foreground shrink-0">
                      {a.kind === "LINK" ? (
                        <LinkIcon className="size-4" />
                      ) : a.kind === "IMAGE" ? (
                        <ImageIcon className="size-4" />
                      ) : a.kind === "VIDEO" ? (
                        <Video className="size-4" />
                      ) : (
                        <FileText className="size-4" />
                      )}
                    </span>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate text-sm hover:underline"
                    >
                      {a.name || a.url}
                    </a>
                  </li>
                ))}
              </ul>
            )}

            {detail?.body && (
              /* Double-tapping a word here looks it up in the academy's
                 dictionary — "when anyone read notes, meaning of a word should
                 be visible by clicking on that word". Highlighting still works:
                 the lookup listens for a double-click, the highlighter for the
                 selection left behind by a drag. */
              <WordLookup>
                <div onMouseUp={captureSelection} onTouchEnd={captureSelection}>
                  {looksLikeHtml(detail.body) ? (
                    <HtmlBody body={detail.body} marks={detail.marks} />
                  ) : (
                    <MarkedUpBody body={detail.body} marks={detail.marks} />
                  )}
                </div>
              </WordLookup>
            )}

            {detail?.body && (
              <div className="space-y-2 rounded-xl border p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Highlighter className="size-4" /> Highlight a passage
                </p>
                {selection ? (
                  <>
                    <p className="bg-muted/60 rounded-lg p-2 text-sm italic">
                      &ldquo;{selection.slice(0, 300)}
                      {selection.length > 300 ? "…" : ""}&rdquo;
                    </p>
                    <Textarea
                      rows={2}
                      placeholder="Your note on it (optional)"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      {HIGHLIGHT_COLORS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          aria-label={c.label}
                          onClick={() => setColor(c.value)}
                          className={cn(
                            "size-6 rounded-full border-2",
                            SWATCH[c.value],
                            color === c.value
                              ? "border-foreground"
                              : "border-transparent",
                          )}
                        />
                      ))}
                      <Button
                        size="sm"
                        disabled={savingMark}
                        onClick={() => void saveMark()}
                      >
                        {savingMark && (
                          <Loader2 className="size-4 animate-spin" />
                        )}
                        Save highlight
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelection("")}
                      >
                        Clear
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Select any part of the text above and it will appear here to
                    highlight.
                  </p>
                )}
              </div>
            )}

            {detail && detail.marks.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Your highlights</p>
                <ul className="space-y-2">
                  {detail.marks.map((h) => (
                    <li
                      key={h.id}
                      className="flex items-start gap-2 rounded-lg border p-2"
                    >
                      <span
                        className={cn(
                          "mt-1 size-3 shrink-0 rounded-full",
                          SWATCH[h.color],
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm italic">
                          &ldquo;{h.quote.slice(0, 200)}
                          {h.quote.length > 200 ? "…" : ""}&rdquo;
                        </p>
                        {h.note && (
                          <p className="text-muted-foreground text-sm">
                            {h.note}
                          </p>
                        )}
                      </div>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Remove highlight"
                        onClick={() => void removeMark(h.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail && (
              <p className="text-muted-foreground text-xs">
                Your reading time is recorded on your report card. Highlights
                and notes are yours alone.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
