"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Download,
  Eraser,
  FilePlus2,
  Highlighter,
  Loader2,
  Pen,
  Save,
  Search,
  Trash2,
  Undo2,
} from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import {
  BOARD_COLOURS,
  type BoardTool,
  type Stroke,
} from "@/lib/validations/board";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";

/**
 * A board to write on while teaching, and the pages it keeps.
 *
 * "An option of notepad to write like a board on screen with screen pen. Every
 * option to highlight, erase, draw and all … also an option to save those
 * slides and filter those slides lecture wise or class wise."
 *
 * Drawing is kept as strokes in coordinates from 0 to 1 rather than as a
 * picture: a page reopens at any screen size, can be drawn on further, and
 * costs a few kilobytes. The canvas is redrawn from those strokes whenever it
 * resizes, which is also what makes it work on a phone turned sideways.
 */

interface SlideRow {
  id: string;
  title: string;
  strokeCount: number;
  batchName: string | null;
  meetingTitle: string | null;
  courseTitle: string | null;
  createdByName: string;
  createdAt: string;
}

interface Filters {
  batches: { id: string; name: string }[];
  courses: { id: string; title: string }[];
  meetings: { id: string; title: string }[];
}

const ALL = "__all";
const TOOL_WIDTH: Record<BoardTool, number> = {
  pen: 0.004,
  highlighter: 0.02,
  eraser: 0.03,
};

export function Whiteboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const current = useRef<Stroke | null>(null);

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [tool, setTool] = useState<BoardTool>("pen");
  const [colour, setColour] = useState<string>(BOARD_COLOURS[0].value);

  const [slides, setSlides] = useState<SlideRow[]>([]);
  const [filters, setFilters] = useState<Filters>({ batches: [], courses: [], meetings: [] });
  const [batch, setBatch] = useState(ALL);
  const [meeting, setMeeting] = useState(ALL);
  const [course, setCourse] = useState(ALL);
  const [search, setSearch] = useState("");

  const [openId, setOpenId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Drawing ───────────────────────────────────────────────────────────────

  /**
   * Repaint everything.
   *
   * The stroke still under the pen is passed in rather than read off the ref:
   * this is a memoised callback, and a ref read inside one is exactly the kind
   * of thing the compiler is entitled to hold on to — which it did, and the
   * board crashed the first time a stroke finished.
   */
  const repaint = useCallback((live?: Stroke | null) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { width, height } = canvas;
    const unit = Math.min(width, height);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const all = live ? [...strokes, live] : strokes;
    for (const s of all) {
      if (s.points.length < 2) continue;
      ctx.beginPath();
      ctx.lineWidth = Math.max(1, s.width * unit);
      // The eraser paints the page colour: simple, and it means an erased line
      // is gone from the drawing rather than hidden under something.
      ctx.strokeStyle = s.tool === "eraser" ? "#ffffff" : s.color;
      ctx.globalAlpha = s.tool === "highlighter" ? 0.35 : 1;
      ctx.moveTo(s.points[0] * width, s.points[1] * height);
      for (let i = 2; i < s.points.length; i += 2) {
        ctx.lineTo(s.points[i] * width, s.points[i + 1] * height);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, [strokes]);

  // The canvas is sized in device pixels so lines are not blurry, and resized
  // with the element rather than once on mount.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = wrap.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      repaint();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [repaint]);

  useEffect(() => {
    repaint();
  }, [repaint]);

  function at(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const rect = e.currentTarget.getBoundingClientRect();
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const [x, y] = at(e);
    current.current = {
      tool,
      color: colour,
      width: TOOL_WIDTH[tool],
      points: [x, y],
    };
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !current.current) return;
    const [x, y] = at(e);
    const pts = current.current.points;
    // Skip the specks a steady hand produces — fewer points, same line.
    const dx = x - pts[pts.length - 2];
    const dy = y - pts[pts.length - 1];
    if (dx * dx + dy * dy < 0.000004) return;
    pts.push(x, y);
    repaint(current.current);
  }

  function up() {
    const done = current.current;
    current.current = null;
    drawing.current = false;
    if (done && done.points.length >= 4) setStrokes((s) => [...s, done]);
  }

  function undo() {
    setStrokes((s) => s.slice(0, -1));
  }

  function clear() {
    setStrokes([]);
    setOpenId(null);
    setTitle("");
  }

  /** The page as a PNG, for anyone who wants it outside the platform. */
  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${title.trim() || "board"}.png`;
    a.click();
  }

  // ── The saved pages ───────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ pageSize: "60" });
      if (batch !== ALL) qs.set("batchId", batch);
      if (meeting !== ALL) qs.set("meetingId", meeting);
      if (course !== ALL) qs.set("courseId", course);
      if (search.trim()) qs.set("search", search.trim());
      const res = await api.get<{ rows: SlideRow[] }>(`/api/board?${qs.toString()}`);
      setSlides(res.rows);
    } catch {
      // The board still works without the list.
    }
  }, [batch, meeting, course, search]);

  useEffect(() => {
    const id = setTimeout(() => void load(), 250);
    return () => clearTimeout(id);
  }, [load]);

  useEffect(() => {
    const id = setTimeout(() => {
      void api
        .get<Filters>("/api/board/filters")
        .then(setFilters)
        .catch(() => undefined);
    }, 0);
    return () => clearTimeout(id);
  }, []);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    const body = {
      title: title.trim(),
      strokes,
      batchId: batch === ALL ? "" : batch,
      meetingId: meeting === ALL ? "" : meeting,
      courseId: course === ALL ? "" : course,
    };
    try {
      if (openId) {
        await api.patch(`/api/board/${openId}`, body);
        toast.success("Page saved.");
      } else {
        const res = await api.post<{ id: string; message: string }>("/api/board", body);
        setOpenId(res.id);
        toast.success(res.message);
      }
      setSaveOpen(false);
      void load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save that page.");
    } finally {
      setSaving(false);
    }
  }

  async function openSlide(id: string) {
    try {
      const s = await api.get<{ title: string; strokes: Stroke[] }>(`/api/board/${id}`);
      setStrokes(s.strokes);
      setTitle(s.title);
      setOpenId(id);
      toast.success(`Opened “${s.title}”.`);
    } catch {
      toast.error("Couldn't open that page.");
    }
  }

  async function remove(id: string) {
    try {
      await api.del(`/api/board/${id}`);
      if (openId === id) clear();
      toast.success("Page deleted.");
      void load();
    } catch {
      toast.error("Couldn't delete that page.");
    }
  }

  const tools: { key: BoardTool; label: string; icon: typeof Pen }[] = [
    { key: "pen", label: "Pen", icon: Pen },
    { key: "highlighter", label: "Highlighter", icon: Highlighter },
    { key: "eraser", label: "Eraser", icon: Eraser },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Board"
        description="Write as you teach, then keep the page against the class it belongs to."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={clear}>
              <FilePlus2 className="size-4" /> New page
            </Button>
            <Button variant="outline" onClick={download} disabled={strokes.length === 0}>
              <Download className="size-4" /> PNG
            </Button>
            <Button onClick={() => setSaveOpen(true)} disabled={strokes.length === 0}>
              <Save className="size-4" /> {openId ? "Save page" : "Save as a page"}
            </Button>
          </div>
        }
      />

      <Card className="p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {tools.map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={tool === t.key ? "default" : "outline"}
              onClick={() => setTool(t.key)}
            >
              <t.icon className="size-4" /> {t.label}
            </Button>
          ))}
          <span className="mx-1 flex items-center gap-1">
            {BOARD_COLOURS.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-label={c.label}
                onClick={() => {
                  setColour(c.value);
                  if (tool === "eraser") setTool("pen");
                }}
                className={cn(
                  "size-6 rounded-full border-2 transition-transform",
                  colour === c.value && tool !== "eraser"
                    ? "border-foreground scale-110"
                    : "border-transparent",
                )}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </span>
          <Button size="sm" variant="ghost" onClick={undo} disabled={strokes.length === 0}>
            <Undo2 className="size-4" /> Undo
          </Button>
          <span className="text-muted-foreground ms-auto text-xs">
            {openId ? `Editing “${title}”` : "Unsaved page"} · {strokes.length} stroke
            {strokes.length === 1 ? "" : "s"}
          </span>
        </div>

        <div
          ref={wrapRef}
          className="relative h-[55vh] min-h-80 w-full overflow-hidden rounded-lg border bg-white"
        >
          <canvas
            ref={canvasRef}
            // `touch-none` so dragging draws instead of scrolling the page.
            className="size-full touch-none"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerLeave={up}
            onPointerCancel={up}
          />
        </div>
      </Card>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search saved pages…"
              className="pl-9"
            />
          </div>
          <Select value={meeting} onValueChange={(v) => setMeeting(v ?? ALL)}>
            <SelectTrigger className="w-56">
              <SelectValue>
                {(v) =>
                  !v || v === ALL
                    ? "Any class"
                    : (filters.meetings.find((m) => m.id === v)?.title ?? "Any class")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any class</SelectItem>
              {filters.meetings.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={batch} onValueChange={(v) => setBatch(v ?? ALL)}>
            <SelectTrigger className="w-48">
              <SelectValue>
                {(v) =>
                  !v || v === ALL
                    ? "Any batch"
                    : (filters.batches.find((b) => b.id === v)?.name ?? "Any batch")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any batch</SelectItem>
              {filters.batches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={course} onValueChange={(v) => setCourse(v ?? ALL)}>
            <SelectTrigger className="w-48">
              <SelectValue>
                {(v) =>
                  !v || v === ALL
                    ? "Any course"
                    : (filters.courses.find((c) => c.id === v)?.title ?? "Any course")
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any course</SelectItem>
              {filters.courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {slides.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No saved pages here yet.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {slides.map((s) => (
              <li key={s.id}>
                <Card className="flex items-start justify-between gap-2 p-3">
                  <button
                    type="button"
                    onClick={() => void openSlide(s.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-sm font-medium">{s.title}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {[s.meetingTitle, s.batchName, s.courseTitle].filter(Boolean).join(" · ") ||
                        "Not filed under a class"}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-[11px]">
                      {s.strokeCount} stroke{s.strokeCount === 1 ? "" : "s"} ·{" "}
                      {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
                    </p>
                  </button>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {openId === s.id && (
                      <Badge variant="secondary" className="text-[10px]">
                        Open
                      </Badge>
                    )}
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => void remove(s.id)}
                      aria-label={`Delete ${s.title}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save this page</DialogTitle>
            <DialogDescription>
              It is filed under whatever class, batch and course are chosen in the
              filters above, which is how you find it again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="board-title">Name</Label>
            <Input
              id="board-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ICD chapter 1 — worked examples"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving || !title.trim()}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
