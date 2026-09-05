"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckSquare,
  Hourglass,
  Loader2,
  Lock,
  LockOpen,
  Search,
  Square,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReleaseBoard, ReleaseMode } from "@/server/services/release-service";
import { cn } from "@/lib/utils";

/**
 * "Content access" — the answer to the client's "Kya ye mai control kr skta hu
 * abhi????".
 *
 * Tick the lessons, choose how they open, save. Everything is a bulk operation
 * because that is how the question is actually asked: give this batch the first
 * module now and the rest next month, or hand one learner the whole course at
 * once.
 */

const MODES: { value: ReleaseMode; label: string; hint: string }[] = [
  {
    value: "IMMEDIATE",
    label: "Open to everyone enrolled",
    hint: "Anyone on the course sees it the moment they enrol.",
  },
  {
    value: "SCHEDULED",
    label: "Opens on a date",
    hint: "Hidden until the date you pick, then open to everyone.",
  },
  {
    value: "DRIP",
    label: "Opens days after enrolling",
    hint: "Counted from each learner's own start date, so every batch is paced the same.",
  },
  {
    value: "MANUAL",
    label: "Only the batches / learners I pick",
    hint: "Nobody sees it until you unlock it for them.",
  },
];

const MODE_BADGE: Record<ReleaseMode, { label: string; className: string }> = {
  IMMEDIATE: {
    label: "Open",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
  SCHEDULED: {
    label: "Scheduled",
    className: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  },
  DRIP: {
    label: "Drip",
    className: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  },
  MANUAL: {
    label: "Locked",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
};

/** `<input type="datetime-local">` wants local wall-clock, not an ISO string. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ReleaseManager({ courseId }: { courseId: string }) {
  const [board, setBoard] = useState<ReleaseBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const [mode, setMode] = useState<ReleaseMode>("IMMEDIATE");
  const [releaseAt, setReleaseAt] = useState("");
  const [dripDays, setDripDays] = useState("7");
  const [viewLimit, setViewLimit] = useState("");
  const [downloadLimit, setDownloadLimit] = useState("");
  const [batchIds, setBatchIds] = useState<Set<string>>(new Set());
  const [studentIds, setStudentIds] = useState<Set<string>>(new Set());

  // Inline `.then` with the setState inside the callbacks — the shape the
  // react-hooks lint rules accept for a fetch-on-mount (see lead-detail-sheet).
  useEffect(() => {
    api
      .get<ReleaseBoard>(`/api/courses/${courseId}/release`)
      .then(
        (data) => {
          setBoard(data);
          setLoading(false);
        },
        () => {
          toast.error("Couldn't load the access settings.");
          setLoading(false);
        },
      );
  }, [courseId]);

  const lessons = useMemo(() => {
    if (!board) return [];
    const q = search.trim().toLowerCase();
    if (!q) return board.lessons;
    return board.lessons.filter(
      (l) =>
        l.title.toLowerCase().includes(q) || l.chapterTitle.toLowerCase().includes(q),
    );
  }, [board, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof lessons>();
    for (const l of lessons) {
      const list = map.get(l.chapterId) ?? [];
      list.push(l);
      map.set(l.chapterId, list);
    }
    return [...map.entries()];
  }, [lessons]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleChapter(ids: string[]) {
    const allOn = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function toggleIn(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  /** Load the clicked lesson's own rule into the form, so editing one is direct. */
  function loadFrom(id: string) {
    const l = board?.lessons.find((x) => x.id === id);
    if (!l) return;
    setSelected(new Set([id]));
    setMode(l.releaseMode);
    setReleaseAt(toLocalInput(l.releaseAt));
    setDripDays(l.dripDays != null ? String(l.dripDays) : "7");
    setViewLimit(l.viewLimit != null ? String(l.viewLimit) : "");
    setDownloadLimit(l.downloadLimit != null ? String(l.downloadLimit) : "");
    setBatchIds(new Set(l.batchIds));
    setStudentIds(new Set(l.studentIds));
  }

  async function save() {
    if (selected.size === 0) {
      toast.error("Tick the lessons you want to change.");
      return;
    }
    if (mode === "SCHEDULED" && !releaseAt) {
      toast.error("Pick the date it should open.");
      return;
    }
    if (mode === "MANUAL" && batchIds.size === 0 && studentIds.size === 0) {
      toast.error("Choose at least one batch or learner — or these stay shut to everyone.");
      return;
    }

    setSaving(true);
    try {
      const res = await api.patch<{ message: string }>(
        `/api/courses/${courseId}/release`,
        {
          lessonIds: [...selected],
          releaseMode: mode,
          releaseAt: mode === "SCHEDULED" ? new Date(releaseAt).toISOString() : null,
          dripDays: mode === "DRIP" ? Number(dripDays) || 0 : null,
          viewLimit: viewLimit.trim() === "" ? null : Number(viewLimit),
          downloadLimit: downloadLimit.trim() === "" ? null : Number(downloadLimit),
          batchIds: mode === "MANUAL" ? [...batchIds] : [],
          studentIds: mode === "MANUAL" ? [...studentIds] : [],
        },
      );
      toast.success(res.message);
      const fresh = await api.get<ReleaseBoard>(`/api/courses/${courseId}/release`);
      setBoard(fresh);
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-10 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading access settings…
      </div>
    );
  }

  if (!board || board.lessons.length === 0) {
    return (
      <EmptyState
        icon={Lock}
        title="No lessons yet"
        description="Add chapters and lessons under Curriculum, then decide who sees them and when."
      />
    );
  }

  const chapterTitles = new Map(board.lessons.map((l) => [l.chapterId, l.chapterTitle]));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
      {/* ── The curriculum, with its current rules ─────────────────────────── */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a lesson…"
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelected(new Set(board.lessons.map((l) => l.id)))}
            >
              <CheckSquare className="size-4" /> Select all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
              disabled={selected.size === 0}
            >
              Clear
            </Button>
          </div>
        </div>

        {grouped.map(([chapterId, items]) => {
          const ids = items.map((l) => l.id);
          const allOn = ids.every((id) => selected.has(id));
          return (
            <Card key={chapterId}>
              <CardContent className="space-y-1 p-3">
                <button
                  type="button"
                  onClick={() => toggleChapter(ids)}
                  className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 px-1 py-1 text-left text-xs font-medium tracking-wide uppercase"
                >
                  {allOn ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
                  {chapterTitles.get(chapterId)}
                </button>

                {items.map((l) => {
                  const badge = MODE_BADGE[l.releaseMode];
                  const on = selected.has(l.id);
                  return (
                    <div
                      key={l.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border border-transparent px-2 py-2",
                        on && "border-primary/40 bg-primary/5",
                      )}
                    >
                      <Checkbox checked={on} onCheckedChange={() => toggle(l.id)} />
                      <button
                        type="button"
                        onClick={() => loadFrom(l.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm font-medium">{l.title}</p>
                        <p className="text-muted-foreground truncate text-xs">
                          {l.releaseMode === "SCHEDULED" && l.releaseAt
                            ? `Opens ${new Date(l.releaseAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                            : l.releaseMode === "DRIP"
                              ? `Opens ${l.dripDays ?? 0} days after enrolling`
                              : l.releaseMode === "MANUAL"
                                ? `${l.batchIds.length} batch${l.batchIds.length === 1 ? "" : "es"} · ${l.studentIds.length} learner${l.studentIds.length === 1 ? "" : "s"} unlocked`
                                : l.isPreview
                                  ? "Free preview — always open"
                                  : "Open to everyone enrolled"}
                          {l.viewLimit ? ` · ${l.viewLimit} views` : ""}
                          {l.downloadLimit ? ` · ${l.downloadLimit} downloads` : ""}
                        </p>
                      </button>
                      <Badge variant="secondary" className={cn("shrink-0", badge.className)}>
                        {badge.label}
                      </Badge>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── The rule being applied ─────────────────────────────────────────── */}
      <Card className="lg:sticky lg:top-6">
        <CardContent className="space-y-4">
          <div>
            <p className="font-semibold">Set access</p>
            <p className="text-muted-foreground text-xs">
              {selected.size === 0
                ? "Tick lessons on the left to change them."
                : `${selected.size} lesson${selected.size === 1 ? "" : "s"} selected.`}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>When it opens</Label>
            <Select value={mode} onValueChange={(v) => v && setMode(v as ReleaseMode)}>
              <SelectTrigger>
                <SelectValue>
                  {(v) => MODES.find((m) => m.value === v)?.label ?? "Choose"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              {MODES.find((m) => m.value === mode)?.hint}
            </p>
          </div>

          {mode === "SCHEDULED" && (
            <div className="space-y-1.5">
              <Label htmlFor="rel-at" className="flex items-center gap-1.5">
                <CalendarClock className="size-3.5" /> Opens on
              </Label>
              <Input
                id="rel-at"
                type="datetime-local"
                value={releaseAt}
                onChange={(e) => setReleaseAt(e.target.value)}
              />
            </div>
          )}

          {mode === "DRIP" && (
            <div className="space-y-1.5">
              <Label htmlFor="rel-drip" className="flex items-center gap-1.5">
                <Hourglass className="size-3.5" /> Days after enrolling
              </Label>
              <Input
                id="rel-drip"
                type="number"
                min={0}
                value={dripDays}
                onChange={(e) => setDripDays(e.target.value)}
              />
            </div>
          )}

          {mode === "MANUAL" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Users className="size-3.5" /> Batches
                </Label>
                {board.batches.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    No batches on this course yet.
                  </p>
                ) : (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
                    {board.batches.map((b) => (
                      <label
                        key={b.id}
                        className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm"
                      >
                        <Checkbox
                          checked={batchIds.has(b.id)}
                          onCheckedChange={() => toggleIn(batchIds, setBatchIds, b.id)}
                        />
                        <span className="min-w-0 flex-1 truncate">{b.name}</span>
                        <span className="text-muted-foreground text-xs">
                          {b.learners}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Individual learners</Label>
                {board.students.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    Nobody is enrolled on this course yet.
                  </p>
                ) : (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2">
                    {board.students.map((s) => (
                      <label
                        key={s.id}
                        className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm"
                      >
                        <Checkbox
                          checked={studentIds.has(s.id)}
                          onCheckedChange={() => toggleIn(studentIds, setStudentIds, s.id)}
                        />
                        <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Watch limits</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rel-views" className="text-xs">
                  Views each
                </Label>
                <Input
                  id="rel-views"
                  type="number"
                  min={0}
                  value={viewLimit}
                  onChange={(e) => setViewLimit(e.target.value)}
                  placeholder="Default"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rel-dl" className="text-xs">
                  Downloads each
                </Label>
                <Input
                  id="rel-dl"
                  type="number"
                  min={0}
                  value={downloadLimit}
                  onChange={(e) => setDownloadLimit(e.target.value)}
                  placeholder="Default"
                />
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              Blank uses the platform default from Settings → Learning. 0 means
              unlimited.
            </p>
          </div>

          <Button onClick={save} disabled={saving || selected.size === 0} className="w-full">
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : mode === "IMMEDIATE" ? (
              <LockOpen className="size-4" />
            ) : (
              <Lock className="size-4" />
            )}
            Apply to {selected.size || "…"} lesson{selected.size === 1 ? "" : "s"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
