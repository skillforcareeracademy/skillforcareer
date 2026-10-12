"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  BookMarked,
  Check,
  ChevronLeft,
  GripVertical,
  History,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Download,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { AudiencePicker } from "@/components/shared/audience-picker";
import { GroupField } from "@/components/admin/groups/group-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface Tab {
  id?: string;
  heading: string;
  description: string | null;
  parentId?: string | null;
  linkUrl?: string | null;
  linkLabel?: string | null;
  linkInApp?: boolean;
}
interface Curriculum {
  id: string;
  number: number;
  sequence: number;
  /** "SFCMCCC001" — the academy's own identifier. */
  curriculumId: string | null;
  title: string;
  year: string | null;
  isPublished: boolean;
  createdByName: string;
  updatedAt: string;
  tabs: Tab[];
  courseIds: string[];
  courseTitles: string[];
  batchIds: string[];
  batchNames: string[];
  changes: { id: string; summary: string; by: string | null; at: string }[];
}
interface Opt {
  id: string;
  title: string;
}
interface BatchOpt {
  id: string;
  name: string;
  courseTitle: string;
}

/** A section as the editor holds it: `parent` is a position, not an id. */
interface FormTab {
  heading: string;
  description: string;
  /** The index of the section this sits inside, or null for a top-level one. */
  parent: number | null;
  linkUrl: string;
  linkLabel: string;
  linkInApp: boolean;
}

interface FormState {
  title: string;
  year: string;
  isPublished: boolean;
  tabs: FormTab[];
  courseIds: string[];
  batchIds: string[];
}

const blankTab = (parent: number | null = null): FormTab => ({
  heading: "",
  description: "",
  parent,
  linkUrl: "",
  linkLabel: "",
  linkInApp: true,
});

const blank = (): FormState => ({
  title: "",
  year: String(new Date().getFullYear()),
  isPublished: true,
  tabs: [blankTab()],
  courseIds: [],
  batchIds: [],
});

/**
 * The academy's curriculums: written once, set for any number of courses and
 * batches, and shown to the learners on them. Every save is recorded and the
 * learners it reaches are told.
 */
export function CurriculumClient({
  curriculums,
  courses,
  batches,
  canManage,
}: {
  curriculums: Curriculum[];
  courses: Opt[];
  batches: BatchOpt[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(blank());
  const [saving, setSaving] = useState(false);
  /** Which section is being dragged, if any. */
  const [dragging, setDragging] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState<Curriculum | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * Read a sheet in. The file is posted as text and the server does the
   * parsing, so the same rules apply however the CSV arrives.
   */
  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const res = await api.post<{ message: string; errors: { row: number; message: string }[] }>(
        "/api/curriculums/import",
        { csv: await file.text() },
      );
      toast.success(
        res.errors.length > 0
          ? `${res.message} ${res.errors.length} row(s) skipped — row ${res.errors[0].row}: ${res.errors[0].message}`
          : res.message,
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't read that file.");
    } finally {
      setImporting(false);
    }
  }

  /**
   * Parent positions after the list has been rearranged.
   *
   * Every parent is an index, so inserting, removing or moving a section
   * invalidates all of them. Rather than patch each case by hand, the old
   * list is matched against the new one by object identity and the indices
   * are rewritten — a section object is never copied when it merely moves.
   */
  function reparent(
    next: FormTab[],
    previous: FormTab[],
    skip = -1,
  ): FormTab[] {
    return next.map((t, i) => {
      if (i === skip || t.parent == null) return t;
      const parentObject = previous[t.parent];
      const at = parentObject ? next.indexOf(parentObject) : -1;
      return { ...t, parent: at === -1 || at === i ? null : at };
    });
  }

  function patchTab(index: number, patch: Partial<FormTab>) {
    setForm((f) => ({
      ...f,
      tabs: f.tabs.map((t, j) => (j === index ? { ...t, ...patch } : t)),
    }));
  }

  /** Removing a section takes its subsections with it — they have no home. */
  function removeTab(index: number) {
    setForm((f) => {
      const doomed = new Set([index]);
      f.tabs.forEach((t, j) => {
        if (t.parent === index) doomed.add(j);
      });
      const kept = f.tabs.filter((_, j) => !doomed.has(j));
      return { ...f, tabs: reparent(kept, f.tabs) };
    });
  }

  /** Drop one section onto another. A subsection follows its parent. */
  function moveTab(from: number | null, to: number) {
    if (from === null || from === to) return;
    setForm((f) => {
      const moving = f.tabs[from];
      if (!moving) return f;
      // A whole section travels with the subsections filed under it.
      const block =
        moving.parent == null
          ? [from, ...f.tabs.map((t, j) => (t.parent === from ? j : -1))].filter(
              (j) => j >= 0,
            )
          : [from];
      const taken = block.map((j) => f.tabs[j]);
      const rest = f.tabs.filter((_, j) => !block.includes(j));
      const target = f.tabs[to];
      const at = rest.indexOf(target);
      const next = [...rest];
      next.splice(at === -1 ? next.length : at, 0, ...taken);
      return { ...f, tabs: reparent(next, f.tabs) };
    });
  }

  function startNew() {
    setEditingId("new");
    setForm(blank());
  }

  function startEdit(c: Curriculum) {
    setEditingId(c.id);
    setForm({
      title: c.title,
      year: c.year ?? "",
      isPublished: c.isPublished,
      // Parents come back as ids and go out as positions, so they are mapped
      // through the same ordered list the server sent.
      tabs:
        c.tabs.length > 0
          ? c.tabs.map((t) => ({
              heading: t.heading,
              description: t.description ?? "",
              parent: t.parentId
                ? (() => {
                    const at = c.tabs.findIndex((p) => p.id === t.parentId);
                    return at === -1 ? null : at;
                  })()
                : null,
              linkUrl: t.linkUrl ?? "",
              linkLabel: t.linkLabel ?? "",
              linkInApp: t.linkInApp ?? true,
            }))
          : [blankTab()],
      courseIds: c.courseIds,
      batchIds: c.batchIds,
    });
  }

  async function save() {
    setSaving(true);
    try {
      const body = {
        title: form.title,
        year: form.year || undefined,
        isPublished: form.isPublished,
        // Blank sections are dropped, so every parent position has to be
        // renumbered against what actually survives — otherwise a subsection
        // ends up inside whatever happens to sit at the old index.
        tabs: (() => {
          const keep = form.tabs
            .map((t, i) => ({ t, i }))
            .filter(({ t }) => t.heading.trim());
          const newIndex = new Map(keep.map(({ i }, at) => [i, at]));
          return keep.map(({ t }) => ({
            ...t,
            parent: t.parent == null ? null : (newIndex.get(t.parent) ?? null),
          }));
        })(),
        courseIds: form.courseIds,
        batchIds: form.batchIds,
      };
      const res =
        editingId === "new"
          ? await api.post<{ message: string }>("/api/curriculums", body)
          : await api.patch<{ message: string }>(`/api/curriculums/${editingId}`, body);
      toast.success(res.message);
      setEditingId(null);
      router.refresh();
    } catch (err) {
      const d =
        err instanceof ApiError ? (err.details as { issues?: { message: string }[] }) : undefined;
      toast.error(
        d?.issues?.[0]?.message ?? (err instanceof ApiError ? err.message : "Save failed."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function move(index: number, delta: number) {
    const to = index + delta;
    if (to < 0 || to >= curriculums.length || moving) return;
    const ids = curriculums.map((c) => c.id);
    [ids[index], ids[to]] = [ids[to], ids[index]];
    setMoving(true);
    try {
      await api.patch("/api/curriculums", { ids });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't reorder.");
    } finally {
      setMoving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/curriculums/${deleting.id}`);
      toast.success("Curriculum deleted.");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Curriculum"
        description="What each course covers, in the academy's own words. Learners on the courses and batches you choose see it in their panel."
        actions={
          canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                nativeButton={false}
                // A plain anchor: the response is a file, not a page.
                render={<a href="/api/curriculums/export" download />}
              >
                <Download className="size-4" /> Export
              </Button>
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}>
                {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Import
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={onImport}
              />
              <Button onClick={startNew}>
                <Plus className="size-4" /> New curriculum
              </Button>
            </div>
          ) : undefined
        }
      />

      {editingId !== null && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId === "new" ? "New curriculum" : "Edit curriculum"}</CardTitle>
            <CardDescription>
              Its number is fixed when it is created; the order in the list can be changed any time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
              <div className="space-y-1.5">
                <Label htmlFor="c-title">Title of curriculum</Label>
                <Input
                  id="c-title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Medical Coding — Foundation"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-year">Curriculum year</Label>
                <Input
                  id="c-year"
                  value={form.year}
                  onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                  placeholder="2026"
                />
              </div>
            </div>

            {/* The sections — heading and description, as many as needed. */}
            <div className="space-y-3">
              <Label>Sections</Label>
              {form.tabs.map((tab, i) => (
                <div
                  key={i}
                  // Dropping one section onto another is how the order is
                  // changed — "drag and drop krke rearrange krne ka option".
                  draggable
                  onDragStart={() => setDragging(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    moveTab(dragging, i);
                    setDragging(null);
                  }}
                  onDragEnd={() => setDragging(null)}
                  className={cn(
                    "space-y-2 rounded-xl border p-3 transition-colors",
                    // A subsection is stepped in, so the shape of the syllabus
                    // is visible at a glance rather than only on the heading.
                    tab.parent != null && "border-l-primary/40 ml-6 border-l-2",
                    dragging === i && "opacity-50",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing"
                      aria-hidden
                    >
                      <GripVertical className="size-4" />
                    </span>
                    <Input
                      value={tab.heading}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          tabs: f.tabs.map((t, j) =>
                            j === i ? { ...t, heading: e.target.value } : t,
                          ),
                        }))
                      }
                      placeholder={`Heading ${i + 1}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove section ${i + 1}`}
                      onClick={() => removeTab(i)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                  <Textarea
                    rows={3}
                    value={tab.description}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        tabs: f.tabs.map((t, j) =>
                          j === i ? { ...t, description: e.target.value } : t,
                        ),
                      }))
                    }
                    placeholder="What this section covers"
                  />

                  {/* Something to open from the section. Kept inside the panel
                      by default — "link daalne ka option which should open in
                      LMS only" — with the way out available when the academy
                      means to send the learner somewhere else. */}
                  <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
                    <Input
                      value={tab.linkUrl}
                      onChange={(e) => patchTab(i, { linkUrl: e.target.value })}
                      placeholder="Link (optional) — a recording, a sheet, a reference"
                      className="font-mono text-xs"
                    />
                    <Input
                      value={tab.linkLabel}
                      onChange={(e) => patchTab(i, { linkLabel: e.target.value })}
                      placeholder="Button text"
                    />
                  </div>
                  {tab.linkUrl.trim() !== "" && (
                    <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-xs">
                      <Checkbox
                        checked={tab.linkInApp}
                        onCheckedChange={(v: boolean) =>
                          patchTab(i, { linkInApp: Boolean(v) })
                        }
                      />
                      Open inside the panel rather than a new tab
                    </label>
                  )}

                  {/* Only one level deep: a syllabus that nests further is a
                      syllabus nobody can read on a phone. */}
                  {tab.parent == null ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setForm((f) => {
                          const tabs = [...f.tabs];
                          tabs.splice(i + 1, 0, blankTab(i));
                          return { ...f, tabs: reparent(tabs, f.tabs, i + 1) };
                        })
                      }
                    >
                      <Plus className="size-4" /> Add a subsection
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => patchTab(i, { parent: null })}
                    >
                      <ChevronLeft className="size-4" /> Make it a section
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setForm((f) => ({ ...f, tabs: [...f.tabs, blankTab()] }))
                }
              >
                <Plus className="size-4" /> Add section
              </Button>
            </div>

            {/* Folders, so a batch can be handed a whole set of curriculums. */}
            {editingId && editingId !== "new" && (
              <GroupField kind="CURRICULUM" itemId={editingId} />
            )}

            <AudiencePicker
              label="Courses this is for"
              emptyMeans="No course chosen — nobody sees it yet."
              searchPlaceholder="Search courses…"
              options={courses.map((c) => ({ id: c.id, label: c.title }))}
              selected={form.courseIds}
              onChange={(ids) => setForm((f) => ({ ...f, courseIds: ids }))}
              maxHeight="11rem"
            />
            <AudiencePicker
              label="Batches this is for"
              emptyMeans="No batch chosen — the courses above decide who sees it."
              searchPlaceholder="Search batches…"
              options={batches.map((b) => ({ id: b.id, label: b.name, hint: b.courseTitle }))}
              selected={form.batchIds}
              onChange={(ids) => setForm((f) => ({ ...f, batchIds: ids }))}
              maxHeight="11rem"
            />

            <label className="flex items-center justify-between gap-4 text-sm">
              <span>Visible to learners</span>
              <Switch
                checked={form.isPublished}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isPublished: v }))}
              />
            </label>

            <div className="flex gap-2">
              <Button onClick={save} disabled={saving || form.title.trim().length < 3}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Save curriculum
              </Button>
              <Button variant="outline" onClick={() => setEditingId(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {curriculums.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="No curriculum yet"
          description="Write one, set it for a course or a batch, and the learners on it will see it."
        />
      ) : (
        <div className="space-y-4">
          {curriculums.map((c, i) => (
            <Card key={c.id}>
              <CardContent className="space-y-3 py-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      <span className="text-muted-foreground text-sm">{c.sequence}.</span>
                      {c.title}
                      {/* The academy's identifier — quoted on paperwork, and
                          fixed however the list is rearranged. */}
                      <Badge variant="secondary" className="text-[10px] font-normal tabular-nums">
                        {c.curriculumId ?? `No. C${c.number}`}
                      </Badge>
                      {c.year && (
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          {c.year}
                        </Badge>
                      )}
                      {!c.isPublished && (
                        <Badge variant="secondary" className="bg-muted text-muted-foreground text-[10px]">
                          Hidden
                        </Badge>
                      )}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {c.tabs.length} section{c.tabs.length === 1 ? "" : "s"} · by {c.createdByName} ·
                      updated {new Date(c.updatedAt).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={moving || i === 0}
                        onClick={() => move(i, -1)}
                        aria-label={`Move ${c.title} up`}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={moving || i === curriculums.length - 1}
                        onClick={() => move(i, 1)}
                        aria-label={`Move ${c.title} down`}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => startEdit(c)} aria-label="Edit">
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                        onClick={() => setDeleting(c)}
                        aria-label="Delete"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {c.courseTitles.map((t) => (
                    <Badge key={t} variant="secondary" className="text-[10px] font-normal">
                      {t}
                    </Badge>
                  ))}
                  {c.batchNames.map((b) => (
                    <Badge key={b} variant="secondary" className="text-[10px] font-normal">
                      {b}
                    </Badge>
                  ))}
                  {c.courseTitles.length === 0 && c.batchNames.length === 0 && (
                    <span className="text-muted-foreground text-xs">Not set for anyone yet</span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setHistoryFor(historyFor === c.id ? null : c.id)}
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs"
                >
                  <History className="size-3.5" />
                  {historyFor === c.id ? "Hide changes" : `Changes (${c.changes.length})`}
                </button>
                {historyFor === c.id && (
                  <ul className="bg-muted/40 space-y-1 rounded-lg p-3 text-xs">
                    {c.changes.length === 0 ? (
                      <li className="text-muted-foreground">Nothing recorded yet.</li>
                    ) : (
                      c.changes.map((ch) => (
                        <li key={ch.id}>
                          <span className="text-muted-foreground">
                            {new Date(ch.at).toLocaleString("en-IN")}
                            {ch.by ? ` · ${ch.by}` : ""} —{" "}
                          </span>
                          {ch.summary}
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the curriculum, its sections and its history. Learners will no longer see it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
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
