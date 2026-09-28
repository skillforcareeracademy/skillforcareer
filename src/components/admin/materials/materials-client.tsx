"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Download,
  Eye,
  EyeOff,
  FileText,
  FolderTree,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import type { MaterialRow, MaterialStats } from "@/server/services/study-material-service";
import type { MaterialCategoryOption } from "@/server/services/material-category-service";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/**
 * Study material, as the academy manages it.
 *
 * Deliberately the quiz screen's twin: the same grouping, the same permanent
 * number beside a rearrangeable order, the same audience choice, the same
 * import and export. What is new is the reading column — who has opened a piece
 * and for how long — and the switch that lets a document be read without being
 * saved.
 */

const ALL = "__all";

interface CourseOption {
  id: string;
  title: string;
}
interface BatchOption {
  id: string;
  name: string;
}

interface FormState {
  id: string | null;
  title: string;
  description: string;
  courseId: string;
  categoryId: string;
  subCategoryId: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  body: string;
  downloadsEnabled: boolean;
  isPublished: boolean;
  batchIds: string[];
}

function blankForm(): FormState {
  return {
    id: null,
    title: "",
    description: "",
    courseId: "",
    categoryId: "",
    subCategoryId: "",
    fileUrl: "",
    fileName: "",
    mimeType: "",
    body: "",
    downloadsEnabled: true,
    isPublished: false,
    batchIds: [],
  };
}

function readable(seconds: number): string {
  if (seconds <= 0) return "—";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

export function MaterialsClient({
  materials,
  stats,
  categories,
  courses,
  batches,
  basePath,
}: {
  materials: MaterialRow[];
  stats: MaterialStats;
  categories: MaterialCategoryOption[];
  courses: CourseOption[];
  batches: BatchOption[];
  /** "/admin" or "/instructor" — the panel this is mounted in. */
  basePath: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [published, setPublished] = useState(ALL);
  const [sort, setSort] = useState<"sequence" | "newest" | "title" | "reads">("sequence");
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<MaterialRow | null>(null);
  const [moving, setMoving] = useState(false);
  const [readersOf, setReadersOf] = useState<MaterialRow | null>(null);
  const [readers, setReaders] = useState<
    { userId: string; name: string; email: string; opens: number; seconds: number; downloads: number }[]
  >([]);
  const [importing, setImporting] = useState(false);

  const parents = categories.filter((c) => !c.parentId);
  const childrenOf = (id: string) => categories.filter((c) => c.parentId === id);

  // Filtering and sorting happen here so the table reacts as you type; the
  // server does the same for the export and for a deep link.
  const rows = useMemo(() => {
    let list = materials;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          (m.categoryName ?? "").toLowerCase().includes(q) ||
          (m.courseTitle ?? "").toLowerCase().includes(q),
      );
    }
    if (category !== ALL) {
      list = list.filter((m) => m.categoryId === category || m.subCategoryId === category);
    }
    if (published !== ALL) {
      list = list.filter((m) => (published === "yes" ? m.isPublished : !m.isPublished));
    }
    const sorted = [...list];
    if (sort === "newest") sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (sort === "title") sorted.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === "reads") sorted.sort((a, b) => b.readSeconds - a.readSeconds);
    return sorted;
  }, [materials, search, category, published, sort]);

  const bySequence = sort === "sequence";
  const sameGroup = (a: MaterialRow, b: MaterialRow) =>
    (a.categoryId ?? "") === (b.categoryId ?? "") &&
    (a.subCategoryId ?? "") === (b.subCategoryId ?? "");

  async function upload(file: File | undefined) {
    if (!file || !form) return;
    const isImage = file.type.startsWith("image/");
    if (file.size > (isImage ? 5 : 25) * 1024 * 1024) {
      toast.error(isImage ? "Images must be under 5 MB." : "Files must be under 25 MB.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", isImage ? "image" : "doc");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Upload failed.");
      setForm((f) =>
        f
          ? {
              ...f,
              fileUrl: json.data.url as string,
              fileName: file.name,
              mimeType: file.type,
              title: f.title || file.name.replace(/\.[^.]+$/, ""),
            }
          : f,
      );
      toast.success(`${file.name} uploaded.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.fileUrl && !form.body.trim()) {
      toast.error("Upload a file or write the material in the panel.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        courseId: form.courseId,
        categoryId: form.categoryId,
        subCategoryId: form.subCategoryId,
        fileUrl: form.fileUrl,
        fileName: form.fileName,
        mimeType: form.mimeType,
        body: form.body,
        downloadsEnabled: form.downloadsEnabled,
        isPublished: form.isPublished,
        batchIds: form.batchIds,
      };
      if (form.id) {
        await api.patch(`/api/materials/${form.id}`, payload);
        toast.success("Material updated.");
      } else {
        await api.post("/api/materials", payload);
        toast.success("Material saved.");
      }
      setForm(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublished(m: MaterialRow) {
    try {
      await api.patch(`/api/materials/${m.id}/publish`, { isPublished: !m.isPublished });
      toast.success(m.isPublished ? "Hidden from learners." : "Published.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Action failed.");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await api.del(`/api/materials/${deleting.id}`);
      toast.success("Material deleted.");
      setDeleting(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delete failed.");
    }
  }

  /** Swap with a neighbour in the same group and renumber the whole group. */
  async function move(index: number, delta: number) {
    const to = index + delta;
    if (to < 0 || to >= rows.length || moving) return;
    if (!sameGroup(rows[index], rows[to])) return;

    const group = rows.filter((m) => sameGroup(m, rows[index]));
    const from = group.findIndex((m) => m.id === rows[index].id);
    const target = group.findIndex((m) => m.id === rows[to].id);
    const ids = group.map((m) => m.id);
    [ids[from], ids[target]] = [ids[target], ids[from]];

    setMoving(true);
    try {
      await api.patch("/api/materials/reorder", { ids });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't reorder.");
    } finally {
      setMoving(false);
    }
  }

  async function openReaders(m: MaterialRow) {
    setReadersOf(m);
    setReaders([]);
    try {
      const res = await api.get<{ readers: typeof readers }>(`/api/materials/${m.id}/readers`);
      setReaders(res.readers);
    } catch {
      toast.error("Couldn't load who has read it.");
    }
  }

  async function onImport(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/materials/import", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Import failed.");
      toast.success(json.data.message as string);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  const columns: Column<MaterialRow>[] = [
    {
      key: "number",
      header: "No.",
      className: "w-16",
      cell: (m) => <span className="text-muted-foreground text-sm tabular-nums">{m.number}</span>,
    },
    {
      key: "sequence",
      header: "Order",
      className: "w-28",
      cell: (m) => {
        const i = rows.indexOf(m);
        return (
          <div className="flex items-center gap-0.5">
            <span className="text-muted-foreground w-5 text-sm tabular-nums">{m.sequence}</span>
            {bySequence && (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={moving || i - 1 < 0 || !sameGroup(m, rows[i - 1])}
                  onClick={() => move(i, -1)}
                  aria-label={`Move ${m.title} up`}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={moving || i + 1 >= rows.length || !sameGroup(m, rows[i + 1])}
                  onClick={() => move(i, 1)}
                  aria-label={`Move ${m.title} down`}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
              </>
            )}
          </div>
        );
      },
    },
    {
      key: "title",
      header: "Material",
      cell: (m) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{m.title}</p>
          <p className="text-muted-foreground truncate text-xs">
            {[m.categoryName, m.subCategoryName].filter(Boolean).join(" → ") || "Ungrouped"}
            {m.courseTitle ? ` · ${m.courseTitle}` : ""}
            {m.batchNames.length ? ` · ${m.batchNames.join(", ")}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "kind",
      header: "Kind",
      className: "w-28",
      cell: (m) => (
        <Badge variant="secondary" className="text-[10px]">
          {m.fileUrl ? (m.fileName?.split(".").pop()?.toUpperCase() ?? "File") : "Written"}
        </Badge>
      ),
    },
    {
      key: "reads",
      header: "Read",
      className: "w-32",
      cell: (m) => (
        <button
          type="button"
          onClick={() => void openReaders(m)}
          className="hover:text-foreground text-left text-sm"
        >
          <span className="tabular-nums">{m.readers}</span>{" "}
          <span className="text-muted-foreground text-xs">
            {m.readers === 1 ? "learner" : "learners"}
          </span>
          <span className="text-muted-foreground block text-xs">{readable(m.readSeconds)}</span>
        </button>
      ),
    },
    {
      key: "downloads",
      header: "Downloads",
      className: "w-24",
      cell: (m) => (
        <Badge variant="secondary" className="text-[10px]">
          {m.downloadsEnabled ? "On" : "Off"}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "w-28",
      cell: (m) =>
        m.isPublished ? (
          <Badge
            variant="secondary"
            className="bg-emerald-100 text-[10px] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          >
            Published
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">
            Draft
          </Badge>
        ),
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      cell: (m) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" />}
            aria-label="Actions"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() =>
                setForm({
                  id: m.id,
                  title: m.title,
                  description: m.description ?? "",
                  courseId: m.courseId ?? "",
                  categoryId: m.categoryId ?? "",
                  subCategoryId: m.subCategoryId ?? "",
                  fileUrl: m.fileUrl ?? "",
                  fileName: m.fileName ?? "",
                  mimeType: m.mimeType ?? "",
                  body: "",
                  downloadsEnabled: m.downloadsEnabled,
                  isPublished: m.isPublished,
                  batchIds: m.batchIds,
                })
              }
            >
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void togglePublished(m)}>
              {m.isPublished ? (
                <>
                  <EyeOff className="size-4" /> Hide
                </>
              ) : (
                <>
                  <Eye className="size-4" /> Publish
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void openReaders(m)}>
              <Users className="size-4" /> Who has read it
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setDeleting(m)}
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Study material"
        description="The reading a course sets — grouped, numbered and assigned like your quizzes."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`${basePath}/material-groups`} />}
            >
              <FolderTree className="size-4" /> Groups
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/api/materials/export" prefetch={false} />}
            >
              <Download className="size-4" /> Export
            </Button>
            <Button variant="outline" render={<label />} nativeButton={false}>
              {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Import
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => void onImport(e.target.files?.[0])}
              />
            </Button>
            <Button onClick={() => setForm(blankForm())}>
              <Plus className="size-4" /> Add material
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Material" value={String(stats.total)} icon={FileText} tint="from-rose-500 to-pink-600" />
        <StatCard label="Published" value={String(stats.published)} icon={Eye} tint="from-emerald-500 to-teal-600" />
        <StatCard label="Documents" value={String(stats.withFile)} icon={BookOpen} tint="from-violet-500 to-purple-600" />
        <StatCard label="Reading records" value={String(stats.readers)} icon={Users} tint="from-sky-500 to-blue-600" />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(m) => m.id}
        emptyTitle="No study material yet"
        emptyDescription="Upload a PDF, a spreadsheet or a document — or write the reading straight into the panel."
        emptyIcon={FileText}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search material…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-56"
            />
            <Select value={category} onValueChange={(v) => setCategory(String(v))}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Every group</SelectItem>
                {parents.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
                {categories
                  .filter((c) => c.parentId)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {parents.find((p) => p.id === c.parentId)?.name} → {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select value={published} onValueChange={(v) => setPublished(String(v))}>
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any status</SelectItem>
                <SelectItem value="yes">Published</SelectItem>
                <SelectItem value="no">Draft</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(String(v) as typeof sort)}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sequence">Academy order</SelectItem>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="title">Title</SelectItem>
                <SelectItem value="reads">Most read</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* ── Add / edit ──────────────────────────────────────────────────── */}
      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit material" : "Add material"}</DialogTitle>
            <DialogDescription>
              A document, a spreadsheet, a PDF — or reading written here, which learners can
              highlight.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="m-title">Title</Label>
                <Input
                  id="m-title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-desc">What it covers</Label>
                <Textarea
                  id="m-desc"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Group</Label>
                  <Select
                    value={form.categoryId || ALL}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        categoryId: String(v) === ALL ? "" : String(v),
                        subCategoryId: "",
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Ungrouped" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Ungrouped</SelectItem>
                      {parents.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Sub-group</Label>
                  <Select
                    value={form.subCategoryId || ALL}
                    onValueChange={(v) =>
                      setForm({ ...form, subCategoryId: String(v) === ALL ? "" : String(v) })
                    }
                    disabled={!form.categoryId || childrenOf(form.categoryId).length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>None</SelectItem>
                      {childrenOf(form.categoryId).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Course</Label>
                  <Select
                    value={form.courseId || ALL}
                    onValueChange={(v) =>
                      setForm({ ...form, courseId: String(v) === ALL ? "" : String(v) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Any course" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Any course</SelectItem>
                      {courses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Batches</Label>
                  <Select
                    value={form.batchIds[0] ?? ALL}
                    onValueChange={(v) =>
                      setForm({ ...form, batchIds: String(v) === ALL ? [] : [String(v)] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Everyone on the course" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Everyone on the course</SelectItem>
                      {batches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>File</Label>
                {form.fileUrl ? (
                  <div className="bg-muted/50 flex min-w-0 items-center gap-2 rounded-lg px-3 py-2">
                    <FileText className="size-4 shrink-0" />
                    <a
                      href={form.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate text-sm hover:underline"
                    >
                      {form.fileName || "View the file"}
                    </a>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setForm({ ...form, fileUrl: "", fileName: "", mimeType: "" })}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <label className="hover:bg-accent/50 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
                    {uploading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Upload className="text-muted-foreground size-4" />
                    )}
                    <span className="text-muted-foreground">
                      {uploading ? "Uploading…" : "PDF, Word, Excel, PowerPoint, text or an image"}
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => void upload(e.target.files?.[0])}
                    />
                  </label>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="m-body">Or write it here</Label>
                <Textarea
                  id="m-body"
                  rows={6}
                  placeholder="Paste or type the reading. Learners can highlight this and keep their own notes against it."
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                />
                {form.id && (
                  <p className="text-muted-foreground text-xs">
                    Leave this empty to keep the text already saved.
                  </p>
                )}
              </div>

              {/* Neither a course nor a cohort means nobody is its audience —
                  the same rule quizzes follow, and worth saying out loud. */}
              {!form.courseId && form.batchIds.length === 0 && (
                <p className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                  Pick a course or a batch — material with neither reaches no learners.
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Allow downloads</p>
                    <p className="text-muted-foreground text-xs">
                      Off means read in the panel only.
                    </p>
                  </div>
                  <Switch
                    checked={form.downloadsEnabled}
                    onCheckedChange={(v) => setForm({ ...form, downloadsEnabled: Boolean(v) })}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Published</p>
                    <p className="text-muted-foreground text-xs">Visible to its learners.</p>
                  </div>
                  <Switch
                    checked={form.isPublished}
                    onCheckedChange={(v) => setForm({ ...form, isPublished: Boolean(v) })}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  {form.id ? "Save changes" : "Add material"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Who has read it ─────────────────────────────────────────────── */}
      <Sheet open={readersOf !== null} onOpenChange={(o) => !o && setReadersOf(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{readersOf?.title}</SheetTitle>
            <SheetDescription>
              {readers.length === 0
                ? "Nobody has opened this yet."
                : `${readers.length} learner${readers.length === 1 ? "" : "s"} have opened it.`}
            </SheetDescription>
          </SheetHeader>
          <ul className="divide-y px-4 pb-6">
            {readers.map((r) => (
              <li key={r.userId} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  <p className="text-muted-foreground truncate text-xs">{r.email}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm tabular-nums">{readable(r.seconds)}</p>
                  <p className="text-muted-foreground text-xs">
                    {r.opens} open{r.opens === 1 ? "" : "s"}
                    {r.downloads > 0 ? ` · ${r.downloads} download${r.downloads === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>

      {/* ── Delete ──────────────────────────────────────────────────────── */}
      <Dialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this material?</DialogTitle>
            <DialogDescription>
              &ldquo;{deleting?.title}&rdquo; and every learner&apos;s reading record and
              highlights on it go with it. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={() => void confirmDelete()}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
